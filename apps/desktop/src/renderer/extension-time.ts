import { type ActiveModule, mainThreadMeter, scriptOwner } from "@parity-app/extension-host/main-thread"
import { track } from "./report-error.ts"
import { notify, type ToastKind, type ToastOptions } from "./toasts.tsx"
import { windowModules as windowModuleList } from "./window-module-list.ts"

/*
 * Window modules' time on the editor window's main thread (docs/proposals/extensions-in-the-window.md, "Time on the
 * main thread"): calls into them, timed by each tab's window modules, long animation frames from `long-tasks.ts`, and
 * layers' renders. In development, a module past its budget says it's slowing the editor, with Turn off.
 */

/** What the meter needs of the window's tabs, which `window-modules.ts` gives it. */
interface Tabs {
  /** The modules active in tabs the person can see now, with how many layers each draws. */
  activeShown(): ActiveModule[]
  /** Stops an extension's window module in every tab, until each opens again. */
  stop(extension: string): void
  /** An extension's name, as people see it. */
  displayName(extension: string): string
}

let tabs: Tabs | undefined

/** The window's meter: every tab's window modules tell it their calls, and the window its long frames. */
export const extensionTime = mainThreadMeter({
  record: track,
  ownerOf: (sourceURL) => scriptOwner(sourceURL, windowModuleList.keys()),
  overBudget(extension) {
    if (!import.meta.env.DEV || !tabs) {
      return
    }

    const known = tabs
    const { kind, title, options } = slowToast(known.displayName(extension), () => known.stop(extension))
    notify.show(kind, title, options)
  },
  // React's Profiler reports renders in development builds only. Read when asked, since code bundled without Vite,
  // as layer-snap.test.ts's, has no `import.meta.env`.
  rendersCounted: () => import.meta.env.DEV
})

/** A toast to show, as `notify.show` takes it. */
export interface SlowToast {
  kind: ToastKind
  title: string
  options: ToastOptions
}

/** The toast saying an extension is slowing the editor, whose Turn off stops it in this window's tabs. */
export function slowToast(name: string, turnOff: () => void): SlowToast {
  return {
    kind: "warning",
    title: `${name} is slowing the editor`,
    options: { action: { label: "Turn off", run: turnOff } }
  }
}

let ticking: ReturnType<typeof setInterval> | undefined

/** Starts the minutes `extension.mainThread` is recorded for, once the window has window modules. */
export function measureExtensions(given: Tabs): void {
  tabs = given

  ticking ??= setInterval(() => {
    const active = document.visibilityState === "visible" ? given.activeShown() : []
    extensionTime.minute(active)
  }, 60_000)
}
