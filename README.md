# @lyw/dsh-web-search-bocha

English | [中文](README.zh.md)

> **Adapted fork.** This is a community adaptation of
> [`@bocha-ai/dsh-web-search-bocha`](https://www.npmjs.com/package/@bocha-ai/dsh-web-search-bocha)
> 0.1.0 for **dsh 0.1.7-rc.2**. The upstream package targets `@deepseek-ai/dsh-settings`
> `^0.1.0-rc.5` and imports `installSettingsSection` / `settingsNamespace`, which that
> package **removed in 0.1.2-rc.1**. Because ESM named imports resolve at link time, the
> upstream package fails to load at all on 0.1.7-rc.2.
>
> See [Adaptation](#adaptation) for the exact delta.

A [Bocha Web Search](https://open.bocha.cn/)-backed `WebSearchProvider` and installable Profile bundle for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The package registers provider id `bocha`, calls Bocha's `POST /v1/web-search` endpoint, and carries a `dsh.bundle` patch that selects the provider after installation.

The package supplies search only. DeepSeek Harness continues to own the model-facing `web_search` tool, result limits, citations, provider selection, and error presentation through its [web capability](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/web/web).

## Install

Install the bundle into a Profile:

```sh
dsh plugin --profile desktop add /path/to/lyw-dsh-web-search-bocha
```

> **Important — do not install this outside the Profile.** A `link:`/junction install
> resolves to its real path, which falls outside the Profile directory. The dsh loader
> only routes peer modules (`@deepseek-ai/*`) for import paths *inside* the Profile tree,
> so a linked install fails with `failed to import`. Install a **real copy** inside
> `node_modules` (a `file:` dependency vendored under the Profile is the reliable way).

Optionally inspect the composed configuration; this prints it and exits:

```sh
dsh --profile desktop --dump-config
```

Start the Web app with:

```sh
dsh --profile desktop
```

Configure the API key with either option below. You do not need both.

### Option 1: DSH credentials document

Store the key in `$DSH_HOME/.credentials.yaml` (normally `~/.dsh/.credentials.yaml`):

```yaml
BOCHA_API_KEY: your-api-key
```

On POSIX, the file must be owner-only:

```sh
chmod 600 ~/.dsh/.credentials.yaml
```

The plugin resolves this reference through the Harness credentials service for every search, so a stored key rotation applies to the next request without a restart.

### Option 2: Environment variable

For CI, containers, or a per-run override, export the key before starting Harness:

```sh
export BOCHA_API_KEY='your-api-key'
```

If both options configure `BOCHA_API_KEY`, the inherited environment variable takes precedence over the managed credentials document.

Removing the package removes its provider row and bundle layer:

```sh
dsh plugin --profile desktop remove @lyw/dsh-web-search-bocha
```

## Bundle behavior

`cordis.patch.yml` replaces the base `web` row's complete config with `searchProvider: bocha` and inserts a `web-search-bocha` row that loads this package. Existing providers remain mounted, but `ctx.web` routes search to `bocha`. Profile, Harness-home, and command-line patch layers applied later can replace either row.

## Config

| Key | Default | Meaning |
|---|---|---|
| `apiKey` | — | Optional literal Bocha API key. It is redacted from settings descriptions, but the credentials service is preferred so no plaintext key enters a Profile patch. |
| `apiKeyEnv` | `BOCHA_API_KEY` | Credential reference resolved through the Harness credentials service for every search. |
| `baseURL` | `https://api.bocha.cn` | API base; `/v1/web-search` is appended. |
| `freshness` | `noLimit` | Time filter sent on every search: `noLimit`, `oneDay`, `oneWeek`, `oneMonth`, `oneYear`, one date such as `2025-04-06`, or a range such as `2025-01-01..2025-04-06`. |
| `summary` | `true` | Requests Bocha's longer per-page `summary`. |
| `count` | `10` | Default count when the Harness request has no `maxResults`; integer from 1 through 50. |

A later Profile patch can configure the inserted row without changing the package:

```yaml
- id: web-search-bocha
  config:
    freshness: 2025-01-01..2025-04-06
    summary: true
    count: 10
```

## Mapping and failures

The provider reads `data.webPages.value[]`. It maps `url` to `WebSearchSource.url`, `name` to `title`, `summary` to `snippet` with `snippet` as the fallback, and `datePublished` to `publishedAt`; an entry without a non-blank URL is dropped. Bocha does not return one generated answer for this endpoint, so `WebSearchResult.content` is omitted.

The request's `maxResults` overrides `count` and is capped at Bocha's maximum of 50 before the request is sent. The Harness web capability still enforces its own final source bound.

HTTP errors, provider-declared non-200 codes, network failures, and unprocessable response bodies surface as `WebError` `WEB_PROVIDER_ERROR`. Error messages retain Bocha's `log_id` when present. Abort-shaped failures surface as `WEB_ABORTED`, and redirects are rejected before their target is contacted.

The provider resolves the referenced credential at each search entry, so a key stored or rotated through the UI takes effect on the next request without restarting or re-registering the provider. A missing referenced credential surfaces as `WEB_PROVIDER_CREDENTIAL_MISSING`.

## Adaptation

### Why the upstream package cannot load on dsh 0.1.7-rc.2

Upstream `@bocha-ai/dsh-web-search-bocha@0.1.0` declares `@deepseek-ai/dsh-settings: ^0.1.0-rc.5`
and imports two named exports from it:

```js
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
```

`dsh-settings` **removed both in 0.1.2-rc.1**, replacing them with the `SettingsForms`
service (`ctx.settings`). Verified against published builds:

| `dsh-settings` | `installSettingsSection` / `settingsNamespace` |
|---|---|
| 0.1.0-rc.2 … 0.1.1-rc.2 | present |
| **0.1.2-rc.1 and later (incl. 0.1.5.x, 0.1.7-rc.2)** | **removed** |

ESM resolves named imports during module linking, so a missing export is a hard
`SyntaxError` at load — not a caught runtime error. The plugin row fails with
`failed to import` and never registers its provider. The declared peer range
`^0.1.0-rc.5` does not prevent this, because it permits `<0.2.0`.

### The delta in this fork

Three changes, all confined to `lib/index.js`:

1. Removed the `@deepseek-ai/dsh-settings` import entirely.
2. Removed the `installSettingsSection(...)` call from `apply()`. `apply()` now passes
   `config` straight through instead of through the settings-driven `current()` indirection.
3. `WEB_SEARCH_BOCHA_SETTINGS_NAMESPACE` is now a plain string literal rather than a
   `settingsNamespace("web-search-bocha")` call.

The provider implementation (`BochaSearchProvider`), the `Config` schema, result mapping,
and error handling are **unchanged**.

### Consequence: no in-GUI configuration page

Upstream registered a settings page through the removed API. On dsh 0.1.7-rc.2 the
configuration page is produced by registering a **client-side slot**, not by declaring
host-side settings. The relevant slots (documented in `dsh-cordis-client-runner`) are:

| Slot | Purpose |
|---|---|
| `plugins.item` | a plugin's own page — occupied by the four official pages |
| `plugins.bundle.config` | a whole bundle's configuration |
| `plugins.row.config` | one row's configuration, keyed `<package name>#<row id>` |

This fork registers **no** client slot, so there is no configuration page. The
`autoGenerate` field the host returns from `describe()` is not consumed by any shipped
client package, so it does not produce a page either.

**Configure through the Profile patch instead** (`cordis.patch.yml`), then restart. The
API key lives in the credentials document and can be rotated there at any time.

## Development

This fork ships prebuilt `lib/index.js` (plain ESM, no build step). Verify a change by
loading the module and exercising `apply()` against a stub context — there is no test
runner configured in this fork.

Run the live smoke only when a Bocha key is available:

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

## Model Experience

Indirectly, through DeepSeek Harness `dsh-tool-web`, which renders this provider's bounded URLs, titles, summaries or snippets, and publication dates under the stable `web_search` tool contract.

#### KV Cache effect

No direct invalidation; the Harness tool consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **No configuration page** — see [Adaptation](#adaptation). Configure through the Profile row and store `BOCHA_API_KEY` in the credentials document or launch environment. Adding a page requires a client half (`lib/client.js` plus a `dsh.client` declaration) that registers `plugins.row.config`.
- **Freshness is deployment configuration rather than a model-facing argument** — every request from one mounted provider uses the same `freshness` value because the provider-neutral Harness request currently carries only `query` and `maxResults`.
- **Bocha-specific `siteName` and other media fields are omitted** — the portable Harness source type has no site-name, image, or video fields.
- **One API call returns at most 50 sources** — a larger Harness `maxResults` request is capped at Bocha's documented maximum before transport.
- **Must be installed as a real directory inside the Profile** — a `link:` install resolves outside the Profile tree and the loader's peer routing does not apply.

## License

MIT, inherited from upstream. Original work copyright (c) 2026 Bocha; see [LICENSE](LICENSE).
Adaptation changes copyright (c) 2026 the fork author.
