/**
 * 兼容性闸门核查：用 dsh 的判定逻辑在本机复核本包的 manifest 是否会被插件闸门拦截。
 *
 * 门禁规则（dsh-app-boot/evaluatePluginCompatibility，0.2.1-rc.1 起；0.2.1-rc.2 未改动）：
 *   1. manifest 若声明了 `engines.dsh`，则**最先且只查它**（peerDependencies 随之忽略）；
 *   2. 未声明时才逐项检查 peerDependencies 里名字为 `@deepseek-ai/dsh` 或以
 *      `@deepseek-ai/dsh-` 开头的项；
 *   3. 判定一律用 semver.satisfies(runtime, range, { includePrerelease: true })；
 *   4. 任何一项不满足 ⇒ profile 加载时跳过整个 bundle（0.2.0-rc.x 的旧闸门不查 engines.dsh）。
 *
 * 本包 0.2.0-rc.1.1 曾把 engines.dsh 写成精确版本 `0.2.0-rc.1`：在忽略 engines 的
 * 0.2.0.x 上能加载，到 0.2.1-rc.1 就被闸门拦下；0.2.1-rc.2 上同样会报
 * `is incompatible with dsh 0.2.1-rc.2` 并跳过整个 bundle（rc2 的安装预检也会直接拒绝安装）。
 * 0.2.1-rc.1.1 起 engines.dsh 是 `^0.2.0-rc.1`，覆盖 0.2.1-rc.2 —— 这个测试就是防止再犯。
 *
 * 用法：node tests/compat.mjs [runtimeVersion]
 */
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const runtime = process.argv[2] ?? '0.2.1-rc.2'

// 本机不带 semver 依赖，用最小实现覆盖本包会出现的范围形态（^x.y.z-prerelease / 精确版本）。
function satisfies(version, range) {
  const parse = (text) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(String(text).trim())
    if (match === null) return null
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] ?? null }
  }
  const target = parse(version)
  const trimmed = String(range).trim()
  const caret = trimmed.startsWith('^')
  const lower = parse(trimmed.replace(/^\^/, ''))
  if (target === null || lower === null) return null // 判不了的形态由调用方记为失败
  if (caret) {
    if (target.major !== lower.major) return false
    // includePrerelease：同 major 下，rc 阶段的版本视为满足 ^ 范围。
    if (target.minor < lower.minor) return false
    if (target.minor === lower.minor && target.patch < lower.patch) return false
    return true
  }
  // 精确版本：逐位相等才算满足。
  return target.major === lower.major && target.minor === lower.minor
    && target.patch === lower.patch && (target.pre ?? null) === (lower.pre ?? null)
}

const enginesDsh = manifest.engines?.dsh
const peers = manifest.peerDependencies ?? {}
const gateUsesEngines = typeof enginesDsh === 'string'

console.log(`包版本      ${manifest.version}`)
console.log(`engines.dsh ${enginesDsh}${gateUsesEngines ? '（0.2.1-rc.1 起参与门禁且优先；0.2.1-rc.2 规则相同）' : '（仅元数据，不参与门禁）'}`)
console.log(`运行时      ${runtime}`)
console.log(`受门禁的 peer：${gateUsesEngines ? '（engines.dsh 存在，peer 被忽略）' : Object.entries(peers).filter(([n]) => n.startsWith('@deepseek-ai/dsh')).map(([n, r]) => `${n}@${r}`).join(', ') || '（无）'}`)

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failed += 1
}

console.log('\n[闸门判定]')
if (gateUsesEngines) {
  check('engines.dsh 是 ^ 范围而不是精确版本（精确版本会在下一个 rc 被闸门拦下）',
    enginesDsh.startsWith('^'), enginesDsh)
} else {
  const unmet = Object.entries(peers)
    .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
    .filter(([, range]) => satisfies(runtime, range) !== true)
  check('所有 @deepseek-ai/dsh* peer 覆盖目标运行时', unmet.length === 0, JSON.stringify(unmet))
}

console.log('\n[范围覆盖新旧运行时]')
for (const candidate of [...new Set(['0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-rc.1', '0.2.1-rc.2', runtime])]) {
  const ok = satisfies(candidate, enginesDsh)
  check(`engines.dsh ${enginesDsh} 覆盖 ${candidate}`, ok === true, String(ok))
}

console.log(`\n===== ${failed === 0 ? '全部通过' : `${failed} 项未通过`} =====`)
process.exit(failed === 0 ? 0 : 1)
