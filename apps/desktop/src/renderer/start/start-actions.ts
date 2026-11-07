import { createContext, useContext } from "react"
import { toast } from "sonner"
import type { ProjectPicture } from "../../shared/protocol.ts"
import { openDialog } from "../chrome/app-dialogs.ts"
import { openProjectFile, openProjectFolder } from "../chrome/commands.ts"
import { recordInterface } from "../interface-events.ts"
import { workspace } from "../workspace.ts"

/** What the start page's controls do. In the window they act on the workspace; stories give their own. */
export interface StartActions {
  /** Opens a project in a tab, or switches to the tab it's already in. */
  open: (root: string) => void
  star: (root: string, starred: boolean) => void
  /** Takes a project off the recent list. */
  forget: (root: string) => void
  /**
   * Acme, the example project, when this copy of Parity has it. It opens like any other project, by its folder;
   * `picture` stands in until its own is kept.
   */
  example?: { root: string; name: string; picture?: ProjectPicture }
  openFolder: () => void
  openFile: () => void
  search: () => void
}

type StartAction = "new-project" | "open-folder" | "open-file" | "recent-project" | "search" | "star" | "forget"

/** Records a start page control's use, with whether it was on Home or a new tab (PAR-634). */
function recordStart(action: StartAction): void {
  recordInterface("start.action", { page: workspace.isHomeActive() ? "home" : "new", action })
}

export const workspaceActions: StartActions = {
  open: (root) => {
    recordStart("recent-project")
    void workspace.open(root)
  },
  star: (root, starred) => {
    recordStart("star")
    workspace.star(root, starred)
  },
  forget: (root) => {
    recordStart("forget")
    workspace.forgetRecent(root)
  },
  openFolder: () => {
    recordStart("open-folder")
    void openProjectFolder()
  },
  openFile: () => {
    recordStart("open-file")
    void openProjectFile()
  },
  search: () => {
    recordStart("search")
    openDialog("actions")
  }
}

const StartContext = createContext<StartActions>(workspaceActions)

export const StartActionsProvider = StartContext.Provider

export function useStartActions(): StartActions {
  return useContext(StartContext)
}

/**
 * Says that what a control starts isn't built yet, and what to do meanwhile. The start page shows the controls it was
 * designed with, so their places are there before what they do is.
 */
export function notReady(title: string, description?: string, action?: { label: string; onClick: () => void }): void {
  toast(title, { ...(description ? { description } : {}), ...(action ? { action } : {}) })
}

/** New project waits on the Buildkit scaffolder (PAR-284); until then, a project starts from a folder. */
export function newProjectNotReady(actions: StartActions): void {
  if (actions === workspaceActions) recordStart("new-project")
  notReady("New project isn't ready yet", "For now, open a React app's folder.", {
    label: "Open a folder",
    onClick: actions.openFolder
  })
}
