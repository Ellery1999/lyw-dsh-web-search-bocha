# dsh-web-search-bocha

[English](README.md) | 中文

[![Release](https://img.shields.io/github/v/release/Ellery1999/lyw-dsh-web-search-bocha?label=download&sort=semver)](https://github.com/Ellery1999/lyw-dsh-web-search-bocha/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![dsh](https://img.shields.io/badge/dsh-0.2.0--rc.1-informational)

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 接入 [博查 Web Search](https://open.bocha.cn/) 的搜索后端 —— 让 `web_search` 工具在 **dsh 0.2.0-rc.1** 上真正可用，使用国内合规、无需 DeepSeek key 的搜索服务。

> **这是博查官方插件的兼容性适配版（fork）。**
> 基于博查官方发布的 [`@bocha-ai/dsh-web-search-bocha`](https://www.npmjs.com/package/@bocha-ai/dsh-web-search-bocha) 0.1.0。上游包在当前 dsh 上无法加载，本适配版只移除了那一个不兼容依赖，其余代码原样保留。详见[为什么要做这个适配版](#为什么要做这个适配版)。

## 解决什么问题

dsh 默认把 `web_search` 路由到 DeepSeek 自带的搜索后端，需要 `DEEPSEEK_API_KEY`。如果你用第三方模型服务商跑 dsh（很常见），就没有这个 key，于是每次搜索都失败：

```
Error: DeepSeek search has no API key for "DEEPSEEK_API_KEY"
```

本插件把这个后端换成博查。你能拿到国内合规的搜索结果（标题、链接、发布时间），并且改用博查 key，而不是 DeepSeek key。

## 特性

- 在 dsh 的 `ctx.web` 上注册提供方 ID `bocha`，现有 `web_search` 工具自动路由过去，无需改动任何工具。
- 把博查的 `webPages[].name` / `summary` / `datePublished` 映射到 Harness 的可移植来源类型。
- 每次搜索都通过凭据服务解析 API key —— 换 key 后下一次请求就生效，无需重启。
- 结果数量限制、引用渲染、提供方选择和错误呈现仍由 dsh 负责。
- 无需构建：直接提供纯 ESM 产物。
- 支持 `maxResults`，并按博查公布的上限 50 截断。

## 环境要求

| 项目 | 版本 |
|---|---|
| DeepSeek Harness | **0.2.0-rc.1**（已实测） |
| Node.js | `^22.19.0` 或 `>=24.0.0` |
| 博查 API Key | 来自 [open.bocha.cn](https://open.bocha.cn/) |

## 安装

### 1. 获取插件

```sh
git clone https://github.com/Ellery1999/lyw-dsh-web-search-bocha.git
```

### 2. 装进你的 Profile

**如果你用 dsh 的 Web 界面**，最省事的是 [Releases 页](https://github.com/Ellery1999/lyw-dsh-web-search-bocha/releases/latest) 上预打包好的 tarball：

1. 下载 `lyw-dsh-web-search-bocha-<version>.tgz`。
2. 打开 **设置 → 插件 → 添加插件**。
3. 填入该 `.tgz` 的**绝对路径**并安装。

tarball 会解压成真实文件，因此绕开了下面说的 link/junction 陷阱。**不要**把同一个输入框指向解压后的源码**目录**。

更习惯命令行的话，选下面任一种。

<details open>
<summary><b>方式 A —— dsh CLI</b></summary>

```sh
dsh plugin --profile <你的profile> add /absolute/path/to/lyw-dsh-web-search-bocha
```

把 `<你的profile>` 换成实际名称（`desktop`、`web`、`tui` 等）。插件声明了 `dsh.bundle`，CLI 会同时把它加进 Profile 的 bundle 列表。

CLI 也可以直接吃 tarball：

```sh
dsh plugin --profile <你的profile> add /absolute/path/to/lyw-dsh-web-search-bocha-<version>.tgz
```

</details>

<details>
<summary><b>方式 B —— 直接用 pnpm，vendor 到 Profile 内部</b></summary>

这是作者自己桌面端 Profile 采用的布局，能经受 `pnpm install` 而不被改成 junction：

```sh
mkdir -p ~/.dsh/profiles/<你的profile>/vendor
cp -r /absolute/path/to/lyw-dsh-web-search-bocha ~/.dsh/profiles/<你的profile>/vendor/
```

然后在 `~/.dsh/profiles/<你的profile>/package.json` 里加：

```json
{
  "dependencies": {
    "@lyw/dsh-web-search-bocha": "file:vendor/dsh-web-search-bocha"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@lyw/dsh-web-search-bocha"
      ]
    }
  }
}
```

最后在 Profile 目录里执行 `pnpm install`。

</details>

### 3. 把搜索指向博查并加插件行

追加到 `~/.dsh/profiles/<你的profile>/cordis.patch.yml`：

```yaml
- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: bocha

- id: web-search-bocha
  name: "@lyw/dsh-web-search-bocha"
  config:
    apiKeyEnv: BOCHA_API_KEY
    freshness: noLimit
    summary: true
    count: 10
```

> 插件自带的 bundle patch 已经设置了 `searchProvider: bocha` 并插入了该行。这里再写一遍，是为了把选择固定在你的顶层用户层，避免 bundle 变动时被覆盖。

### 4. 存入博查 Key

写进 `~/.dsh/.credentials.yaml`：

```yaml
BOCHA_API_KEY: your-api-key
```

POSIX 上请限制文件权限：

```sh
chmod 600 ~/.dsh/.credentials.yaml
```

<details>
<summary>备选：环境变量</summary>

适用于 CI、容器或临时覆盖。启动 dsh 前导出：

```sh
export BOCHA_API_KEY='your-api-key'
```

两者都配置时，继承的环境变量优先于凭据文档。

</details>

### 5. 重启 dsh

搜索即走博查。让 agent 随便搜点东西即可验证。

## ⚠️ 安装陷阱

有两个坑耗费了实际调试时间，症状相同：插件静默不激活。

### 陷阱 1 —— 绝不要用 link 或 junction 安装

`link:` / junction / 符号链接安装会解析到**真实路径，落在 Profile 目录之外**。dsh 加载器只为 Profile 树**之内**的导入路径路由 peer 模块（`@deepseek-ai/*`），因此链接安装会失败：

```
dsh: warning: 1 entry did not activate
web-search-bocha (@lyw/dsh-web-search-bocha): failed to import
```

这就是上面各安装方式采用复制或解压、而非链接的原因。具体如下：

| 你填入的内容 | 实际安装形态 | 安全？ |
|---|---|---|
| npm 包名 | 拉取并解包 | ✅ |
| GitHub 仓库地址 | clone | ✅ |
| **`.tgz` 压缩包** | 解包 | ✅ |
| **本地源码*目录*** | `link:` → junction | ❌ **会失败** |

所以在 Web UI 的**添加插件**对话框里，请填 `.tgz`，**绝不要填解压后的源码目录**。任何经由符号链接解析的路径都会踩到这个坑。

确认装成了真实目录（`LinkType` 必须为空）：

```powershell
Get-Item "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules\@lyw\dsh-web-search-bocha" -Force |
  Select-Object LinkType
```

### 陷阱 2 —— Web UI 里没有这个插件的配置页

博查官方插件当年通过 `dsh-settings` 注册了设置页。该 API 在 dsh 0.2.0-rc.1 上已不存在，配置页现在由客户端 slot 注册产生。本适配版不含客户端半包，所以**界面上没有配置页**，插件在 **设置 → 插件** 里只有一个启用开关。

请通过 Profile patch 配置（[第 3 步](#3-把搜索指向博查并加插件行)）并重启。这也正是官方插件自己文档对第三方搜索设置推荐的方式。

## 配置项

在 `cordis.patch.yml` 的 `web-search-bocha` 行里设置。

| 配置键 | 默认值 | 含义 |
|---|---|---|
| `apiKey` | — | 博查密钥字面值。settings 描述会脱敏，但仍建议用 `apiKeyEnv`，避免明文密钥进入 Profile patch。 |
| `apiKeyEnv` | `BOCHA_API_KEY` | 每次搜索经凭据服务解析的引用名。 |
| `baseURL` | `https://api.bocha.cn` | API 基址；自动追加 `/v1/web-search`。 |
| `freshness` | `noLimit` | 每次搜索发送的时间过滤：`noLimit`、`oneDay`、`oneWeek`、`oneMonth`、`oneYear`，或 `2025-04-06` 这样的单日，或 `2025-01-01..2025-04-06` 这样的区间。 |
| `summary` | `true` | 请求博查返回较长的逐页摘要（用作 snippet）。 |
| `count` | `10` | 请求不含 `maxResults` 时的默认条数；1–50 的整数。 |

请求里的 `maxResults` 会覆盖 `count`，两者都会在发送前按博查上限 50 截断。

## 验证安装

让 agent 执行一次搜索，或检查组合后的 Profile：

```sh
dsh --profile <你的profile> --dump-config
```

应能看到 `web` 行下的 `searchProvider: bocha`，以及一行 `web-search-bocha`。

## 卸载

```sh
dsh plugin --profile <你的profile> remove @lyw/dsh-web-search-bocha
```

再删掉你加进 `cordis.patch.yml` 的那两行。`web_search` 会回退到之前的提供方选择。

## 工作原理

提供方调用博查的 `POST /v1/web-search`，并把响应映射到 dsh 的可移植来源类型：`url` → `source.url`，`name` → `title`，`summary`（缺失时回退 `snippet`）→ `snippet`，`datePublished` → `publishedAt`。没有非空 URL 的条目会被丢弃。该端点不返回单一生成答案，因此 `WebSearchResult.content` 留空。

失败以带机器可路由码的 `WebError` 呈现：缺少凭据是 `WEB_PROVIDER_CREDENTIAL_MISSING`，取消是 `WEB_ABORTED`，HTTP 错误、提供方声明的非 200 码、网络失败和无法解析的响应体是 `WEB_PROVIDER_ERROR`（有 `log_id` 时会保留）。重定向会在访问目标之前被拒绝。

## 为什么要做这个适配版

上游 `@bocha-ai/dsh-web-search-bocha@0.1.0` 声明 `@deepseek-ai/dsh-settings: ^0.1.0-rc.5`，并从中导入两个具名导出：

```js
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
```

`dsh-settings` 在 **0.1.2-rc.1 中移除了这两者**，改为 `SettingsForms` 服务（`ctx.settings`）。对照已发布构建实测：

| `dsh-settings` | `installSettingsSection` / `settingsNamespace` |
|---|---|
| 0.1.0-rc.2 … 0.1.1-rc.2 | 存在 |
| **0.1.2-rc.1 起（含 0.1.5.x、0.1.7-rc.2、0.2.0-rc.1）** | **已移除** |

ESM 在模块链接阶段解析具名导入，缺失的导出是**硬性 `SyntaxError`**，try/catch 拦不住。该插件行会以 `failed to import` 失败，提供方永远不会注册。声明的 peer 范围 `^0.1.0-rc.5` 挡不住，因为它允许 `0.2.0` 以下任意版本。

### 改动内容

共三处，全部限于 `lib/index.js`：

1. 完全移除 `@deepseek-ai/dsh-settings` 导入。
2. 从 `apply()` 中移除 `installSettingsSection(...)` 调用。配置现在直接传给提供方，不再经过由设置驱动的 `current()` 间接层。
3. `WEB_SEARCH_BOCHA_SETTINGS_NAMESPACE` 改为普通字符串字面量，不再调用 `settingsNamespace(...)`。

`BochaSearchProvider`、`Config` schema、结果映射与错误处理**与上游逐字节一致**。唯一的行为差异是没有图形界面配置页。

## 开发

本包直接提供预构建的纯 ESM 产物，没有编译步骤。改完 `lib/index.js` 后，重新加载模块并对桩 context 调用 `apply()`：

```sh
node --input-type=module -e "
import { BochaSearchProvider } from './lib/index.js'
const p = new BochaSearchProvider(() => ({
  apiKey: process.env.BOCHA_API_KEY,
  baseURL: 'https://api.bocha.cn', freshness: 'noLimit', summary: true, count: 3,
}))
console.log(await p.search({ query: 'DeepSeek Harness', maxResults: 3 }))
"
```

若用方式 A/B 装的是复制副本，改完需重新复制，Profile 才能看到改动，然后重启 dsh。

## 兼容性说明

- 仅在 **dsh 0.2.0-rc.1** 上实测。
- dsh 0.2.0-rc.1 新增了插件兼容性闸门：`dsh-app-boot` 会用 `semver.satisfies(runtime, range, { includePrerelease: true })` 校验插件 `peerDependencies` 中所有 `@deepseek-ai/dsh*` 项，不满足就**跳过整个 bundle** 并报 `is incompatible with dsh 0.2.0-rc.1`。本版本的 peer 范围已随之更新为 `^0.2.0-rc.1`。若不改声明，也可用 `dsh plugin --profile <name> allow-version "<pkg>@<ver>" --dsh-version 0.2.0-rc.1 --accept-risk` 逐版本豁免。
- dsh 处于 Developer Preview，已经破坏过这个插件的 API 一次。若未来版本再次重命名 web seam 或来源类型，本适配版需要同样的处理。
- 上游可能发布修复版本；在假定本适配版仍必要之前，请先查看 [npm](https://www.npmjs.com/package/@bocha-ai/dsh-web-search-bocha)。

## 致谢与许可

MIT。原始插件 © 2026 **博查（Bocha）** —— [`@bocha-ai/dsh-web-search-bocha`](https://www.npmjs.com/package/@bocha-ai/dsh-web-search-bocha)，[open.bocha.cn](https://open.bocha.cn/)。上游 `LICENSE` 原样保留。

dsh 0.2.0-rc.1 兼容性适配 © 2026 [Ellery1999](https://github.com/Ellery1999)。

本适配版与博查、DeepSeek 均无隶属或背书关系。
