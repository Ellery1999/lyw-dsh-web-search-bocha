# dsh-web-search-bocha

English | [中文](README.zh.md)

[![Release](https://img.shields.io/github/v/release/Ellery1999/lyw-dsh-web-search-bocha?label=download&sort=semver)](https://github.com/Ellery1999/lyw-dsh-web-search-bocha/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![dsh](https://img.shields.io/badge/dsh-0.2.0--rc.1-informational)

A [Bocha Web Search](https://open.bocha.cn/) backend for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — gives the `web_search` tool a working, China-friendly search provider so your agent can actually search the web on **dsh 0.2.0-rc.1**.

> **This is a compatibility fork of the official Bocha plugin.**
> Built on [`@bocha-ai/dsh-web-search-bocha`](https://www.npmjs.com/package/@bocha-ai/dsh-web-search-bocha) 0.1.0, published by Bocha ([open.bocha.cn](https://open.bocha.cn/)). The upstream package cannot load on current dsh, so this fork removes exactly the one incompatible dependency and leaves everything else untouched. See [Why this fork exists](#why-this-fork-exists).

## Why you might need this

Out of the box, dsh routes `web_search` to DeepSeek's own search backend, which needs a `DEEPSEEK_API_KEY`. Without one — the common case when you use dsh with a third-party model provider — every search fails:

```
Error: DeepSeek search has no API key for "DEEPSEEK_API_KEY"
```

This plugin replaces that backend with Bocha. You get domestic, compliant search results with titles, URLs and publication dates, and you use a Bocha key instead of a DeepSeek one.

## Features

- Registers provider id `bocha` on dsh's `ctx.web` seam, so the existing `web_search` tool routes to it with no tool changes.
- Maps Bocha's `webPages[].name` / `summary` / `datePublished` onto the portable Harness source type.
- Resolves the API key per search through the credentials service — rotate the key and the next request picks it up, no restart.
- Keeps dsh in charge of result limits, citation rendering, provider selection and error presentation.
- No build step: the package ships plain ESM.
- Honours `maxResults` and caps it at Bocha's documented maximum of 50.

## Requirements

| Requirement | Version |
|---|---|
| DeepSeek Harness | **0.2.0-rc.1** (verified) |
| Node.js | `^22.19.0` or `>=24.0.0` |
| Bocha API key | from [open.bocha.cn](https://open.bocha.cn/) |

## Install

### 1. Get the plugin

```sh
git clone https://github.com/Ellery1999/lyw-dsh-web-search-bocha.git
```

### 2. Install it into your Profile

**If you use the dsh Web UI**, the easiest path is the prebuilt tarball on the
[releases page](https://github.com/Ellery1999/lyw-dsh-web-search-bocha/releases/latest):

1. Download `lyw-dsh-web-search-bocha-<version>.tgz`.
2. Open **Settings → Plugins → Add plugin**.
3. Paste the **absolute path to the `.tgz`** and install.

A tarball unpacks into real files, so it sidesteps the link/junction trap described
below. Do **not** point the same field at the unpacked source *directory*.

Prefer the command line? Choose either option below.

<details open>
<summary><b>Option A — dsh CLI</b></summary>

```sh
dsh plugin --profile <your-profile> add /absolute/path/to/lyw-dsh-web-search-bocha
```

Use your actual Profile name (`desktop`, `web`, `tui`, …). The plugin declares `dsh.bundle`, so the CLI also adds it to your Profile's bundle list.

The CLI also accepts the tarball directly:

```sh
dsh plugin --profile <your-profile> add /absolute/path/to/lyw-dsh-web-search-bocha-<version>.tgz
```

</details>

<details>
<summary><b>Option B — pnpm directly, vendored inside the Profile</b></summary>

This is the layout used by the author's own desktop Profile, and it survives `pnpm install` intact:

```sh
mkdir -p ~/.dsh/profiles/<your-profile>/vendor
cp -r /absolute/path/to/lyw-dsh-web-search-bocha ~/.dsh/profiles/<your-profile>/vendor/
```

Then add to `~/.dsh/profiles/<your-profile>/package.json`:

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

then run `pnpm install` in the Profile directory.

</details>

### 3. Point search at Bocha and add the row

Append to `~/.dsh/profiles/<your-profile>/cordis.patch.yml`:

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

> The plugin's own bundle patch already sets `searchProvider: bocha` and inserts the row. Repeating them here just pins the choice in your top user layer so it survives bundle changes.

### 4. Store your Bocha key

Add it to `~/.dsh/.credentials.yaml`:

```yaml
BOCHA_API_KEY: your-api-key
```

On POSIX, restrict the file to its owner:

```sh
chmod 600 ~/.dsh/.credentials.yaml
```

<details>
<summary>Alternative: environment variable</summary>

Useful for CI, containers, or a one-off override. Export before launching dsh:

```sh
export BOCHA_API_KEY='your-api-key'
```

If both are set, the inherited environment variable wins over the credentials document.

</details>

### 5. Restart dsh

Search now routes through Bocha. Verify by asking your agent to search for anything.

## ⚠️ Installation pitfalls

Two traps cost real debugging time. Both produce the same symptom: the plugin silently does not activate.

### Trap 1 — never install it as a link or junction

A `link:` / junction / symlink install resolves to its **real path, outside the Profile directory**. The dsh loader only routes peer modules (`@deepseek-ai/*`) for import paths *inside* the Profile tree, so a linked install fails with:

```
dsh: warning: 1 entry did not activate
web-search-bocha (@lyw/dsh-web-search-bocha): failed to import
```

This is why the install options above copy or unpack instead of linking. Concretely:

| What you pass | Installed as | Safe? |
|---|---|---|
| npm package name | fetched and unpacked | ✅ |
| GitHub repo URL | cloned | ✅ |
| **`.tgz` tarball** | unpacked | ✅ |
| **Local source *directory*** | `link:` → junction | ❌ **fails** |

So in the Web UI's **Add plugin** dialog, give it the `.tgz` — never the unpacked
source directory. Anything that resolves through a symlink will hit this.

Confirm the install is a real directory (`LinkType` must be empty):

```powershell
Get-Item "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules\@lyw\dsh-web-search-bocha" -Force |
  Select-Object LinkType
```

### Trap 2 — the Web UI has no config page for this plugin

The official Bocha plugin registered a settings page through `dsh-settings`. That API no longer exists on dsh 0.2.0-rc.1, and configuration pages are now produced by client-side slot registration. This fork ships no client half, so there is **no in-GUI configuration page**, and the plugin appears in **Settings → Plugins** with only an enable toggle.

Configure it through the Profile patch ([step 3](#3-point-search-at-bocha-and-add-the-row)) and restart. That is the same surface the official plugin's own docs recommended for third-party search settings.

## Configuration

Set these in the `web-search-bocha` row of your `cordis.patch.yml`.

| Key | Default | Meaning |
|---|---|---|
| `apiKey` | — | Literal Bocha key. Redacted from settings descriptions, but prefer `apiKeyEnv` so no plaintext key lands in a Profile patch. |
| `apiKeyEnv` | `BOCHA_API_KEY` | Credential reference resolved through the credentials service on every search. |
| `baseURL` | `https://api.bocha.cn` | API base; `/v1/web-search` is appended. |
| `freshness` | `noLimit` | Time filter sent on every search: `noLimit`, `oneDay`, `oneWeek`, `oneMonth`, `oneYear`, a single date like `2025-04-06`, or a range like `2025-01-01..2025-04-06`. |
| `summary` | `true` | Ask Bocha for its longer per-page summary (used as the snippet). |
| `count` | `10` | Default result count when a request carries no `maxResults`; integer 1–50. |

A request's `maxResults` overrides `count`, and either value is capped at Bocha's maximum of 50 before the request is sent.

## Verify the install

Ask your agent to run a search, or check the composed Profile:

```sh
dsh --profile <your-profile> --dump-config
```

Look for `searchProvider: bocha` under the `web` row and a `web-search-bocha` row.

## Uninstall

```sh
dsh plugin --profile <your-profile> remove @lyw/dsh-web-search-bocha
```

Then remove the two rows you added to `cordis.patch.yml`. Your `web_search` tool falls back to the previous provider selection.

## How it works

The provider calls Bocha's `POST /v1/web-search` and maps the response onto dsh's portable source type: `url` → `source.url`, `name` → `title`, `summary` (falling back to `snippet`) → `snippet`, `datePublished` → `publishedAt`. Entries without a non-blank URL are dropped. Bocha returns no single generated answer for this endpoint, so `WebSearchResult.content` is left unset.

Failures surface as `WebError` with a machine-routable code: a missing credential is `WEB_PROVIDER_CREDENTIAL_MISSING`, cancellation is `WEB_ABORTED`, and HTTP errors, provider-declared non-200 codes, network failures and unparseable bodies are `WEB_PROVIDER_ERROR` (Bocha's `log_id` is preserved when present). Redirects are rejected before their target is contacted.

## Why this fork exists

Upstream `@bocha-ai/dsh-web-search-bocha@0.1.0` declares `@deepseek-ai/dsh-settings: ^0.1.0-rc.5` and imports two named exports from it:

```js
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
```

`dsh-settings` **removed both in 0.1.2-rc.1**, replacing them with the `SettingsForms` service (`ctx.settings`). Verified against published builds:

| `dsh-settings` | `installSettingsSection` / `settingsNamespace` |
|---|---|
| 0.1.0-rc.2 … 0.1.1-rc.2 | present |
| **0.1.2-rc.1 and later (incl. 0.1.5.x, 0.1.7-rc.2, 0.2.0-rc.1)** | **removed** |

ESM resolves named imports during module linking, so a missing export is a hard `SyntaxError` at load — not something a try/catch can absorb. The plugin row fails with `failed to import` and never registers its provider. The declared peer range `^0.1.0-rc.5` does not prevent this, because it permits anything below `0.2.0`.

### The delta

Three changes, all confined to `lib/index.js`:

1. Removed the `@deepseek-ai/dsh-settings` import entirely.
2. Removed the `installSettingsSection(...)` call from `apply()`. Config now flows straight to the provider instead of through the settings-driven `current()` indirection.
3. `WEB_SEARCH_BOCHA_SETTINGS_NAMESPACE` became a plain string literal instead of a `settingsNamespace(...)` call.

`BochaSearchProvider`, the `Config` schema, result mapping and error handling are **byte-for-byte upstream**. The only behavioural difference is the absence of a GUI settings page.

## Development

The package ships prebuilt plain ESM — there is no compile step. After editing `lib/index.js`, reload the module and exercise `apply()` against a stub context:

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

If you installed via Option A or B with a copied directory, re-copy after editing so the Profile sees the change, then restart dsh.

## Compatibility notes

- Tested against **dsh 0.2.0-rc.1** only.
- dsh 0.2.0-rc.1 adds a plugin compatibility gate: `dsh-app-boot` validates every `@deepseek-ai/dsh*` entry in a plugin's `peerDependencies` with `semver.satisfies(runtime, range, { includePrerelease: true })` and **skips the whole bundle** when one fails, reporting `is incompatible with dsh 0.2.0-rc.1`. This release updates those peer ranges to `^0.2.0-rc.1`. Without that change you can also grant a per-version exemption with `dsh plugin --profile <name> allow-version "<pkg>@<ver>" --dsh-version 0.2.0-rc.1 --accept-risk`.
- dsh is in Developer Preview and has already broken this plugin's API surface once. If a future release renames the web seam or the source type, this fork will need the same treatment again.
- The upstream package may publish a fixed version; check [npm](https://www.npmjs.com/package/@bocha-ai/dsh-web-search-bocha) before assuming this fork is still needed.

## Credits and license

MIT. Original plugin © 2026 **Bocha** — [`@bocha-ai/dsh-web-search-bocha`](https://www.npmjs.com/package/@bocha-ai/dsh-web-search-bocha), [open.bocha.cn](https://open.bocha.cn/). The upstream `LICENSE` is retained verbatim.

Compatibility adaptation for dsh 0.2.0-rc.1 © 2026 [Ellery1999](https://github.com/Ellery1999).

This fork is not affiliated with or endorsed by Bocha or DeepSeek.
