# @lyw/dsh-web-search-bocha

[English](README.md) | 中文

> **适配版（fork）。** 这是
> [`@bocha-ai/dsh-web-search-bocha`](https://www.npmjs.com/package/@bocha-ai/dsh-web-search-bocha)
> 0.1.0 针对 **dsh 0.1.7-rc.2** 的社区适配版。上游包依赖
> `@deepseek-ai/dsh-settings` `^0.1.0-rc.5`，并从中导入
> `installSettingsSection` / `settingsNamespace`，而该包在 **0.1.2-rc.1 中移除了这两个导出**。
> 由于 ESM 具名导入在链接阶段解析，上游包在 0.1.7-rc.2 上**完全无法加载**。
>
> 具体改动见[适配说明](#适配说明)。

由 [Bocha Web Search](https://open.bocha.cn/) 支持的 `WebSearchProvider` 和可安装 Profile 组合包（bundle），用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。该包注册提供方 ID `bocha`，调用博查的 `POST /v1/web-search` 端点，并携带一个 `dsh.bundle` patch，安装后选择这个提供方。

该包只提供搜索。DeepSeek Harness 继续通过其 [web 能力](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/web/web)拥有面向模型的 `web_search` 工具、结果上限、引用、提供方选择和错误呈现。

## 安装

把组合包安装到 Profile：

```sh
dsh plugin --profile desktop add /path/to/lyw-dsh-web-search-bocha
```

> **重要——不要装在 Profile 之外。** 用 `link:`/junction 安装会解析到真实路径，落在 Profile
> 目录之外。dsh 加载器只为 Profile 树**之内**的导入路径路由 peer 模块
> （`@deepseek-ai/*`），因此链接安装会报 `failed to import`。请安装成 `node_modules`
> 里的**真实副本**（把 `file:` 依赖 vendor 到 Profile 下是可靠做法）。

如需检查最终组合配置，可以执行下面的可选命令；它打印配置后就会退出：

```sh
dsh --profile desktop --dump-config
```

启动 Web 应用只需要执行：

```sh
dsh --profile web
```

API 密钥使用下面任一方式配置即可，不需要同时配置。

### 方式一：DSH credentials 文档

把密钥存入 `$DSH_HOME/.credentials.yaml`（通常是 `~/.dsh/.credentials.yaml`）：

```yaml
BOCHA_API_KEY: your-api-key
```

在 POSIX 上，该文件必须仅属主可访问：

```sh
chmod 600 ~/.dsh/.credentials.yaml
```

插件会在每次搜索时经由 Harness credentials 服务解析这个引用，因此轮换已存密钥后，下一次请求就会使用新值，无需重启。

### 方式二：环境变量

对于 CI、容器或按次覆盖，在启动 Harness 前导出密钥：

```sh
export BOCHA_API_KEY='your-api-key'
```

如果两种方式都配置了 `BOCHA_API_KEY`，继承的环境变量优先级高于受管凭据文档。

移除这个包会同时移除其提供方行和组合包层：

```sh
dsh plugin --profile desktop remove @lyw/dsh-web-search-bocha
```

## 组合包行为

`cordis.patch.yml` 把基础 `web` 行的完整配置替换为 `searchProvider: bocha`，并插入加载本包的 `web-search-bocha` 行。现有提供方仍保持挂载，但 `ctx.web` 会把搜索路由到 `bocha`。随后应用的 Profile、Harness home 和命令行 patch 层可以替换任一行。

## 配置

| 配置键 | 默认值 | 含义 |
|---|---|---|
| `apiKey` | — | 可选的博查 API 密钥字面值。settings 描述会将它脱敏，但仍应优先使用 credentials 服务，以免明文密钥进入 Profile patch。 |
| `apiKeyEnv` | `BOCHA_API_KEY` | 每次搜索都经由 Harness credentials 服务解析的凭据引用。 |
| `baseURL` | `https://api.bocha.cn` | API 基址；追加 `/v1/web-search`。 |
| `freshness` | `noLimit` | 每次搜索发送的时间过滤条件：`noLimit`、`oneDay`、`oneWeek`、`oneMonth`、`oneYear`，也可以是 `2025-04-06` 这样的单日，或 `2025-01-01..2025-04-06` 这样的日期区间。 |
| `summary` | `true` | 请求博查返回较长的逐页面 `summary`。 |
| `count` | `10` | Harness 请求不含 `maxResults` 时使用的默认数量；取值为 1 到 50 的整数。 |

后续 Profile patch 可以配置插入的行，无需改动这个包：

```yaml
- id: web-search-bocha
  config:
    freshness: 2025-01-01..2025-04-06
    summary: true
    count: 10
```

## 映射与失败

该提供方读取 `data.webPages.value[]`。它把 `url` 映射到 `WebSearchSource.url`、`name` 映射到 `title`、`summary` 映射到 `snippet`（缺失时回退到 `snippet`），并把 `datePublished` 映射到 `publishedAt`；没有非空白 URL 的条目会被丢弃。博查的这个端点不返回单一生成答案，因此省略 `WebSearchResult.content`。

请求的 `maxResults` 会覆盖 `count`，并在发送请求前限制到博查的最大值 50。Harness web 能力仍会执行自身的最终来源数量限制。

HTTP 错误、提供方声明的非 200 代码、网络失败和无法处理的响应体会呈现为 `WebError` `WEB_PROVIDER_ERROR`。错误消息会保留博查返回的 `log_id`。中止形状的失败会呈现为 `WEB_ABORTED`，重定向会在访问目标之前被拒绝。

提供方会在每次搜索入口解析所引用的凭据，因此通过 UI 存入或轮换的密钥会在下一次请求生效，无需重启或重新注册提供方。引用的凭据缺失时会呈现为 `WEB_PROVIDER_CREDENTIAL_MISSING`。

## 适配说明

### 为什么上游包在 dsh 0.1.7-rc.2 上无法加载

上游 `@bocha-ai/dsh-web-search-bocha@0.1.0` 声明 `@deepseek-ai/dsh-settings: ^0.1.0-rc.5`，
并从中导入两个具名导出：

```js
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
```

`dsh-settings` 在 **0.1.2-rc.1 中移除了这两者**，改为 `SettingsForms` 服务（`ctx.settings`）。
对照已发布构建实测：

| `dsh-settings` | `installSettingsSection` / `settingsNamespace` |
|---|---|
| 0.1.0-rc.2 … 0.1.1-rc.2 | 存在 |
| **0.1.2-rc.1 起（含 0.1.5.x、0.1.7-rc.2）** | **已移除** |

ESM 在模块链接阶段解析具名导入，缺失的导出是**硬性 `SyntaxError`**，不是可捕获的运行时错误。
该插件行会以 `failed to import` 失败，提供方永远不会注册。声明的 peer 范围
`^0.1.0-rc.5` 无法阻止这一点，因为它允许 `<0.2.0`。

### 本适配版的改动

共三处，全部限于 `lib/index.js`：

1. 完全移除 `@deepseek-ai/dsh-settings` 导入。
2. 从 `apply()` 中移除 `installSettingsSection(...)` 调用。`apply()` 现在直接把 `config`
   传给提供方，不再经过由设置驱动的 `current()` 间接层。
3. `WEB_SEARCH_BOCHA_SETTINGS_NAMESPACE` 改为普通字符串字面量，不再调用
   `settingsNamespace("web-search-bocha")`。

提供方实现（`BochaSearchProvider`）、`Config` schema、结果映射与错误处理**均未改动**。

### 结果：没有图形界面配置页

上游通过那个被移除的 API 注册设置页。在 dsh 0.1.7-rc.2 上，配置页由注册**客户端 slot**
产生，而不是声明 host 端设置。相关 slot（见 `dsh-cordis-client-runner` 内嵌文档）：

| Slot | 用途 |
|---|---|
| `plugins.item` | 插件自己的页面——已被四个官方页占用 |
| `plugins.bundle.config` | 整个 bundle 的配置 |
| `plugins.row.config` | 单行配置，键为 `<包名>#<行id>` |

本适配版**未注册任何客户端 slot**，因此没有配置页。host 端 `describe()` 返回的
`autoGenerate` 字段没有任何已发布的客户端包消费它，所以它也不会生成页面。

**请改用 Profile patch 配置**（`cordis.patch.yml`），然后重启。API 密钥存放在凭据文档中，
可随时在那里轮换。

## 开发

本适配版直接提供预构建的 `lib/index.js`（纯 ESM，无构建步骤）。改动后通过加载模块并对
桩 context 调用 `apply()` 来验证——本适配版未配置测试运行器。

仅在有博查密钥时运行实时 smoke：

```sh
BOCHA_API_KEY='your-api-key' node --input-type=module -e "
import { BochaSearchProvider } from './lib/index.js'
const p = new BochaSearchProvider(() => ({
  apiKey: process.env.BOCHA_API_KEY,
  baseURL: 'https://api.bocha.cn', freshness: 'noLimit', summary: true, count: 3,
}))
console.log(await p.search({ query: 'DeepSeek Harness', maxResults: 3 }))
"
```

## 模型体验

通过 DeepSeek Harness `dsh-tool-web` 间接影响；该工具在稳定的 `web_search` 工具契约下呈现此提供方经过数量限制的 URL、标题、摘要或 snippet 与发布日期。

#### KV Cache 影响

不会直接导致 KV Cache 失效；请求前缀变更由 Harness 工具消费方负责。

## 已知限制与暂缓事项

- **没有配置页**：见[适配说明](#适配说明)。请通过 Profile 行配置，并把 `BOCHA_API_KEY` 存进凭据文档或启动环境。要加页面需补一个客户端半包（`lib/client.js` 加 `dsh.client` 声明），注册 `plugins.row.config`。
- **`freshness` 是部署配置，而不是面向模型的参数**：同一个已挂载提供方的每次请求都使用相同的 `freshness` 值，因为提供方无关的 Harness 请求目前只携带 `query` 和 `maxResults`。
- **省略博查特有的 `siteName` 和其他媒体字段**：Harness 的可移植来源类型没有站点名称、图片或视频字段。
- **一次 API 调用最多返回 50 个来源**：较大的 Harness `maxResults` 请求会在传输前限制到博查记录的最大值。
- **必须安装为 Profile 内的真实目录**：`link:` 安装会解析到 Profile 树之外，加载器的 peer 路由不适用。

## 许可

MIT，继承自上游。原始作品版权 (c) 2026 Bocha，见 [LICENSE](LICENSE)。
适配改动版权 (c) 2026 适配版作者。
