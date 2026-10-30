import {
  boardTarget,
  type ContainerSpec,
  type DesignNode,
  editNode,
  findNode,
  isBaseState,
  locateNode,
  nodeInState,
  type NodeStyle,
  resetOverride,
  shownVariants,
  styleKeys,
  targetPatches
} from "@parity-app/core"
import type { Alignment } from "@parity-app/editor"
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Copy,
  Group,
  Layers,
  Trash2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProject } from "../canvas/context.ts"
import { designColor, kindColors } from "../canvas/kinds.tsx"
import { useStylePreview } from "../canvas/style-preview.ts"
import type { ContainerEntry } from "../design-store.ts"
import { useSelection } from "../selection.ts"
import { spacingUnit, useTokenList } from "../tokens-store.ts"
import { alignSelection, deleteSelection, distributeSelection, duplicateSelection, wrapSelection } from "./commands.ts"
import { IconButton } from "./IconButton.tsx"
import { keymap } from "./keymap.ts"
import { editingState } from "./LayerPanel.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { type StyleEdit, type StyleEditor, StyleSections, styleValues } from "./StyleSections.tsx"

const alignments: { value: Alignment; label: string; shortcut: string; icon: typeof AlignStartVertical }[] = [
  { value: "left", label: "Align left", shortcut: keymap.alignLeft.keys[0], icon: AlignStartVertical },
  {
    value: "center",
    label: "Align horizontal centers",
    shortcut: keymap.alignCenter.keys[0],
    icon: AlignCenterVertical
  },
  { value: "right", label: "Align right", shortcut: keymap.alignRight.keys[0], icon: AlignEndVertical },
  { value: "top", label: "Align top", shortcut: keymap.alignTop.keys[0], icon: AlignStartHorizontal },
  {
    value: "middle",
    label: "Align vertical centers",
    shortcut: keymap.alignMiddle.keys[0],
    icon: AlignCenterHorizontal
  },
  { value: "bottom", label: "Align bottom", shortcut: keymap.alignBottom.keys[0], icon: AlignEndHorizontal }
]

function AlignButtons({ distribute }: { distribute?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {alignments.map(({ value, label, shortcut, icon: Icon }) => (
        <IconButton key={value} label={label} shortcut={shortcut} onClick={() => alignSelection(value)}>
          <Icon />
        </IconButton>
      ))}
      {distribute && (
        <>
          <span className="mx-1 h-5 w-px bg-border" />
          <IconButton
            label="Distribute horizontal spacing"
            shortcut={keymap.distributeHorizontal.keys[0]}
            onClick={() => distributeSelection("horizontal")}
          >
            <AlignHorizontalSpaceAround />
          </IconButton>
          <IconButton
            label="Distribute vertical spacing"
            shortcut={keymap.distributeVertical.keys[0]}
            onClick={() => distributeSelection("vertical")}
          >
            <AlignVerticalSpaceAround />
          </IconButton>
        </>
      )}
    </div>
  )
}

/** Several designs selected: line them up, space them out, copy or delete them together. */
export function ArrangePanel({ keys }: { keys: string[] }) {
  const { store } = useProject()
  const entries = keys.flatMap((key) => store.getEntry(key) ?? [])
  return (
    <>
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <Layers className="size-4 shrink-0" style={{ color: designColor("screen") }} />
          {entries.length} designs
        </div>
        <p className="mt-0.5 truncate pl-6 text-xs text-muted-foreground">
          {entries.map((entry) => entry.container.name).join(", ")}
        </p>
      </div>
      <PanelSection title="Arrange" description="Line up and space out the designs on the canvas.">
        <AlignButtons distribute={entries.length > 2} />
      </PanelSection>
      <div className="flex gap-2 px-4 py-3">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => duplicateSelection()}>
          <Copy /> Duplicate
        </Button>
        <Button variant="outline" size="sm" className="flex-1 text-destructive" onClick={() => deleteSelection()}>
          <Trash2 /> Delete
        </Button>
      </div>
    </>
  )
}

/**
 * Several layers of one design selected: their shared look, edited for all of them at once in the state being shown.
 * Values they share show as usual; the ones that differ are listed, and setting one gives them all that value.
 */
export function MultiLayerPanel({ entry, ids }: { entry: ContainerEntry; ids: string[] }) {
  const session = useProject()
  const { store, selection, tokens: tokenStore } = session
  const tokens = useTokenList(tokenStore)
  const selected = useSelection(selection)
  const { container, key } = entry
  const state = editingState(container, selected.state)
  const target = boardTarget(container, state.id)
  const base = isBaseState(container, state.id)
  const patches = targetPatches(container, target)
  const variants = shownVariants(container)
  const present = ids.filter((id) => findNode(container.root, id))
  const nodes = present.map((id) => nodeInState(findNode(container.root, id)!, state, variants))
  const preview = useStylePreview(session, key)
  const primary = nodes.at(-1)
  if (!primary) return <p className="p-4 text-sm text-muted-foreground">These layers no longer exist.</p>
  /** An edit worked out for each layer from its own style, once, and how to apply it to the design. */
  const edited = (edit: StyleEdit) => {
    const values = nodes.map((node) => styleValues(edit, node.style ?? {}) as NodeStyle)
    const apply = (current: ContainerSpec) =>
      present.reduce(
        (next, id, index) => editNode(next, boardTarget(next, state.id), id, { style: values[index] }),
        current
      )
    return { apply, keys: Object.keys(values.at(-1) ?? {}) }
  }

  const { common, mixed } = sharedStyle(nodes)
  const parents = new Set(present.map((id) => locateNode(container.root, id)?.ancestors.at(-1)?.id))
  const parent = parents.size === 1 ? locateNode(container.root, present[0]!)?.ancestors.at(-1) : undefined
  const parentStyle = parent?.type === "layout" ? (nodeInState(parent, state, variants).style ?? {}) : undefined
  const editor: StyleEditor = {
    style: common,
    changed: (name) => present.some((id) => patches?.[id]?.style?.[name] !== undefined),
    reset: (name) =>
      store.updateContainer(key, "Reset changes", (current) =>
        present.reduce(
          (next, id) => resetOverride(next, boardTarget(next, state.id), id, { kind: "style", key: name }),
          current
        )
      ),
    set: (edit, label = "Change style") => {
      const { apply, keys } = edited(edit)
      preview.settle(apply)
      store.updateContainer(key, `${label} on ${present.length} layers`, apply, {
        group: `edit:${present.join(",")}:style.${keys.join(",")}`
      })
    },
    preview: (edit) => preview.show(edited(edit).apply),
    endPreview: () => preview.cancel(),
    tokens,
    unit: spacingUnit(tokens),
    measure: () => undefined,
    mixed: (name) => mixed.includes(name)
  }

  return (
    <>
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <Layers className="size-4 shrink-0" style={{ color: kindColors.layer }} />
          {present.length} layers
        </div>
        <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
          In {container.name}
          {base ? "" : `, editing ${state.name}`}
        </p>
      </div>
      <PanelSection title="Arrange">
        <div className="flex flex-col gap-2">
          <AlignButtons />
          <Button variant="outline" size="sm" onClick={() => wrapSelection()}>
            <Group /> Wrap in layout <span className="ml-auto text-xs text-muted-foreground">Ctrl G</span>
          </Button>
        </div>
      </PanelSection>
      {mixed.length > 0 && (
        <p className="border-b px-4 py-2.5 text-xs text-muted-foreground">
          Different across these layers: {mixed.map(styleLabel).join(", ")}. Setting one gives them all the same value.
        </p>
      )}
      <StyleSections
        editor={editor}
        node={primary}
        parent={
          parentStyle
            ? { direction: parentStyle.direction ?? "column", grid: parentStyle.display === "grid" }
            : undefined
        }
      />
    </>
  )
}

/** The style values every node shares, and the properties set differently on some of them. */
function sharedStyle(nodes: DesignNode[]): { common: NodeStyle; mixed: (keyof NodeStyle)[] } {
  const common: Record<string, unknown> = {}
  const mixed: (keyof NodeStyle)[] = []
  for (const name of styleKeys) {
    const values = nodes.map((node) => JSON.stringify(node.style?.[name]))
    if (values.every((value) => value === values[0])) {
      if (nodes[0]!.style?.[name] !== undefined) common[name] = nodes[0]!.style[name]
    } else mixed.push(name)
  }
  return { common: common as NodeStyle, mixed }
}

/** "minWidth" reads as "min width". */
function styleLabel(name: string): string {
  return name.replaceAll(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)
}
