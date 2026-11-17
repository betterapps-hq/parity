import type { Lens } from "@parity-app/lenses"
import type { ComponentType, ReactNode } from "react"

/**
 * A view the shell draws for a lens. Its props are checked both ways, as React's own event handlers are, so lenses with
 * ids of their own can be held among others.
 */
type LensComponent<Props> = { bivarianceHack(props: Props): ReactNode }["bivarianceHack"]

/** What a lens's left panel and inspector get from the shell. */
export interface LensSideProps<Id extends string = string> {
  lens: Id
  /** Hides the panel, as its own hide button does. */
  onHide: () => void
}

/**
 * A lens as the shell draws it: its data from `@parity-app/lenses`, its icon, and the three views it brings. The shell
 * renders whichever lenses it's given, so the app's lenses and a story's test lenses are drawn the same way.
 */
export interface LensView<Id extends string = string> extends Lens<Id> {
  /** Drawn in the lens bar, on its tab and in its menus. */
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>
  /** Its canvas, in its tab, in any window. */
  Canvas: LensComponent<{ lens: Id }>
  /** Its left panel, beside the lens bar while it's in focus. */
  Panel: LensComponent<LensSideProps<Id>>
  /** Its inspector, at the window's right while it's in focus. */
  Inspector: LensComponent<LensSideProps<Id>>
}
