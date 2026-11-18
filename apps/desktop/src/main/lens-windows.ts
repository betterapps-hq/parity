/**
 * Lens windows (lens-layout.md): a window an editor window opens for a lens moved out of it, which the editor window's
 * page draws into. Main knows each one's editor window and lens, closes them when their editor window closes, holds them
 * open while that window decides whether the app quits, and puts a lens's window back where it last was. Nothing here
 * knows Electron, so its tests run without it.
 */

/** A rectangle on the screen, as Electron gives a window's bounds and a display's work area. */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** What lens windows need of a window: Electron's `BrowserWindow` in the app, a fake in tests. */
export interface LensWindowParts {
  destroyed(): boolean
  /** Its bounds as they are when it's neither maximized nor minimized. */
  bounds(): Bounds
  close(): void
  /** Calls `listener` as the window is about to close, with what keeps it open. */
  onClose(listener: (keepOpen: () => void) => void): void
  onClosed(listener: () => void): void
}

export interface LensWindowsOptions {
  /** Whether the app is quitting, not called off. */
  quitting: () => boolean
  /** Quits the app, as the last editor window closing while it quits does. */
  quit: () => void
}

/** The lens windows open now, by their editor windows, and where each lens's window was last. */
export interface LensWindows<Window extends LensWindowParts> {
  /** Takes on a lens window its editor window just opened. */
  add(window: Window, opener: Window, lens: string): void
  /** Whether `window` is a lens window. */
  has(window: Window): boolean
  /** The lens windows `opener` opened that are open now. */
  of(opener: Window): Window[]
  /** Closes `opener`'s lens windows, as when its page loads again and what they showed has gone. */
  closeOf(opener: Window): void
  /** Where a lens's window opens, on screens with these work areas: where it last was, if that's still on one. */
  placeOf(lens: string, screens: readonly Bounds[]): Bounds | undefined
}

/** How much of a window's title bar has to be on a screen for it to open there again: enough to drag it by. */
const onScreen = { width: 100, height: 20 }

export function lensWindows<Window extends LensWindowParts>({
  quitting,
  quit
}: LensWindowsOptions): LensWindows<Window> {
  const openers = new Map<Window, Window>()
  const places = new Map<string, Bounds>()
  /** Editor windows whose closing is watched, and those that have closed. */
  const watched = new WeakSet<Window>()
  const closed = new WeakSet<Window>()

  return {
    add(window, opener, lens) {
      watchOpener(opener)
      openers.set(window, opener)

      window.onClose((keepOpen) => {
        // While the editor window decides whether the app quits, its lens windows stay, so its page sees them as they
        // are; they close with it.
        if (quitting() && !closed.has(opener) && !opener.destroyed()) {
          keepOpen()

          return
        }

        places.set(lens, window.bounds())
      })

      window.onClosed(() => openers.delete(window))
    },
    has: (window) => openers.has(window),
    of: (opener) => childrenOf(opener),
    closeOf: (opener) => closeChildren(opener),
    placeOf(lens, screens) {
      const place = places.get(lens)

      return place && screens.some((screen) => titleBarOn(place, screen)) ? place : undefined
    }
  }

  function closeChildren(opener: Window): Window[] {
    const children = childrenOf(opener)

    for (const child of children) {
      if (!child.destroyed()) {
        child.close()
      }
    }

    return children
  }

  function childrenOf(opener: Window): Window[] {
    return [...openers].flatMap(([window, each]) => (each === opener ? [window] : []))
  }

  function watchOpener(opener: Window): void {
    if (watched.has(opener)) {
      return
    }

    watched.add(opener)
    opener.onClosed(() => {
      closed.add(opener)
      const children = closeChildren(opener)

      // Its lens windows kept the app from quitting as it closed, so it quits now they've gone.
      if (children.length > 0 && quitting()) {
        quit()
      }
    })
  }
}

/** Whether enough of a window's title bar, its top edge, is on a screen to drag it by. */
function titleBarOn(window: Bounds, screen: Bounds): boolean {
  const left = Math.max(window.x, screen.x)
  const right = Math.min(window.x + window.width, screen.x + screen.width)
  const top = Math.max(window.y, screen.y)
  const bottom = Math.min(window.y + onScreen.height, screen.y + screen.height)

  return right - left >= onScreen.width && bottom - top >= onScreen.height
}
