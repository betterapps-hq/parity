// Workers' own module, which has no types here: the root tsconfig checks this app with the DOM's, and Cloudflare's
// would clash with them. It declares what Cloudflare gives the Worker, as wrangler.jsonc binds it, and only the parts
// the service calls.
declare module "cloudflare:workers" {
  /** A Workers KV namespace. */
  export interface KeyValues {
    get(key: string): Promise<string | null>
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  }

  /** A Workers rate limiting binding, which counts a key's uses over its period in one Cloudflare location. */
  export interface RateLimit {
    limit(options: { key: string }): Promise<{ success: boolean }>
  }

  export interface Bindings {
    /** Searches' answers, kept for a day. */
    SEARCH_CACHE: KeyValues
    /** Each signed-in person's searches. */
    PEOPLE: RateLimit
    /** Requests that name nobody, by address. */
    ADDRESSES: RateLimit
    /** Each source's searches. */
    SOURCES: RateLimit
    /** Parity's client in WorkOS, whose keys check each access token. */
    WORKOS_CLIENT_ID: string
    /** The sources' keys, which are secrets the app's owner sets, so each may be missing. */
    PARITY_MOBBIN_API_KEY?: string
    PARITY_PIXABAY_API_KEY?: string
  }

  export const env: Bindings
}
