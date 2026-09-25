/**
 * Wire types for the Bocha Web Search API.
 * @module @bocha-ai/dsh-web-search-bocha/types
 */
/** One calendar date in the format accepted by Bocha. */
export type BochaCalendarDate = `${number}-${number}-${number}`;
/** Relative time range accepted by Bocha's `freshness` request field. */
export type BochaRelativeFreshness = 'noLimit' | 'oneDay' | 'oneWeek' | 'oneMonth' | 'oneYear';
/** Relative range, one date, or an inclusive date range accepted by Bocha. */
export type BochaFreshness = BochaRelativeFreshness | BochaCalendarDate | `${BochaCalendarDate}..${BochaCalendarDate}`;
/** Request body sent to Bocha's Web Search endpoint. */
export interface BochaSearchRequest {
    /** Natural-language search query. */
    query: string;
    /** Provider-side time filter. */
    freshness: BochaFreshness;
    /** Whether Bocha should return its longer per-page summary. */
    summary: boolean;
    /** Requested result count; Bocha accepts 1 through 50. */
    count: number;
}
/** One Web page entry returned by Bocha. */
export interface BochaWebPage {
    name?: string | null;
    url?: string | null;
    snippet?: string | null;
    summary?: string | null;
    siteName?: string | null;
    datePublished?: string | null;
}
/** Successful or provider-declared Bocha response envelope. */
export interface BochaSearchResponse {
    code?: number;
    msg?: string | null;
    message?: string | null;
    log_id?: string | null;
    data?: {
        webPages?: {
            value?: BochaWebPage[];
        } | null;
    } | null;
}
//# sourceMappingURL=types.d.ts.map