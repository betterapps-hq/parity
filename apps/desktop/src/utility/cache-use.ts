import { cacheCounter, cacheEveryMs } from "@parity-app/telemetry"
import { track } from "../shared/tracing.ts"

/**
 * How often kept frame bitmaps and component previews are found on disk this session (PAR-638), recorded as
 * `bitmapCache.used` each minute in which any was looked up.
 */
export const cacheUse = cacheCounter()

/** Records the cache's hit rate each minute it was used. */
export function reportCacheUse(): void {
  setInterval(() => {
    const used = cacheUse.report()
    if (used) track("bitmapCache.used", used, undefined)
  }, cacheEveryMs).unref()
}
