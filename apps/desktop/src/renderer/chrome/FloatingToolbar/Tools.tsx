import { ToggleGroup, ToggleGroupItem } from "@buildkitgg/shadcn-baseui-kit"
import { isReviewTool } from "@parity-app/editor"
import { useState } from "react"
import { useProject } from "../../canvas/context.ts"
import { reviewToolLook } from "../../collaboration/annotations/annotation-kinds.ts"
import { isTool, type Tool, useReview, useTool } from "../../selection.ts"
import { actions } from "../actions.ts"
import { keymap } from "../keymap.ts"
import { BarDivider, CommandTip, pressable, pressMotion, toolButton, usePickPop } from "../toolbar-parts.tsx"
import { FrameMenu } from "./FrameMenu.tsx"
import { MoveMenu } from "./MoveMenu.tsx"
import { ReviewButton } from "./ReviewButton.tsx"
import { isPointerTool, type PointerTool, toolIcons, toolTints } from "./tool-details.ts"

/**
 * The tools as one group you move through with the arrow keys: what the pointer does, with its menu; then the colored
 * tools that add things (PAR-893), Frame with its menu, Text, and the review button with its menu. Each runs its command
 * from the toolbar.
 */
export function Tools() {
  const { selection } = useProject()
  const tool = useTool(selection)
  const review = useReview(selection)

  // The pointer tool picked last, kept while another tool is picked so its button still shows it.
  const [pointer, setPointer] = useState<PointerTool>(isPointerTool(tool) ? tool : "select")

  if (isPointerTool(tool) && tool !== pointer) {
    setPointer(tool)
  }

  const current = review.picked ?? tool

  return (
    <ToggleGroup
      spacing={1}
      value={[current]}
      onValueChange={([value]) => {
        if (value && isReviewTool(value)) {
          void actions[reviewToolLook(value).command].run("toolbar")
        } else if (value && isTool(value)) {
          void actions[value].run("toolbar")
        }
      }}
      aria-label="Tools"
      className="items-stretch gap-0.5"
    >
      <ToolButton tool={pointer} picked={current === pointer} />
      <MoveMenu current={pointer} />
      <BarDivider />
      <ToolButton tool="frame" picked={current === "frame"} />
      <FrameMenu />
      <ToolButton tool="text" picked={current === "text"} />
      <ReviewButton review={review} />
    </ToggleGroup>
  )
}

interface ToolButtonProps {
  tool: Tool
  picked: boolean
}

/** A tool, in its kind's color until it's picked, when it's white on the selection blue. */
function ToolButton({ tool, picked }: ToolButtonProps) {
  const Icon = toolIcons[tool]
  const tint = toolTints[tool]
  const popRef = usePickPop<HTMLButtonElement>(picked)

  return (
    <CommandTip command={tool}>
      <ToggleGroupItem
        ref={popRef}
        value={tool}
        aria-label={keymap[tool].label}
        className={`${toolButton} ${pressable}`}
        style={pressMotion}
      >
        <Icon style={picked || !tint ? undefined : { color: tint }} />
      </ToggleGroupItem>
    </CommandTip>
  )
}
