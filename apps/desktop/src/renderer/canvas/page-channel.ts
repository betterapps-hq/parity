import { type Channel, type Checks, createChannel, domPort } from "@parity-app/channel"
import { parserFor } from "@parity-app/core/schema"
import type { PageLocation } from "@parity-app/extension/page"
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

/*
 * Parity's end of a page frame's channel (docs/proposals/route-frames.md, PAR-1260): the page runtime in the app's own
 * page says hello, Parity checks where it came from and hands it a port, and `@parity-app/channel` runs on that port.
 * Parity sets the page's mode over it without a reload, and hears how tall the page is and where it went.
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

/**
 * Talks to the page runtime in `frame`, which loads `src` and is named with `id`: answers its hello from `src`'s origin
 * with a port, and a second hello, after the page reloaded, with a new one. Each time the page connects and each time
 * the mode changes, it sets the mode, and it hears the page's height and location.
 */
export function usePageChannel(
  frame: RefObject<HTMLIFrameElement | null>,
  { id, src, mode, viewport }: { id: string; src: string; mode: PageMode; viewport: PageViewport }
): PageHeard {
  const drawn = JSON.stringify([mode, viewport])
  const [height, setHeight] = useState<{ drawn: string; height: number }>()
  const [location, setLocation] = useState<PageLocation>()
  const channel = useRef<Channel<ParityMethods, PageMethods>>(undefined)
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
          "page.ready": ({ location: at }) => {
            setLocation(at)

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

      // A page that reloaded says hello again: its new port replaces the one before.
      channel.current?.close(new Error("The page loaded again"))
      channel.current = connected
      connected.connect(domPort(ports.port1))
      page.postMessage({ parity: "port", frame: id }, origin, [ports.port2])
      sendMode(connected, current.current.mode, current.current.viewport)
    }

    window.addEventListener("message", heard)

    return () => {
      window.removeEventListener("message", heard)
      channel.current?.close(new Error("The page's frame went"))
      channel.current = undefined
    }
  }, [frame, id, src])

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
