import { type LucideIcon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react"
import { Tabs as TabsPrimitive } from "radix-ui"
import type { ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Hint } from "./Hint.tsx"
import { IconButton } from "./IconButton.tsx"
import { panelLimits, setLayout, useLayout } from "./layout.ts"

export interface PanelTab {
  value: string
  label: string
  icon: LucideIcon
}

interface SidePanelProps {
  side: "left" | "right"
  label: string
  tabs: PanelTab[]
  defaultTab: string
  children: ReactNode
}

/**
 * A side panel with its tabs in one row along the top, Pen style: the open tab shows its name, the others just their
 * icon. A button collapses the panel, and its inner edge can be dragged to resize it. Collapsed, it becomes a slim
 * rail of the same tabs, so any of them is a click away. The open tab is remembered.
 */
export function SidePanel({ side, label, tabs, defaultTab, children }: SidePanelProps) {
  const layout = useLayout()
  const open = layout[side]
  const width = side === "left" ? layout.leftWidth : layout.rightWidth
  const tabKey = side === "left" ? "leftTab" : "rightTab"
  const saved = layout[tabKey]
  const current = tabs.some((tab) => tab.value === saved) ? saved! : defaultTab
  if (!open) return <CollapsedRail side={side} label={label} tabs={tabs} current={current} />
  const Close = side === "left" ? PanelLeftClose : PanelRightClose
  return (
    <aside
      className={`relative flex shrink-0 flex-col bg-background ${side === "left" ? "border-r" : "border-l"}`}
      style={{ width }}
      aria-label={label}
    >
      <TabsPrimitive.Root
        value={current}
        onValueChange={(value) => setLayout({ [tabKey]: value })}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className={`flex items-center gap-1 border-b p-2 ${side === "right" ? "flex-row-reverse" : ""}`}>
          <TabsPrimitive.List className="flex min-w-0 flex-1 items-center gap-0.5" aria-label={label}>
            {tabs.map(({ value, label: name, icon: Icon }) => {
              const selected = value === current
              const trigger = (
                <TabsPrimitive.Trigger
                  key={value}
                  value={value}
                  aria-label={name}
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                    selected
                      ? "bg-accent px-2.5 font-medium text-foreground"
                      : "w-8 justify-center text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  {selected && <span className="truncate">{name}</span>}
                </TabsPrimitive.Trigger>
              )
              return selected ? (
                trigger
              ) : (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                  <TooltipContent>{name}</TooltipContent>
                </Tooltip>
              )
            })}
          </TabsPrimitive.List>
          <IconButton
            label={`Hide ${label.toLowerCase()}`}
            shortcut="Ctrl \"
            onClick={() => setLayout({ [side]: false })}
          >
            <Close />
          </IconButton>
        </div>
        {children}
      </TabsPrimitive.Root>
      <ResizeEdge side={side} width={width} />
    </aside>
  )
}

/** A collapsed panel: the button that opens it again, then its tabs, each opening the panel on that tab. */
function CollapsedRail({
  side,
  label,
  tabs,
  current
}: {
  side: "left" | "right"
  label: string
  tabs: PanelTab[]
  current: string
}) {
  const tabKey = side === "left" ? "leftTab" : "rightTab"
  const Open = side === "left" ? PanelLeftOpen : PanelRightOpen
  const tooltipSide = side === "left" ? "right" : "left"
  return (
    <aside
      className={`flex w-12 shrink-0 flex-col items-center gap-1 bg-background py-2 ${side === "left" ? "border-r" : "border-l"}`}
      aria-label={label}
    >
      <IconButton label={`Show ${label.toLowerCase()}`} shortcut="Ctrl \" onClick={() => setLayout({ [side]: true })}>
        <Open />
      </IconButton>
      <div className="my-1 h-px w-6 bg-border" />
      {tabs.map(({ value, label: name, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={name}
              onClick={() => setLayout({ [side]: true, [tabKey]: value })}
              className={`grid size-8 place-items-center rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                value === current
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>{name}</TooltipContent>
        </Tooltip>
      ))}
    </aside>
  )
}

/**
 * The panel's inner edge: drag it to resize, or focus it and use the arrow keys. Double-click goes back to the
 * default width.
 */
function ResizeEdge({ side, width }: { side: "left" | "right"; width: number }) {
  const [min, max] = panelLimits[side]
  const key = side === "left" ? "leftWidth" : "rightWidth"
  const resize = (next: number) => setLayout({ [key]: Math.round(Math.min(max, Math.max(min, next))) })
  return (
    <Hint label="Drag to resize" detail="Double-click to reset." side={side === "left" ? "right" : "left"} wait>
      <button
        type="button"
        aria-label={`Resize panel, ${width} pixels wide`}
        className={`absolute inset-y-0 z-10 w-1.5 cursor-col-resize transition-colors outline-none hover:bg-ring/40 focus-visible:bg-ring/60 active:bg-ring/60 ${
          side === "left" ? "-right-[3px]" : "-left-[3px]"
        }`}
        onDoubleClick={() => setLayout({ [key]: side === "left" ? 256 : 320 })}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 48 : 16
          const outward = side === "left" ? "ArrowRight" : "ArrowLeft"
          const inward = side === "left" ? "ArrowLeft" : "ArrowRight"
          if (event.key === outward) resize(width + step)
          else if (event.key === inward) resize(width - step)
          else return
          event.preventDefault()
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          const target = event.currentTarget
          target.setPointerCapture(event.pointerId)
          const startX = event.clientX
          const move = (moveEvent: PointerEvent) =>
            resize(width + (moveEvent.clientX - startX) * (side === "left" ? 1 : -1))
          const end = () => {
            target.removeEventListener("pointermove", move)
            target.removeEventListener("pointerup", end)
            target.removeEventListener("pointercancel", end)
          }
          target.addEventListener("pointermove", move)
          target.addEventListener("pointerup", end)
          target.addEventListener("pointercancel", end)
        }}
      />
    </Hint>
  )
}
