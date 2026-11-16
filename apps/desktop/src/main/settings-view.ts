import { type BrowserWindow, type Session, shell, type WebContents, WebContentsView } from "electron"
import { ipc } from "../shared/channels.ts"
import type { SettingsOpening, SettingsProject, SettingsProjectChange } from "../shared/settings-view.ts"
import { onPage, opensInBrowser, pageGuard } from "./parity-page.ts"

/*
 * Settings, as its own web contents over the editor window (PAR-1090). The editor window's page runs the project's own
 * code beside the preload's bridge, so anything it can ask main for, the project can too. Settings changes what the
 * project mustn't, the person's settings for every project and extensions' among them, so it's a page of its own that
 * never loads project code: main owns it, lays it over the whole window, and takes those changes only from it. It
 * shows the open project's page too, from what the window sends, and passes each change to the project back to the
 * window, which makes it an undo step.
 */

export interface SettingsViewsOptions {
  /** The session the editor windows use, which Settings shares. */
  session: () => Session
  /** Settings' page: `settings.html` beside the editor's. */
  page: string
  preload: string
  /** What the editor window's preload is started with, which Settings' preload reads too, as the app's version. */
  arguments: string[]
}

export interface SettingsViews {
  open(window: BrowserWindow, opening: SettingsOpening): void
  close(window: BrowserWindow): void
  /** What the window sends of its open project, kept and passed to its Settings when it's open. */
  project(window: BrowserWindow, project: SettingsProject): void
  /** A change Settings made to the window's project, for the window to make an undo step. */
  changeProject(window: BrowserWindow, change: SettingsProjectChange): void
  /** The window a request came from when Settings' own page sent it, from its main frame; nothing otherwise. */
  windowOf(sender: WebContents, mainFrame: boolean): BrowserWindow | undefined
  /** The open Settings views' contents, which hear settings, shortcuts and updates change as windows do. */
  contents(): WebContents[]
}

interface Open {
  view: WebContentsView
  fit: () => void
}

/** Settings for each window that has it open. */
export function settingsViews(options: SettingsViewsOptions): SettingsViews {
  const open = new Map<BrowserWindow, Open>()
  const projects = new WeakMap<BrowserWindow, SettingsProject>()

  const close = (window: BrowserWindow) => {
    const shown = open.get(window)

    if (!shown) {
      return
    }

    open.delete(window)
    window.off("resize", shown.fit)

    if (!window.isDestroyed()) {
      window.contentView.removeChildView(shown.view)
      window.webContents.focus()
    }

    if (!shown.view.webContents.isDestroyed()) {
      shown.view.webContents.close()
    }
  }

  return {
    open(window, opening) {
      const shown = open.get(window)

      if (shown) {
        shown.view.webContents.send(ipc.settingsOpening, opening)
        shown.view.webContents.focus()

        return
      }

      const view = new WebContentsView({
        webPreferences: {
          session: options.session(),
          preload: options.preload,
          contextIsolation: true,
          sandbox: true,
          additionalArguments: [...options.arguments, "--parity-settings-view"]
        }
      })

      const contents = view.webContents
      // Clear, so its dialog dims the window under it as the editor's own dialogs do.
      view.setBackgroundColor("#00000000")

      const fit = () => {
        const { width, height } = window.getContentBounds()
        view.setBounds({ x: 0, y: 0, width, height })
      }

      fit()

      window.on("resize", fit)
      window.contentView.addChildView(view)
      open.set(window, { view, fit })
      window.once("closed", () => open.delete(window))

      // It stays on its own page: a link opens in the person's browser, and nothing opens a window.
      const guard = pageGuard({ page: options.page, openBrowser: (url) => void shell.openExternal(url) })
      contents.on("will-navigate", guard.navigate)
      contents.on("will-redirect", guard.redirect)
      contents.setWindowOpenHandler(({ url }) => {
        if (opensInBrowser(url)) {
          void shell.openExternal(url)
        }

        return { action: "deny" }
      })
      contents.on("render-process-gone", () => close(window))
      contents.once("did-finish-load", () => {
        contents.send(ipc.settingsOpening, opening)

        const project = projects.get(window)

        if (project) {
          contents.send(ipc.settingsProject, project)
        }

        contents.focus()
      })
      void contents.loadURL(options.page)
    },
    close,
    project(window, project) {
      projects.set(window, project)
      open.get(window)?.view.webContents.send(ipc.settingsProject, project)
    },
    changeProject(window, change) {
      if (!window.isDestroyed()) {
        window.webContents.send(ipc.settingsProjectChange, change)
      }
    },
    windowOf(sender, mainFrame) {
      for (const [window, shown] of open) {
        if (shown.view.webContents === sender) {
          return mainFrame && onPage(sender.getURL(), options.page) ? window : undefined
        }
      }

      return undefined
    },
    contents: () =>
      [...open.values()].flatMap((shown) => (shown.view.webContents.isDestroyed() ? [] : [shown.view.webContents]))
  }
}
