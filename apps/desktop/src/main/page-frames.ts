import { readFrameName } from "@parity-app/page-runtime/protocol"

/*
 * Keeps route frames on their builder's origin (docs/proposals/route-frames.md, "Input on a live board"). A route's page
 * runs the app's own code in Parity's window, so a link or a sign-in provider could take its frame anywhere. A
 * navigation off the page's origin is stopped, and the window is told where the frame tried to go, so its board can
 * say. Nothing here knows Electron, so its tests run without it.
 */

/** A navigation as Electron's `will-frame-navigate` and `will-redirect` events give it, with the frame it moves. */
export interface FrameNavigation {
  readonly url: string
  readonly isMainFrame: boolean
  /** The frame that navigates, as it is before it does: its address and its name. */
  readonly frame: { readonly url: string; readonly name: string } | null | undefined
  preventDefault(): void
}

/** Where a route frame tried to go, for the window it's in: the frame's id from its name, and the address. */
export interface StoppedFrame {
  frame: string
  url: string
}

/** A route page's host: a project's own name under `.localhost` (`projectHost` in `@parity-app/editor`). */
const pageHost = /^p[\da-f]{16}\.localhost$/

/** Whether an address is a route page's, on a project's own `.localhost` name. */
export function isPageUrl(url: string): boolean {
  return URL.canParse(url) && pageHost.test(new URL(url).hostname)
}

/**
 * Stops a route frame leaving its page's origin, and calls `stopped` with where it tried to go. A frame of the app's
 * own inside the page, such as an embedded video, isn't on a page's host, and goes where it likes.
 */
export function pageFrameGuard(stopped: (stop: StoppedFrame) => void): (navigation: FrameNavigation) => void {
  return (navigation) => {
    const { frame } = navigation

    if (navigation.isMainFrame || !frame || !isPageUrl(frame.url) || !URL.canParse(navigation.url)) {
      return
    }

    if (new URL(navigation.url).origin === new URL(frame.url).origin) {
      return
    }

    // Called on the event itself: Electron's is a native object, whose method isn't bound to it.
    navigation.preventDefault()
    const name = readFrameName(frame.name)

    if (name) {
      stopped({ frame: name.frame, url: navigation.url })
    }
  }
}
