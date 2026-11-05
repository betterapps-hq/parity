import type { ContainerSpec, DesignNode, NodeStyle } from "@parity-app/core"
import { Accessibility, CircleMinus, Crown, MonitorSmartphone, SlidersHorizontal } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { TabsContent } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useProject } from "../../canvas/context.ts"
import { Hint } from "../../chrome/Hint.tsx"
import { SidePanel } from "../../chrome/SidePanel.tsx"
import { type StyleEditor, StyleSections, styleValues } from "../../chrome/StyleSections.tsx"
import { ModeViewportIcon } from "../../chrome/viewports.tsx"
import type { ContainerEntry } from "../../design-store.ts"
import { spacingUnit, useTokenList } from "../../tokens-store.ts"
import { type Kind, KindIcon, kindColor, kindNames } from "./canvas.tsx"
import { modes, primaryMode } from "./data.ts"

const kinds: Kind[] = ["frame", "component", "screen"]

/**
 * The top of the Design tab for any of the three kinds: its icon and name, then which kind it is, lightest first. A
 * frame says where it's drawn and that it isn't written to code. Picking a heavier kind makes it that kind at once;
 * picking Frame for a screen or component asks first, since it drops things (see BackToAFrameDialog).
 */
export function KindHeader({ kind, name, onKind }: { kind: Kind; name: string; onKind?: (kind: Kind) => void }) {
  return (
    <div className="border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <KindIcon kind={kind} className="size-4 shrink-0" style={{ color: kindColor(kind) }} />
        <Input
          defaultValue={name}
          aria-label={`${kindNames[kind]} name`}
          className="h-7 flex-1 border-transparent bg-transparent px-1.5 text-base font-semibold shadow-none hover:border-input dark:bg-transparent"
        />
      </div>
      <div className="mt-2 flex flex-col gap-2 pl-6">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={kind}
          aria-label="Kind"
          onValueChange={(value) => {
            const picked = kinds.find((candidate) => candidate === value)
            if (picked) onKind?.(picked)
          }}
        >
          {kinds.map((each) => (
            <ToggleGroupItem key={each} value={each} className="h-6 px-2 text-xs">
              {kindNames[each]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {kind === "frame" && (
          <>
            <Hint label="Frames are drawn in the project's primary mode" wait>
              <span className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground">
                <Crown className="size-3 shrink-0 text-amber-400" aria-hidden />
                <ModeViewportIcon of={primaryMode} className="size-3.5 shrink-0" aria-hidden />
                Drawn in {primaryMode.name}
              </span>
            </Hint>
            <p className="text-xs text-muted-foreground">
              A frame isn&apos;t written to code. Convert it to a component or a screen to use it in your app.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * A frame's own layout, size and fill, from the inspector's real style sections. A frame is its root layout, so these
 * come straight after its name, with no states, modes or params above them.
 */
function FrameStyles({ root }: { root: DesignNode }) {
  const session = useProject()
  const tokens = useTokenList(session.tokens)
  const [style, setStyle] = useState<NodeStyle>(root.style ?? {})
  const node = { ...root, style }
  const editor: StyleEditor = {
    style,
    changed: () => false,
    reset: (name) => setStyle(({ [name]: _, ...rest }) => rest),
    set: (edit) =>
      setStyle((current) => {
        const values = styleValues(edit, current, {
          base: true,
          measure: () => undefined,
          type: root.type,
          column: false
        })
        const next: Record<string, unknown> = { ...current }
        for (const [key, value] of Object.entries(values)) {
          if (value === undefined) delete next[key]
          else next[key] = value
        }
        return next as NodeStyle
      }),
    tokens,
    unit: spacingUnit(tokens),
    measure: () => undefined
  }
  return <StyleSections editor={editor} node={node} />
}

/** The inspector as the app lays it out, its Design tab showing `children`. */
export function InspectorPanel({ children }: { children: ReactNode }) {
  return (
    <SidePanel
      side="right"
      label="Inspector"
      defaultTab="design"
      tabs={[
        { value: "design", label: "Design", icon: SlidersHorizontal },
        { value: "modes", label: "Modes", icon: MonitorSmartphone },
        { value: "accessibility", label: "Accessibility", icon: Accessibility }
      ]}
    >
      <TabsContent value="design" className="min-h-0 overflow-x-hidden overflow-y-auto">
        {children}
      </TabsContent>
    </SidePanel>
  )
}

/** The inspector for a selected frame: its name and kind, then its root layout's styles. */
export function FrameInspector({
  name,
  root,
  onKind
}: {
  name: string
  root: DesignNode
  onKind?: (kind: Kind) => void
}) {
  return (
    <InspectorPanel>
      <KindHeader kind="frame" name={name} onKind={onKind} />
      <FrameStyles root={root} />
    </InspectorPanel>
  )
}

/** What making a screen or component a frame drops, worked out from the design and the project's others. */
export interface FrameDrops {
  /** The state whose content the frame keeps: the first. */
  kept: string
  states: string[]
  previews: string[]
  params: string[]
  /** Instances of a component elsewhere, by the design they're in, which become plain layers. */
  instances: { design: string; count: number }[]
}

function countInstances(node: DesignNode, id: string): number {
  const own = node.type === "instance" && node.design === id ? 1 : 0
  const children = node.type === "layout" ? node.children : []
  return own + children.reduce((total, child) => total + countInstances(child, id), 0)
}

export function frameDrops(container: ContainerSpec, entries: readonly ContainerEntry[]): FrameDrops {
  const shown = new Set(container.view?.modes ?? [])
  return {
    kept: container.states[0]?.name ?? "Default",
    states: container.states.slice(1).map((state) => state.name),
    previews: modes.filter((each) => shown.has(each.id)).map((each) => each.name),
    params: Object.keys(container.params ?? {}),
    instances: entries.flatMap(({ container: other }) => {
      const count = other.id === container.id ? 0 : countInstances(other.root, container.id)
      return count ? [{ design: other.name, count }] : []
    })
  }
}

/** "a", "a and b", "a, b and c". */
function listed(items: string[]): string {
  if (items.length < 2) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** The lines of what a frame drops, each saying what goes and why it can't stay. */
export function dropLines(drops: FrameDrops): string[] {
  const lines: string[] = []
  if (drops.states.length) lines.push(`${plural(drops.states.length, "state")}: ${listed(drops.states)}`)
  if (drops.previews.length) {
    lines.push(`${plural(drops.previews.length, "preview")} beside it: ${listed(drops.previews)}`)
  }
  if (drops.params.length) {
    const shown = drops.params.slice(0, 3)
    const more = drops.params.length - shown.length
    lines.push(`${plural(drops.params.length, "param")}: ${shown.join(", ")}${more ? ` and ${more} more` : ""}`)
  }
  for (const { design, count } of drops.instances) {
    lines.push(`${plural(count, "instance")} in ${design}, which ${count === 1 ? "becomes" : "become"} plain layers`)
  }
  return lines
}

/**
 * Asked before a screen or component becomes a frame: it keeps its layers, as its first state shows them in the
 * primary mode, and the dialog lists what goes. Undo brings it all back.
 */
export function BackToAFrameDialog({
  kind,
  name,
  drops,
  open = true,
  onOpenChange
}: {
  kind: "screen" | "component"
  name: string
  drops: FrameDrops
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const lines = dropLines(drops)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convert {name} to a frame?</DialogTitle>
          <DialogDescription>
            {name} keeps its layers as {drops.kept} shows them in {primaryMode.name}. A frame has one size and
            isn&apos;t written to code, so the {kind} loses:
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1.5 text-sm">
          {lines.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <CircleMinus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">Undo brings them back.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>
            Cancel
          </Button>
          <Button onClick={() => onOpenChange?.(false)}>Convert to frame</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
