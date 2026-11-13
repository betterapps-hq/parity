import { Button, Kbd } from "@buildkitgg/shadcn-baseui-kit"
import { isBaseState } from "@parity-app/core"
import { kindsName } from "@parity-app/editor"
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
import { designColor, kindColors, layerLabel } from "../canvas/kinds.tsx"
import { type ContainerEntry, useContainerEntries } from "../design-store.ts"
import { actions } from "./actions.ts"
import { ExportSection } from "./ExportSection.tsx"
import { IconButton } from "./IconButton.tsx"
import { type Command, keymap, shortcutOf } from "./keymap.ts"
import { PanelSection, panelEnd } from "./PanelSection.tsx"
import { useStyleEditor } from "./style-editor.ts"
import { StyleSections } from "./StyleSections.tsx"

/**
 * Each button, by its command, so it runs as its keys do and Repeat last action can run it again, and shows the
 * command's name and keys.
 */
const alignments: { command: Command; icon: typeof AlignStartVertical }[] = [
  { command: "alignLeft", icon: AlignStartVertical },
  { command: "alignCenter", icon: AlignCenterVertical },
  { command: "alignRight", icon: AlignEndVertical },
  { command: "alignTop", icon: AlignStartHorizontal },
  { command: "alignMiddle", icon: AlignCenterHorizontal },
  { command: "alignBottom", icon: AlignEndHorizontal }
]

function AlignButtons({ distribute }: { distribute?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {alignments.map(({ command, icon: Icon }) => (
        <IconButton
          key={command}
          label={keymap[command].label}
          shortcut={command}
          onClick={() => void actions[command].run("panel")}
        >
          <Icon />
        </IconButton>
      ))}
      {distribute && (
        <>
          <span className="mx-1 h-5 w-px bg-border" />
          <IconButton
            label="Distribute horizontal spacing"
            shortcut="distributeHorizontal"
            onClick={() => void actions.distributeHorizontal.run("panel")}
          >
            <AlignHorizontalSpaceAround />
          </IconButton>
          <IconButton
            label="Distribute vertical spacing"
            shortcut="distributeVertical"
            onClick={() => void actions.distributeVertical.run("panel")}
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
        <div className="flex items-center gap-2 text-base font-semibold">
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
        <Button variant="outline" size="sm" className="flex-1" onClick={() => void actions.duplicate.run("panel")}>
          <Copy /> Duplicate
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-destructive"
          onClick={() => void actions.delete.run("panel")}
        >
          <Trash2 /> Delete
        </Button>
      </div>
      <ExportSection
        targets={entries.map((entry) => ({ design: entry.key, name: entry.container.name }))}
        label={`Export ${kindsName(entries.map((entry) => entry.container.kind))}`}
      />
    </>
  )
}

/**
 * Several layers of one design selected: their shared look, edited for all of them at once in the state being shown.
 * Values they share show as usual; the ones that differ are listed, and setting one gives them all that value.
 */
export function MultiLayerPanel({ entry, ids }: { entry: ContainerEntry; ids: string[] }) {
  const { store, info } = useProject()
  const entries = useContainerEntries(store)
  const editor = useStyleEditor(entry, ids)

  if (!editor) {
    return <p className="p-4 text-sm text-muted-foreground">These layers no longer exist.</p>
  }

  const { selection } = editor
  const { mixed } = selection
  // The rows whose fields work Mixed+8 out from each layer's own value.
  const perLayer = mixed.filter((key) => key === "width" || key === "height" || key === "padding" || key === "margin")
  const base = isBaseState(entry.container, selection.state.id)

  return (
    <>
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <div className="flex items-center gap-2 text-base font-semibold">
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
          <Button variant="outline" size="sm" onClick={() => void actions.wrap.run("panel")}>
            <Group /> {keymap.wrap.label} <Kbd className="ml-auto">{shortcutOf("wrap")}</Kbd>
          </Button>
        </div>
      </PanelSection>
      {mixed.length > 0 && (
        <p className={`type-description border-b py-2.5 pl-4 text-muted-foreground ${panelEnd}`}>
          Different across these layers: {mixed.map(styleLabel).join(", ")}. Setting one gives them all the same value.
          {perLayer.length > 0 && (
            <>
              {" "}
              In {perLayer.map(styleLabel).join(", ")}, <code className="font-mono">Mixed+8</code> adds 8 to each
              layer&apos;s own value.
            </>
          )}
        </p>
      )}
      <StyleSections editor={editor} container={entry.container} />
      <ExportSection
        targets={selection.layers.map((layer) => ({
          design: entry.key,
          node: layer.id,
          name: layerLabel(layer.node, entries, store.getComponentLibrary(), info.libraries)
        }))}
        label={`Export ${selection.layers.length} layers`}
      />
    </>
  )
}

/** "minWidth" reads as "min width". */
function styleLabel(name: string): string {
  return name.replaceAll(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)
}
