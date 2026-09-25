/**
 * Bocha implementation of the DeepSeek Harness `WebSearchProvider` interface.
 * @module @bocha-ai/dsh-web-search-bocha/provider
 */
import type { CredentialRef } from '@deepseek-ai/dsh-credentials';
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web';
import type { BochaFreshness, BochaSearchResponse, BochaWebPage } from './types.ts';
/** Stable id this provider registers under. */
export declare const BOCHA_PROVIDER_ID = "bocha";
/** Default base for Bocha's public API. */
export declare const BOCHA_DEFAULT_BASE_URL = "https://api.bocha.cn";
/** Default provider-side time range. */
export declare const BOCHA_DEFAULT_FRESHNESS: BochaFreshness;
/** Default request for provider-generated page summaries. */
export declare const BOCHA_DEFAULT_SUMMARY = true;
/** Default number of results requested when the seam supplies no bound. */
export declare const BOCHA_DEFAULT_COUNT = 10;
/** Maximum result count accepted by Bocha. */
export declare const BOCHA_MAX_COUNT = 50;
/** Resolved provider options supplied by the Cordis plugin. */
export interface BochaSearchProviderOptions {
    /** Literal Bocha API key; when present it wins over {@link resolveApiKey}. */
    apiKey?: string;
    /** Resolve the current Bocha API key for one search operation. */
    resolveApiKey?: () => Promise<string | undefined>;
    /** Credential reference named by missing-credential diagnostics. */
    apiKeyEnv?: CredentialRef;
    /** Endpoint base; `/v1/web-search` is appended. */
    baseURL: string;
    /** Provider-side time filter applied to every search. */
    freshness: BochaFreshness;
    /** Whether Bocha should return its longer per-page summary. */
    summary: boolean;
    /** Default result count when a request carries no `maxResults`. */
    count: number;
}
/**
 * Map one Bocha page to a normalized source.
 * @param page - one entry from `data.webPages.value[]`.
 * @returns the normalized source, or `undefined` when the entry has no URL.
 */
export declare function mapBochaWebPage(page: BochaWebPage): WebSearchSource | undefined;
/**
 * Map a Bocha response envelope to a normalized search result.
 * @param response - parsed response from `POST /v1/web-search`.
 * @returns the normalized result with malformed URL-less entries removed.
 */
export declare function mapBochaResponse(response: BochaSearchResponse): WebSearchResult;
/** Bocha-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export declare class BochaSearchProvider implements WebSearchProvider {
    private readonly resolveOptions;
    readonly id = "bocha";
    /**
     * Create a provider over fully resolved options.
     * @param options - credentials, endpoint, and provider-side search defaults.
     */
    constructor(resolveOptions: () => BochaSearchProviderOptions);
    /** @returns whether credentials, endpoint, and result count are locally usable. */
    available(): boolean;
    /**
     * Execute one Bocha Web Search request.
     * @param request - provider-neutral query and optional source limit.
     * @param signal - optional cancellation signal forwarded to `fetch`.
     * @returns normalized Bocha sources.
     */
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
    /**
     * Resolve one operation's credential without retaining it on the provider.
     * @param options - the operation's settings snapshot.
     * @param signal - abort signal for the surrounding search.
     * @returns the non-empty API key.
     */
    private apiKey;
}
//# sourceMappingURL=provider.d.ts.map