import { Search, SquarePlus, Telescope } from "lucide-react"
import { useProject } from "../../canvas/context.ts"
import { chipColors } from "../../canvas/kinds.tsx"
import { reviewToolLook } from "../../collaboration/annotations/annotation-kinds.ts"
import { ReviewToolBar } from "../../collaboration/annotations/ReviewToolBar.tsx"
import { useReview } from "../../selection.ts"
import { actions } from "../actions.ts"
import { IconButton } from "../IconButton.tsx"
import { keymap } from "../keymap.ts"
import { BarDivider } from "../toolbar-parts.tsx"
import { Tools } from "./Tools.tsx"
import { Warp } from "./Warp.tsx"

/**
 * The toolbar floating at the bottom of the canvas (PAR-780, PAR-795): the tools, then the commands that open a dialog or a
 * search (PAR-893): Insert, Find references, and Search actions for every command the toolbar leaves out. Picking a review tool warps it into that tool's bar, and Done or Esc warps it back.
 * The bar keeps drawing the review tool's side after Done, so its parts can fly back into the review button.
 */
export function FloatingToolbar() {
  const { selection } = useProject()
  const review = useReview(selection)
  const look = reviewToolLook(review.shown)
  const reviewing = !!review.picked

  return (
    <Warp
      className="absolute bottom-4 left-1/2 z-[400] -translate-x-1/2"
      label={reviewing ? look.barLabel : "Toolbar"}
      warped={reviewing}
      // The way back warps in the selection blue.
      color={reviewing ? look.color : chipColors.layer.background}
      home={
        <>
          <Tools />
          <BarDivider />
          <IconButton
            label={keymap.insert.label}
            shortcut={keymap.insert.keys[0]}
            size="icon"
            pressable
            onClick={() => void actions.insert.run("toolbar")}
          >
            <SquarePlus />
          </IconButton>
          <IconButton
            label={keymap.findReferences.label}
            shortcut={keymap.findReferences.keys[0]}
            size="icon"
            pressable
            onClick={() => void actions.findReferences.run("toolbar")}
          >
            <Telescope />
          </IconButton>
          <IconButton
            label={keymap.actions.label}
            shortcut={keymap.actions.keys[0]}
            size="icon"
            pressable
            onClick={() => void actions.actions.run("toolbar")}
          >
            <Search />
          </IconButton>
        </>
      }
      away={<ReviewToolBar tool={review.shown} />}
    />
  )
}
