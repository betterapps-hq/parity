import { createContext, useContext } from "react"
import { toast } from "sonner"
import { openDialog } from "../chrome/app-dialogs.ts"
import { openProjectFile, openProjectFolder } from "../chrome/commands.ts"
import { workspace } from "../workspace.ts"

/** What the start page's controls do. In the window they act on the workspace; stories give their own. */
export interface StartActions {
  /** Opens a project in a tab, or switches to the tab it's already in. */
  open: (root: string) => void
  star: (root: string, starred: boolean) => void
  /** Takes a project off the recent list. */
  forget: (root: string) => void
  openFolder: () => void
  openFile: () => void
  search: () => void
}

export const workspaceActions: StartActions = {
  open: (root) => void workspace.open(root),
  star: (root, starred) => workspace.star(root, starred),
  forget: (root) => workspace.forgetRecent(root),
  openFolder: () => void openProjectFolder(),
  openFile: () => void openProjectFile(),
  search: () => openDialog("actions")
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
  notReady("New project isn't ready yet", "For now, open a React app's folder.", {
    label: "Open a folder",
    onClick: actions.openFolder
  })
}
