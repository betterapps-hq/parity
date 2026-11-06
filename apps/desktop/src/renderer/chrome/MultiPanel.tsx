import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { isBaseState } from "@parity-app/core"
import { type Alignment, kindsName } from "@parity-app/editor"
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
import { useProject } from "../canvas/context.ts"
import { designColor, kindColors } from "../canvas/kinds.tsx"
import type { ContainerEntry } from "../design-store.ts"
import { alignSelection, deleteSelection, distributeSelection, duplicateSelection, wrapSelection } from "./commands.ts"
import { IconButton } from "./IconButton.tsx"
import { keymap } from "./keymap.ts"
import { formatKeys } from "./keys.ts"
import { PanelSection, panelEnd } from "./PanelSection.tsx"
import { useStyleEditor } from "./style-editor.ts"
import { StyleSections } from "./StyleSections.tsx"

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
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <div className="flex items-center gap-2 font-semibold">
          <Layers className="size-4 shrink-0" style={{ color: designColor("screen") }} />
          {kindsName(entries.map((entry) => entry.container.kind))}
        </div>
        <p className="mt-0.5 truncate pl-6 text-xs text-muted-foreground">
          {entries.map((entry) => entry.container.name).join(", ")}
        </p>
      </div>
      <PanelSection title="Arrange" description="Line up and space them out on the canvas.">
        <AlignButtons distribute={entries.length > 2} />
      </PanelSection>
      <div className={`flex gap-2 py-3 pl-4 ${panelEnd}`}>
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
  const editor = useStyleEditor(entry, ids)
  if (!editor) return <p className="p-4 text-sm text-muted-foreground">These layers no longer exist.</p>
  const { selection } = editor
  const { mixed } = selection
  const base = isBaseState(entry.container, selection.state.id)
  const primary = selection.layers.at(-1)!.node
  return (
    <>
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <div className="flex items-center gap-2 font-semibold">
          <Layers className="size-4 shrink-0" style={{ color: kindColors.layer }} />
          {selection.layers.length} layers
        </div>
        <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
          In {entry.container.name}
          {base ? "" : `, editing ${selection.state.name}`}
        </p>
      </div>
      <PanelSection title="Arrange">
        <div className="flex flex-col gap-2">
          <AlignButtons />
          <Button variant="outline" size="sm" onClick={() => wrapSelection()}>
            <Group /> {keymap.wrap.label}{" "}
            <span className="ml-auto text-xs text-muted-foreground">{formatKeys(keymap.wrap.keys[0])}</span>
          </Button>
        </div>
      </PanelSection>
      {mixed.length > 0 && (
        <p className={`border-b py-2.5 pl-4 text-xs text-muted-foreground ${panelEnd}`}>
          Different across these layers: {mixed.map(styleLabel).join(", ")}. Setting one gives them all the same value,
          and <code className="font-mono">Mixed+8</code> adds 8 to each layer&apos;s own value.
        </p>
      )}
      <StyleSections editor={editor} node={primary} />
    </>
  )
}

/** "minWidth" reads as "min width". */
function styleLabel(name: string): string {
  return name.replaceAll(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)
}
