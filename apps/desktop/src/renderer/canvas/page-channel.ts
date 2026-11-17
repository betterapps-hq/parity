import type { Checks } from "@parity-app/channel"
import { parserFor } from "@parity-app/core/schema"
import type { ParityMethods } from "@parity-app/page-runtime/protocol"
import { z } from "zod"

/*
 * What Parity reads of a page frame's requests (docs/proposals/route-frames.md, PAR-1260): the page runtime in the app's
 * own page runs on another origin, so each request it sends the freezer or the pool is parsed before it's handled.
 */

const pageLocation = z.object({
  path: z.string().startsWith("/"),
  search: z.string(),
  hash: z.string(),
  outcome: z.enum(["landed", "redirected", "not-found", "error"])
})

const readReady = parserFor(z.object({ location: pageLocation, router: z.string().nullable() }))
const readMoved = parserFor(z.object({ location: pageLocation }))

const readHeight = parserFor(z.object({ height: z.number().positive().finite() }), ({ height }) => ({
  height: Math.ceil(height)
}))

const readScrolled = parserFor(z.object({ top: z.number().finite().nonnegative() }))
const readZoom = parserFor(z.object({ deltaY: z.number().finite(), x: z.number().finite(), y: z.number().finite() }))

const readKey = parserFor(
  z.object({
    key: z.string().min(1).max(40),
    code: z.string().max(40),
    ctrl: z.boolean(),
    meta: z.boolean(),
    shift: z.boolean(),
    alt: z.boolean()
  })
)

/** What reads the page's requests, which come from the app's origin. */
export const parityChecks: Checks<ParityMethods> = {
  "page.ready": (params) => readReady(params),
  "page.moved": (params) => readMoved(params),
  "page.height": (params) => readHeight(params),
  "page.used": () => ({}),
  "page.scrolled": (params) => readScrolled(params),
  "page.zoom": (params) => readZoom(params),
  "page.key": (params) => readKey(params)
}
