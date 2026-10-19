/**
 * 真机 smoke：把本包打出的 tarball 装进隔离 DSH_HOME 的临时 profile，boot 一次，
 * 用探针插件证明两件事：
 *   1. 本包已在 ctx.web 上注册了 provider `bocha`（再次注册会被 WEB_DUPLICATE_PROVIDER 拒绝）；
 *   2. web 服务选中的确实是 bocha（缺 BOCHA_API_KEY 时得到 Bocha 的
 *      WEB_PROVIDER_CREDENTIAL_MISSING，而不是 DeepSeek 相关错误）。
 *
 * 同时用 `--dump-config` 断言 bundle patch 在 rc2 的组合结果里生效：
 * 存在 `- id: web-search-bocha`、`web` 行是 `searchProvider: bocha`、没有 `is incompatible`。
 *
 * 这里只用 Node 内置模块，不引入任何 npm 依赖。没有可用 DSH 运行时时打印 SKIP 并 exit 0
 * （所以它不会成为 CI 必须项）；有运行时才做真机验证。
 *
 * 前置：先在仓库根执行 `pnpm pack`，产出 `lyw-dsh-web-search-bocha-<version>.tgz`。
 * 运行：`node tests/load.mjs`
 * 覆盖：`DSH_EXE=<exe> DSH_ASAR=<app.asar> DSH_BIN=<bin.js>`、`BOCHA_LOAD_DSH_HOME=<dir>`。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const tarball = path.join(repoRoot, `lyw-dsh-web-search-bocha-${manifest.version}.tgz`)

const exe = process.env.DSH_EXE ?? 'D:\\DSH Desktop\\DeepSeek Harness.exe'
const asar = process.env.DSH_ASAR ?? 'D:\\DSH Desktop\\resources\\app.asar'
const bin = process.env.DSH_BIN
  ?? path.join(asar, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

// bin.js 位于 app.asar 内：普通 fs 看不到它，只有 Electron 运行时能按 asar 虚拟路径读取，
// 所以这里只检查 exe 与 asar 文件是否存在。
if (!existsSync(exe) || !existsSync(asar)) {
  console.log('SKIP 没有可用的 DSH 运行时（用 DSH_EXE / DSH_ASAR / DSH_BIN 指定）。')
  console.log(`      exe: ${exe}${existsSync(exe) ? '' : '（不存在）'}`)
  console.log(`      asar: ${asar}${existsSync(asar) ? '' : '（不存在）'}`)
  process.exit(0)
}
if (!existsSync(tarball)) {
  console.error(`FAIL 找不到 tarball：${tarball}`)
  console.error('     先在仓库根执行 `pnpm pack`，再运行本测试。')
  process.exit(1)
}

const dshHome = process.env.BOCHA_LOAD_DSH_HOME
  ?? path.join(tmpdir(), `dsh-compat-bocha-${process.pid}`)
const reportPath = path.join(dshHome, 'probe-report.json')
const probePath = path.join(dshHome, 'compat-bocha-probe.mjs')
const overlayPath = path.join(dshHome, 'compat-bocha-probe.yml')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 子进程环境：隔离 DSH_HOME，强制 Electron 以 Node 运行，清掉会改变选中的环境变量。 */
const childEnv = {
  ...process.env,
  ELECTRON_RUN_AS_NODE: '1',
  DSH_HOME: dshHome,
  DSH_TELEMETRY_DISABLED: '1',
  BOCHA_PROBE_OUTPUT: reportPath,
}
for (const key of [
  'BOCHA_API_KEY',
  'DEEPSEEK_API_KEY',
  'DSH_WEB_SEARCH_PROVIDER',
  'DSH_WEB_FETCH_PROVIDER',
]) delete childEnv[key]

const probeSource = `import { writeFileSync } from 'node:fs'

export const name = 'compat-bocha-probe'
export const inject = ['web']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function apply(ctx) {
  const output = process.env.BOCHA_PROBE_OUTPUT
  const report = { registration: undefined, search: undefined }
  // 轮询等待 web-search-bocha 注册完成：provider 注册顺序不受 Loader 保证。
  const duplicate = { id: 'bocha', available() { return true }, async search() { return { sources: [], truncated: false } } }
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const dispose = ctx.web.registerSearchProvider(duplicate)
      dispose()
    } catch (error) {
      report.registration = {
        duplicateRejected: true,
        code: error?.code,
        name: error?.constructor?.name,
        message: error?.message,
      }
      break
    }
    await sleep(25)
  }
  if (report.registration === undefined) report.registration = { duplicateRejected: false, timedOut: true }
  try {
    const result = await ctx.web.search({ query: 'bocha compat probe', maxResults: 1 })
    report.search = { ok: true, sourceCount: result.sources.length }
  } catch (error) {
    report.search = {
      ok: false,
      code: error?.code,
      name: error?.constructor?.name,
      message: error?.message,
    }
  }
  writeFileSync(output, JSON.stringify(report, null, 2))
}
`

const overlaySource = `# 探针插件只存在于本次真机验证：boot 进程结束后随临时 DSH_HOME 一起删除。
- insert:
    - id: compat-bocha-probe
      name: ./compat-bocha-probe.mjs
`

let checks = 0
let failures = 0
function check(name, ok, detail = '') {
  checks += 1
  if (!ok) failures += 1
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || detail === '' ? '' : ` — ${detail}`}`)
}

/** 运行一次 dsh CLI，返回 { code, stdout, stderr, timedOut }。 */
function runDsh(args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(exe, [bin, ...args], { env: childEnv, windowsHide: true })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: `${stderr}\n${String(error)}`, timedOut })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stdout, stderr, timedOut })
    })
  })
}

/** 启动 profile，等探针写出报告（或超时）后结束进程。 */
async function bootWithProbe(timeoutMs) {
  const child = spawn(exe, [
    bin, '--profile', 'compat', '--patch', overlayPath, '--no-open', '--port', '0',
  ], { env: childEnv, windowsHide: true })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && !existsSync(reportPath)) await sleep(200)
  // 让写文件的后续落盘完成，再结束整个进程树。
  if (existsSync(reportPath)) await sleep(300)
  child.kill()
  await sleep(500)
  return { stdout, stderr }
}

console.log(`DSH 运行时   ${exe}`)
console.log(`bin          ${bin}`)
console.log(`tarball      ${tarball}`)
console.log(`隔离 DSH_HOME ${dshHome}`)

try {
  rmSync(dshHome, { recursive: true, force: true })
  mkdirSync(dshHome, { recursive: true })
  writeFileSync(probePath, probeSource)
  writeFileSync(overlayPath, overlaySource)

  console.log('\n[1/4] 生成临时 profile（--from-default-profile web）')
  const init = await runDsh(['--profile', 'compat', '--from-default-profile', 'web', '--dump-config'], 120_000)
  check('模板 profile 生成成功', init.code === 0, `exit=${String(init.code)} ${init.stderr.slice(0, 300)}`)
  check('模板组合未报 is incompatible', !/is incompatible/.test(init.stderr), init.stderr.slice(0, 300))

  console.log('\n[2/4] 安装真实 tarball（dsh plugin add）')
  const add = await runDsh(['plugin', '--profile', 'compat', 'add', tarball], 240_000)
  const addOutput = `${add.stdout}\n${add.stderr}`
  check('dsh plugin add 成功', add.code === 0, `exit=${String(add.code)} ${add.stderr.slice(0, 500)}`)
  check('安装预检未拒绝本包', !/installation rejected|is incompatible/.test(addOutput),
    addOutput.split('\n').find((line) => /installation rejected|is incompatible/.test(line)) ?? '')

  console.log('\n[3/4] 检查组合后的 profile（--dump-config）')
  const dump = await runDsh(['--profile', 'compat', '--dump-config'], 120_000)
  check('--dump-config 成功', dump.code === 0, `exit=${String(dump.code)} ${dump.stderr.slice(0, 300)}`)
  check('存在 - id: web-search-bocha 行', /^- id: web-search-bocha$/m.test(dump.stdout))
  check('web 行选中 searchProvider: bocha', /^    searchProvider: bocha$/m.test(dump.stdout))
  check('组合输出无 is incompatible', !/is incompatible/.test(dump.stdout))
  check('stderr 无 profile bundle 被跳过', !/skipping profile bundle/.test(dump.stderr), dump.stderr.slice(0, 400))

  console.log('\n[4/4] boot + 探针（证明 provider 已注册且被选中）')
  const boot = await bootWithProbe(45_000)
  const reportExists = existsSync(reportPath)
  check('探针写出结果文件（45s 内）', reportExists)
  check('boot stderr 无 is incompatible', !/is incompatible/.test(boot.stderr), boot.stderr.slice(0, 600))
  check('boot stderr 无 loader import 失败', !/failed to import/.test(boot.stderr), boot.stderr.slice(0, 600))
  check('boot stdout 启动 Web 服务（dsh web:）', /dsh web:/.test(boot.stdout), boot.stdout.slice(0, 300))

  if (reportExists) {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))
    console.log(`    探针报告: ${JSON.stringify(report)}`)
    check('provider `bocha` 已注册（重复注册被拒绝）', report.registration?.duplicateRejected === true)
    check('重复注册返回 WEB_DUPLICATE_PROVIDER', report.registration?.code === 'WEB_DUPLICATE_PROVIDER',
      String(report.registration?.code))
    check('web.search 选中 bocha 并报缺凭据', report.search?.ok === false
      && report.search?.code === 'WEB_PROVIDER_CREDENTIAL_MISSING', JSON.stringify(report.search))
    check('错误信息指向 Bocha（而非 DeepSeek）', /bocha/i.test(report.search?.message ?? ''),
      String(report.search?.message))
  }

  console.log(`\n===== ${failures === 0 ? `真机验证全部通过（${checks} 项）` : `${failures}/${checks} 项未通过`} =====`)
} finally {
  rmSync(dshHome, { recursive: true, force: true })
}

process.exit(failures === 0 ? 0 : 1)
