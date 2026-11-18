import type { Layout, LensMark } from "@parity-app/lenses"
import { createContext, use } from "react"
import type { LensView } from "./registry.ts"

/** What can be done with the lenses, from the lens bar, the window's menus or a lens's own views. */
export interface LensActions<Id extends string = string> {
  /** The lens in the tab in focus, none with every tab closed. */
  current: Id | undefined
  /** How the lens bar marks a lens: in focus, open in another tab or window, or with nothing for the project. */
  mark(lens: Id): LensMark
  /** Shows a lens where it's open, else in the tab in focus, as a link opens in the tab it's clicked in. */
  show(lens: Id): void
  /** Shows a lens where it's open, else in a new tab, as Ctrl+click opens a link. */
  openTab(lens: Id): void
  canOpenTab(lens: Id): boolean
  splitRight(lens: Id): void
  canSplit(lens: Id): boolean
  toWindow(lens: Id): void
  /** Whether lenses can move to windows of their own here; without, the menus don't offer it. */
  windows: boolean
  canMoveToWindow(lens: Id): boolean
  toMain(lens: Id): void
  canMoveToMain(lens: Id): boolean
  close(lens: Id): void
  canClose(lens: Id): boolean
  /** Shows the lens a link in a lens's views points at, in the group in focus, or beside it. */
  followLink(lens: Id, beside: boolean): void
  /** Whether the left panel and the inspector are showing. */
  panels: { left: boolean; right: boolean }
  togglePanels(): void
}

/** What the shell's own parts read: the lenses by id, the layout and what can be done. */
export interface Shell {
  lenses: ReadonlyMap<string, LensView>
  layout: Layout
  actions: LensActions
}

export const ShellContext = createContext<Shell | undefined>(undefined)

/** The shell around the component, which only what `LensWorkspace` renders has. */
export function useShell(): Shell {
  const shell = use(ShellContext)

  if (!shell) {
    throw new Error("Only what LensWorkspace renders can use its lenses.")
  }

  return shell
}

/** What can be done with the lenses, for the title bar's menus and a lens's own views inside a `LensWorkspace`. */
export function useLensWorkspace<Id extends string = string>(): LensActions<Id> {
  // SAFETY: the workspace's actions take the ids of the lenses it was given, which are the caller's.
  return useShell().actions as LensActions<Id>
}
