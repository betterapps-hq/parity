import { type Channel, type Checks, createChannel, domPort } from "@parity-app/channel"
import { parserFor } from "@parity-app/core/schema"
import type { PageLocation } from "@parity-app/extension/page"
import { updatesItself } from "@parity-app/frames"
import {
  type PageMethods,
  type PageMode,
  type PageViewport,
  pageDeadlines,
  type ParityMethods,
  readHello
} from "@parity-app/page-runtime/protocol"
import { type RefObject, useEffect, useRef, useState } from "react"
import { z } from "zod"
import { onPageFiles, showTokenPreview } from "./page-changes.ts"

/*
 * Parity's end of a page frame's channel (docs/proposals/route-frames.md, PAR-1260): the page runtime in the app's own
 * page says hello, Parity checks where it came from and hands it a port, and `@parity-app/channel` runs on that port.
 * Parity sets the page's mode over it without a reload, and hears how tall the page is and where it went. After a code
 * change, a page that doesn't update itself is loaded again, and the project's token values edited and not
 * saved are shown in it (`preview.set`, PAR-1264).
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

/** What reads the page's requests, which come from the app's origin. */
export const parityChecks: Checks<ParityMethods> = {
  "page.ready": (params) => readReady(params),
  "page.moved": (params) => readMoved(params),
  "page.height": (params) => readHeight(params),
  "page.used": () => ({})
}

/** What a page frame has said: its height in the mode it's drawn in, and where it is once it has hydrated. */
export interface PageHeard {
  /** The page's height in the current mode's window, until a mode it was said for changes. */
  height?: number
  location?: PageLocation
}

/** Fails a request that takes longer than its deadline, which `@parity-app/channel` leaves to the caller. */
function withDeadline<T>(request: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    request,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`No answer in ${ms} ms`)), ms))
  ])
}

/** Sets the page's mode, if it's connected, giving up past `mode.set`'s deadline, as a stuck page answers nothing. */
function sendMode(channel: Channel<ParityMethods, PageMethods> | undefined, mode: PageMode, viewport: PageViewport) {
  if (channel) {
    void withDeadline(channel.request("mode.set", { mode, viewport }), pageDeadlines["mode.set"]).catch(() => undefined)
  }
}

/** Sends a style preview to the page, if it's connected, giving up past `preview.set`'s deadline. */
function sendPreview(channel: Channel<ParityMethods, PageMethods> | undefined, css: string) {
  if (channel) {
    void withDeadline(channel.request("preview.set", { css }), pageDeadlines["preview.set"]).catch(() => undefined)
  }
}

/**
 * Talks to the page runtime in `frame`, which loads `src` and is named with `id`: answers its hello from `src`'s origin
 * with a port, and a second hello, after the page reloaded, with a new one and the height forgotten. Each time the page
 * connects and each time the mode changes, it sets the mode, and it hears the page's height and location. It shows
 * `project`'s token values edited and not saved in the page, and when the app's files change, it loads the page again
 * unless the page said its router takes the builder's hot updates.
 */
export function usePageChannel(
  frame: RefObject<HTMLIFrameElement | null>,
  {
    id,
    src,
    mode,
    viewport,
    project
  }: { id: string; src: string; mode: PageMode; viewport: PageViewport; project: string }
): PageHeard {
  const drawn = JSON.stringify([mode, viewport])
  const [height, setHeight] = useState<{ drawn: string; height: number }>()
  const [location, setLocation] = useState<PageLocation>()
  const channel = useRef<Channel<ParityMethods, PageMethods>>(undefined)
  // The page router the page said it has, which says whether it updates itself after a code change.
  const router = useRef<string | null>(undefined)
  // The project's previewed token values, which a page that connects later is shown too.
  const preview = useRef("")
  // What the page draws in now, which a page that connects later is set to.
  const current = useRef({ drawn, mode, viewport })

  useEffect(() => {
    current.current = { drawn, mode, viewport }
  })

  useEffect(() => {
    const origin = new URL(src).origin

    const heard = (event: MessageEvent) => {
      const hello = readHello(event.data)
      const page = frame.current?.contentWindow

      if (!hello || hello.frame !== id || event.origin !== origin || !page || event.source !== page) {
        return
      }

      const ports = new MessageChannel()

      const connected = createChannel<ParityMethods, PageMethods>({
        checks: parityChecks,
        handlers: {
          "page.ready": ({ location: at, router: said }) => {
            setLocation(at)
            router.current = said

            return null
          },
          "page.moved": ({ location: at }) => {
            setLocation(at)

            return null
          },
          "page.height": ({ height: told }) => {
            setHeight({ drawn: current.current.drawn, height: told })

            return null
          },
          "page.used": () => null
        }
      })

      // A page that reloaded says hello again: its new port replaces the one before, and the frame goes back to the
      // viewport's height so the new page, measured only at that height, can say how tall it is now.
      channel.current?.close(new Error("The page loaded again"))
      setHeight(undefined)
      channel.current = connected
      connected.connect(domPort(ports.port1))
      page.postMessage({ parity: "port", frame: id }, origin, [ports.port2])
      sendMode(connected, current.current.mode, current.current.viewport)

      if (preview.current !== "") {
        sendPreview(connected, preview.current)
      }
    }

    window.addEventListener("message", heard)

    return () => {
      window.removeEventListener("message", heard)
      channel.current?.close(new Error("The page's frame went"))
      channel.current = undefined
    }
  }, [frame, id, src])

  useEffect(
    () =>
      showTokenPreview(project, (css) => {
        preview.current = css
        sendPreview(channel.current, css)
      }),
    [project]
  )

  // A page under Vite or a webpack-compatible builder keeps the modules it loaded, so a code change loads it again; its
  // runtime says hello again with the same id. Next's take its hot updates in place.
  useEffect(
    () =>
      onPageFiles(project, () => {
        const page = frame.current

        if (page && !updatesItself(router.current)) {
          router.current = undefined
          page.src = src
        }
      }),
    [frame, project, src]
  )

  // The page changes mode in place, without loading again.
  useEffect(() => {
    sendMode(channel.current, current.current.mode, current.current.viewport)
  }, [drawn])

  const heard: PageHeard = {}

  if (height?.drawn === drawn) {
    heard.height = height.height
  }

  if (location) {
    heard.location = location
  }

  return heard
}
