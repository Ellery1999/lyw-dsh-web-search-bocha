/**
 * `@lyw/dsh-web-search-bocha` registers a Bocha-backed `WebSearchProvider`
 * with the DeepSeek Harness web capability.
 *
 * Adapted for dsh >= 0.1.2-rc.1: the `dsh-settings` package no longer exports
 * `installSettingsSection`/`settingsNamespace`, so this build declares no
 * settings-registration signature. The configuration page is auto-generated
 * from the Loader entry id and the {@link Config} schema below.
 * @module @lyw/dsh-web-search-bocha
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { BochaFreshness } from './types.ts';
export { BOCHA_DEFAULT_BASE_URL, BOCHA_DEFAULT_COUNT, BOCHA_DEFAULT_FRESHNESS, BOCHA_DEFAULT_SUMMARY, BOCHA_MAX_COUNT, BOCHA_PROVIDER_ID, BochaSearchProvider, mapBochaResponse, mapBochaWebPage, } from './provider.ts';
export type { BochaSearchProviderOptions } from './provider.ts';
export type { BochaCalendarDate, BochaFreshness, BochaRelativeFreshness, BochaSearchRequest, BochaSearchResponse, BochaWebPage, } from './types.ts';
/** Cordis plugin name used by Loader diagnostics. */
export declare const name = "web-search-bocha";
/** The web capability this provider registers into. */
export declare const inject: string[];
/** Default credential reference used by the settings UI and provider. */
export declare const BOCHA_DEFAULT_API_KEY_ENV = "BOCHA_API_KEY";
/** Profile entry id owning Bocha's credential reference and request defaults. */
export declare const WEB_SEARCH_BOCHA_SETTINGS_NAMESPACE = "web-search-bocha";
/** Cordis plugin configuration. */
export interface Config {
    /** Literal Bocha API key; prefer {@link apiKeyEnv} so no secret enters configuration files. */
    apiKey?: string;
    /** Credential reference resolved for each search; defaults to `BOCHA_API_KEY`. */
    apiKeyEnv?: string;
    /** Endpoint base; `/v1/web-search` is appended. */
    baseURL?: string;
    /** Provider-side time range applied to every search. */
    freshness?: BochaFreshness;
    /** Whether Bocha should return its longer per-page summary. */
    summary?: boolean;
    /** Default result count when a request carries no `maxResults`. */
    count?: number;
}
/** Runtime schema for {@link Config}. */
export declare const Config: z<Config>;
/**
 * Register the Bocha search provider with `ctx.web`.
 * @param ctx - Cordis context carrying the shared web capability.
 * @param config - optional credentials and provider-side search defaults.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map