import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import z from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";
//#region src/provider.ts
/**
* Bocha implementation of the DeepSeek Harness `WebSearchProvider` interface.
* @module @bocha-ai/dsh-web-search-bocha/provider
*/
/** Stable id this provider registers under. */
const BOCHA_PROVIDER_ID = "bocha";
/** Default base for Bocha's public API. */
const BOCHA_DEFAULT_BASE_URL = "https://api.bocha.cn";
/** Default provider-side time range. */
const BOCHA_DEFAULT_FRESHNESS = "noLimit";
/** Default request for provider-generated page summaries. */
const BOCHA_DEFAULT_SUMMARY = true;
/** Default number of results requested when the seam supplies no bound. */
const BOCHA_DEFAULT_COUNT = 10;
/** Maximum result count accepted by Bocha. */
const BOCHA_MAX_COUNT = 50;
/** Attribution header sent on every request. */
const USER_AGENT = "@bocha-ai/dsh-web-search-bocha/0.1.0";
/**
* Map one Bocha page to a normalized source.
* @param page - one entry from `data.webPages.value[]`.
* @returns the normalized source, or `undefined` when the entry has no URL.
*/
function mapBochaWebPage(page) {
	const url = nonBlank(page.url);
	if (url === void 0) return void 0;
	const title = nonBlank(page.name);
	const snippet = nonBlank(page.summary) ?? nonBlank(page.snippet);
	const publishedAt = nonBlank(page.datePublished);
	return {
		url,
		...title === void 0 ? {} : { title },
		...snippet === void 0 ? {} : { snippet },
		...publishedAt === void 0 ? {} : { publishedAt }
	};
}
/**
* Map a Bocha response envelope to a normalized search result.
* @param response - parsed response from `POST /v1/web-search`.
* @returns the normalized result with malformed URL-less entries removed.
*/
function mapBochaResponse(response) {
	if (response === null || typeof response !== "object") throw new WebError("Bocha returned an unprocessable response body", "WEB_PROVIDER_ERROR");
	if (response.code !== void 0 && response.code !== 200) throw new WebError(providerMessage(response, `Bocha API error (code ${String(response.code)})`), "WEB_PROVIDER_ERROR");
	const pages = response.data?.webPages?.value ?? [];
	if (!Array.isArray(pages)) throw new WebError("Bocha returned an unprocessable response body", "WEB_PROVIDER_ERROR");
	return {
		sources: pages.map(mapBochaWebPage).filter((source) => source !== void 0),
		truncated: false
	};
}
/** Bocha-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
var BochaSearchProvider = class {
	resolveOptions;
	id = BOCHA_PROVIDER_ID;
	/**
	* Create a provider over fully resolved options.
	* @param options - credentials, endpoint, and provider-side search defaults.
	*/
	constructor(resolveOptions) {
		this.resolveOptions = resolveOptions;
	}
	/** @returns whether credentials, endpoint, and result count are locally usable. */
	available() {
		const options = this.resolveOptions();
		return ((options.apiKey?.length ?? 0) > 0 || options.resolveApiKey !== void 0) && URL.canParse(options.baseURL) && isValidCount(options.count);
	}
	/**
	* Execute one Bocha Web Search request.
	* @param request - provider-neutral query and optional source limit.
	* @param signal - optional cancellation signal forwarded to `fetch`.
	* @returns normalized Bocha sources.
	*/
	async search(request, signal) {
		const options = this.resolveOptions();
		const apiKey = await this.apiKey(options, signal);
		throwIfSearchAborted(signal);
		const count = Math.min(request.maxResults ?? options.count, 50);
		const body = {
			query: request.query,
			freshness: options.freshness,
			summary: options.summary,
			count
		};
		let response;
		try {
			response = await fetch(`${options.baseURL.replace(/\/+$/, "")}/v1/web-search`, {
				method: "POST",
				redirect: "error",
				headers: {
					"authorization": `Bearer ${apiKey}`,
					"content-type": "application/json",
					"accept": "application/json",
					"user-agent": USER_AGENT
				},
				body: JSON.stringify(body),
				...signal === void 0 ? {} : { signal }
			});
		} catch (error) {
			if (isAbortError(error)) throw new WebError("Bocha search aborted", "WEB_ABORTED", { cause: error });
			throw new WebError(`Bocha search request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!response.ok) {
			let message = `Bocha API error (HTTP ${String(response.status)})`;
			try {
				message = providerMessage(await response.json(), message);
			} catch (error) {
				if (isAbortError(error)) throw new WebError("Bocha search aborted", "WEB_ABORTED", { cause: error });
			}
			throw new WebError(message, "WEB_PROVIDER_ERROR");
		}
		try {
			return mapBochaResponse(await response.json());
		} catch (error) {
			if (isAbortError(error)) throw new WebError("Bocha search aborted", "WEB_ABORTED", { cause: error });
			if (error instanceof WebError) throw error;
			throw new WebError(`Bocha returned an unprocessable response body: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
	}
	/**
	* Resolve one operation's credential without retaining it on the provider.
	* @param options - the operation's settings snapshot.
	* @param signal - abort signal for the surrounding search.
	* @returns the non-empty API key.
	*/
	async apiKey(options, signal) {
		throwIfSearchAborted(signal);
		if (options.apiKey !== void 0 && options.apiKey.length > 0) return options.apiKey;
		let resolved;
		try {
			resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(void 0), signal);
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw new WebError("Bocha search aborted", "WEB_ABORTED", { cause: signal?.reason ?? error });
			throw new WebError(`Bocha search credential resolution failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (resolved !== void 0 && resolved.length > 0) return resolved;
		const ref = options.apiKeyEnv ?? "BOCHA_API_KEY";
		throw new WebError(`Bocha search has no API key for "${ref}"; store it through the credentials service, export it in the launching environment, or set a literal "apiKey" in the web-search-bocha config`, "WEB_PROVIDER_CREDENTIAL_MISSING");
	}
};
/** Race an asynchronous credential read against caller cancellation. */
function abortable(operation, signal) {
	if (signal === void 0) return operation;
	if (signal.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			reject(new DOMException("aborted", "AbortError"));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		operation.then((value) => {
			signal.removeEventListener("abort", onAbort);
			resolve(value);
		}, (error) => {
			signal.removeEventListener("abort", onAbort);
			reject(error);
		});
	});
}
/** Throw the shared cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal) {
	if (signal?.aborted === true) throw new WebError("Bocha search aborted", "WEB_ABORTED", { cause: signal.reason });
}
/** Extract provider detail and request id from an error envelope. */
function providerMessage(value, fallback) {
	if (value === null || typeof value !== "object") return fallback;
	const envelope = value;
	const detail = nonBlankUnknown(envelope.msg) ?? nonBlankUnknown(envelope.message);
	const logId = nonBlankUnknown(envelope.log_id);
	const message = detail ?? fallback;
	return logId === void 0 ? message : `${message} (log_id: ${logId})`;
}
/** Return a non-blank wire string with surrounding whitespace removed. */
function nonBlank(value) {
	return nonBlankUnknown(value);
}
/** Return a non-blank unknown value only when it is a string. */
function nonBlankUnknown(value) {
	if (typeof value !== "string") return void 0;
	const trimmed = value.trim();
	return trimmed.length === 0 ? void 0 : trimmed;
}
/** True for a provider default accepted by Bocha. */
function isValidCount(value) {
	return Number.isInteger(value) && value >= 1 && value <= 50;
}
/** True for a fetch/`AbortSignal` abort. */
function isAbortError(error) {
	return error instanceof DOMException && error.name === "AbortError";
}
//#endregion
//#region src/index.ts
/** Cordis plugin name used by Loader diagnostics. */
const name = "web-search-bocha";
/** The web capability this provider registers into. */
const inject = ["web"];
/** Default credential reference used by the settings UI and provider. */
const BOCHA_DEFAULT_API_KEY_ENV = "BOCHA_API_KEY";
/**
 * Profile entry id carrying Bocha's credential reference and request defaults.
 * Adapted for dsh >= 0.1.2-rc.1: the removed `dsh-settings`
 * `settingsNamespace()` helper is no longer imported; the settings page is
 * auto-generated from this entry's Loader id and Config schema.
 */
const WEB_SEARCH_BOCHA_SETTINGS_NAMESPACE = "web-search-bocha";
/** Runtime schema for {@link Config}. */
const Config = z.object({
	apiKey: z.string().role("secret"),
	apiKeyEnv: z.string().role("credential-ref").default(BOCHA_DEFAULT_API_KEY_ENV),
	baseURL: z.string(),
	freshness: z.string().pattern(/^(?:noLimit|oneDay|oneWeek|oneMonth|oneYear|\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:\.\.\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))?)$/),
	summary: z.boolean(),
	count: z.number().step(1).min(1).max(50)
});
/** Resolve one settings snapshot into the options used by one search. */
function resolveOptions(ctx, config) {
	const apiKeyEnv = credentialRef(config.apiKeyEnv ?? "BOCHA_API_KEY");
	const literalApiKey = config.apiKey !== void 0 && config.apiKey.length > 0 ? config.apiKey : void 0;
	return {
		...literalApiKey === void 0 ? {} : { apiKey: literalApiKey },
		resolveApiKey: async () => {
			const credentials = ctx.get("credentials");
			if (credentials !== void 0) return (await credentials.resolve(apiKeyEnv))?.value;
			const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv);
			return ambient !== void 0 && ambient.value.length > 0 ? ambient.value : void 0;
		},
		apiKeyEnv,
		baseURL: config.baseURL ?? "https://api.bocha.cn",
		freshness: config.freshness ?? "noLimit",
		summary: config.summary ?? true,
		count: config.count ?? 10
	};
}
/**
* Register the Bocha search provider with `ctx.web`.
*
* Adapted for dsh >= 0.1.2-rc.1: the old `dsh-settings`
* `installSettingsSection()` call was removed. That API no longer exists — it
* was replaced by the `SettingsForms` service (`ctx.settings`), which
* auto-generates a configuration page for every Loader entry that carries a
* Config schema (`autoGenerate` defaults to true). This entry's id and the
* {@link Config} schema declared above are enough for the page to appear under
* Settings > Plugins > Plugin configuration, so no registration call is needed.
*
* The provider re-reads Config on every search, so a value edited through that
* page takes effect on the next request without a restart.
* @param ctx - Cordis context carrying the shared web capability.
* @param config - optional credentials and provider-side search defaults.
*/
function apply(ctx, config) {
	ctx.web.registerSearchProvider(new BochaSearchProvider(() => resolveOptions(ctx, config)));
}
//#endregion
export { BOCHA_DEFAULT_API_KEY_ENV, BOCHA_DEFAULT_BASE_URL, BOCHA_DEFAULT_COUNT, BOCHA_DEFAULT_FRESHNESS, BOCHA_DEFAULT_SUMMARY, BOCHA_MAX_COUNT, BOCHA_PROVIDER_ID, BochaSearchProvider, Config, WEB_SEARCH_BOCHA_SETTINGS_NAMESPACE, apply, inject, mapBochaResponse, mapBochaWebPage, name };
