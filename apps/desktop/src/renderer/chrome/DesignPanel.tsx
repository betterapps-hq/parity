import { Switch } from "@buildkitgg/shadcn-baseui-kit"
import type { ResolvedMode } from "@parity-app/core"
import { designCapabilities, kindTitle, type InspectorSection, panelParts, selectionKey } from "@parity-app/editor"
import { Crown, GripVertical, MousePointerClick } from "lucide-react"
import type { ComponentType, ReactNode } from "react"
import { useProject } from "../canvas/context.ts"
import { DesignIcon, designColor } from "../canvas/kinds.tsx"
import { containerModes, withModeOrder } from "../canvas/view.ts"
import { useComponents } from "../components-store.ts"
import { type ContainerEntry, useContainerEntry, useModeSettings, useNotes } from "../design-store.ts"
import { FieldTarget, FirstStateName } from "../inspector/controls/field-row.tsx"
import { moved } from "../inspector/controls/list-parts.tsx"
import { useSortable } from "../inspector/controls/sortable.ts"
import { PropsSection } from "../inspector/sections/PropsSection.tsx"
import { useSelection } from "../selection.ts"
import { ComponentsSection } from "./ComponentsSection.tsx"
import { ExportSection } from "./ExportSection.tsx"
import { Hint } from "./Hint.tsx"
import { renameAndRecord } from "./inspector-events.ts"
import { LayerPanel } from "./LayerPanel.tsx"
import { ArrangePanel, MultiLayerPanel } from "./MultiPanel.tsx"
import { Name, NameInput } from "./Name.tsx"
import { PanelSection, panelEnd } from "./PanelSection.tsx"
import { ReferencePanel } from "./ReferencePanel.tsx"
import { headingIcon, headingName, SelectionHeading } from "./SelectionHeading.tsx"
import { StatesSection } from "./StatesSection.tsx"
import { useStyleEditor } from "./style-editor.ts"
import { StyleSections } from "./StyleSections.tsx"
import { ModeViewportIcon } from "./viewports.tsx"

/**
 * The Design tab: whatever is selected, a design, one of its layers or modes, or text on the canvas. Its number fields
 * edit the selection, so a run of Up and Down presses in one ends when the selection changes.
 */
export function DesignTab() {
  return (
    <DesignTabFields>
      <SelectedPanel />
    </DesignTabFields>
  )
}

/**
 * What every section in the Design tab reads beside the selection: which selection its fields edit, and the first
 * state's name. A story drawing one section alone puts it in this.
 */
export function DesignTabFields({ children }: { children: ReactNode }) {
  const { store, selection } = useProject()
  const selected = useSelection(selection)
  const entry = useContainerEntry(store, selected.design)

  return (
    <FieldTarget value={selectionKey(selected)}>
      <FirstStateName value={entry?.container.states?.[0]?.name ?? "Default"}>{children}</FirstStateName>
    </FieldTarget>
  )
}

function SelectedPanel() {
  const { store, selection } = useProject()
  const selected = useSelection(selection)
  const entry = useContainerEntry(store, selected.design)

  if (selected.note) {
    return <NotePanel noteKey={selected.note} />
  }

  if (selected.reference) {
    return <ReferencePanel referenceKey={selected.reference} />
  }

  if (!entry) {
    return (
      <div className="type-empty flex flex-col items-center gap-2 px-6 py-12 text-center text-muted-foreground">
        <MousePointerClick className="size-5" />
        Select a screen, component or frame on the canvas or in Layers.
        {/* A non-breaking hyphen, so the balanced hint never breaks "double-click" across its lines. */}
        <span className="text-xs">Click inside one to select a layer, and double‑click to go deeper.</span>
      </div>
    )
  }

  if (selected.nodes && selected.nodes.length > 1) {
    // Another set of layers starts its fields afresh, as another layer does, rather than keeping what was typed.
    return <MultiLayerPanel key={selected.nodes.join(",")} entry={entry} ids={selected.nodes} />
  }

  if (selected.designs && selected.designs.length > 1) {
    return <ArrangePanel keys={selected.designs} />
  }

  if (selected.node) {
    return <LayerPanel key={selected.node} entry={entry} nodeId={selected.node} />
  }

  return <DesignPanel entry={entry} />
}

/** A whole design's sections, as `panelParts` picks them from what it can do (PAR-1032). */
function DesignPanel({ entry }: { entry: ContainerEntry }) {
  const session = useProject()
  const components = useComponents(session.components)
  const can = designCapabilities(entry.container, (component) => components[component]?.takesStyle)

  return panelParts(can).map((section) => {
    const Section = designSections[section]

    return Section && <Section key={section} entry={entry} />
  })
}

/** What draws each of a design's sections; a layer's own, as Content and Attributes, aren't a design's. */
const designSections: Partial<Record<InspectorSection, ComponentType<{ entry: ContainerEntry }>>> = {
  header: DesignHeader,
  states: StatesSection,
  props: () => <PropsSection />,
  components: ComponentsSection,
  styles: FrameStyles,
  modes: ModesSection,
  export: DesignExport
}

/** Export, for a whole design. */
function DesignExport({ entry }: { entry: ContainerEntry }) {
  return (
    <ExportSection
      targets={[{ design: entry.key, name: entry.container.name }]}
      label={`Export ${entry.container.name}`}
    />
  )
}

/** A design's name and kind, and for a frame, the mode it's drawn in and that it isn't written to code. */
function DesignHeader({ entry }: { entry: ContainerEntry }) {
  const session = useProject()
  const { store } = session
  const settings = useModeSettings(store)
  const { container, key } = entry
  const { primary } = containerModes(settings, container)

  return (
    <>
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <SelectionHeading
          icon={<DesignIcon kind={container.kind} className={headingIcon} />}
          color={designColor(container.kind)}
          kind={kindTitle(container.kind)}
          detail={`${kindTitle(container.kind)}, saved in ${entry.path}`}
          name={
            <NameInput
              key={container.name}
              defaultValue={container.name}
              aria-label={`${kindTitle(container.kind)} name`}
              className={`h-7 border-transparent bg-transparent px-1.5 shadow-none hover:border-input dark:bg-transparent ${headingName}`}
              onBlur={(event) => {
                const name = event.currentTarget.value.trim()

                if (name && name !== container.name) {
                  renameAndRecord(store, key, name)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur()
                }
              }}
            />
          }
        />
        {container.kind === "frame" && (
          <div className="mt-2 flex flex-col gap-2 pl-1.5">
            <Hint label="Frames are drawn in the project's primary mode" wait>
              <span className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground">
                <Crown className="size-3 shrink-0 text-amber-400" aria-hidden />
                <ModeViewportIcon of={primary} className="size-3.5 shrink-0" aria-hidden />
                Drawn in {primary.name}
              </span>
            </Hint>
            <p className="type-description text-muted-foreground">
              A frame isn&apos;t written to code. Convert it to a component or a screen to use it in your app.
            </p>
          </div>
        )}
      </div>
    </>
  )
}

/**
 * A frame's own layout, size and fill, straight after its name, since selecting a frame selects its root layout: it
 * has no states, modes or params. Its width and height are the frame's size (see `useStyleEditor`).
 */
function FrameStyles({ entry }: { entry: ContainerEntry }) {
  const editor = useStyleEditor(entry, [entry.container.root.id])

  return editor ? <StyleSections editor={editor} container={entry.container} /> : null
}

/**
 * A screen's or component's modes in its own order, each put in place by its handle. The first is the one it shows
 * first, so it always shows; each other's switch shows it beside the first.
 */
function ModesSection({ entry }: { entry: ContainerEntry }) {
  const { store, selection } = useProject()
  const settings = useModeSettings(store)
  const selected = useSelection(selection)
  const { container, key } = entry
  const { all, ordered } = containerModes(settings, container)
  const shown = new Set(container.view?.modes ?? [])

  const move = (from: number, to: number) => {
    const order = moved(ordered, from, to)
    const label = order[0] === ordered[0] ? `Move ${ordered[from]!.name}` : `Show ${order[0]!.name} first`

    store.updateView(key, label, (view) =>
      withModeOrder(
        view,
        order.map((mode) => mode.id),
        all
      )
    )
  }

  const show = (mode: ResolvedMode, on: boolean) => {
    const modes = ordered.filter((each, index) => index > 0 && (each === mode ? on : shown.has(each.id)))

    store.updateView(key, on ? `Show ${mode.name}` : `Hide ${mode.name}`, (view) => ({
      ...view,
      modes: modes.map((each) => each.id)
    }))
  }

  return (
    <PanelSection title="Modes" count={ordered.length}>
      <div className="flex flex-col">
        {ordered.map((mode, index) => (
          <ModeRow
            key={mode.id}
            mode={mode}
            first={index === 0}
            shown={index === 0 || shown.has(mode.id)}
            selected={selected.mode === mode.id}
            onMove={ordered.length > 1 ? move : undefined}
            onShow={(on) => show(mode, on)}
          />
        ))}
      </div>
    </PanelSection>
  )
}

/** One mode: its handle, its viewport and name with what it's set to, and whether it shows beside the first. */
function ModeRow({
  mode,
  first,
  shown,
  selected,
  onMove,
  onShow
}: {
  mode: ResolvedMode
  first: boolean
  shown: boolean
  /** Selected on the canvas. */
  selected: boolean
  onMove: ((from: number, to: number) => void) | undefined
  onShow: (on: boolean) => void
}) {
  const sort = useSortable({ group: "modes", label: mode.name, onMove })

  return (
    <div
      {...sort.item}
      className={`flex min-h-11 items-center gap-1.5 rounded-md py-1 pr-3 ${selected ? "bg-accent/60" : ""}`}
    >
      {onMove ? (
        // No hint: the grip and its grab cursor say what it does, as a list's handle does (list-parts.tsx).
        <button
          type="button"
          aria-label={`Move ${mode.name}`}
          aria-keyshortcuts="ArrowUp ArrowDown"
          onPointerDown={sort.handle.onPointerDown}
          onKeyDown={sort.handle.onKeyDown}
          className="grid h-7 w-3 shrink-0 cursor-grab touch-none place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GripVertical className="size-3" />
        </button>
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs">
          <ModeViewportIcon of={mode} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Name>{mode.name}</Name>
        </span>
        <span className="flex flex-wrap gap-1">
          <OptionChip>{mode.width}px</OptionChip>
          {mode.options.slice(1).map(({ variable, option }) => (
            <OptionChip key={variable.id}>{option.name}</OptionChip>
          ))}
        </span>
      </div>
      <Hint label={first ? "The first mode always shows" : `Show ${mode.name} beside the first`}>
        <span className="inline-flex">
          <Switch
            size="sm"
            aria-label={`Show ${mode.name}`}
            checked={shown}
            disabled={first}
            onCheckedChange={onShow}
          />
        </span>
      </Hint>
    </div>
  )
}

/** A tag on a mode's row, its width or a variable's option: a Caption. */
function OptionChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-muted px-1.5 py-px text-2xs text-muted-foreground">{children}</span>
}

function NotePanel({ noteKey }: { noteKey: string }) {
  const { store } = useProject()
  const note = useNotes(store).find((entry) => entry.key === noteKey)

  if (!note) {
    return null
  }

  return (
    <PanelSection title="Text on the canvas">
      <textarea
        key={note.note.text}
        defaultValue={note.note.text}
        rows={5}
        onBlur={(event) => {
          const text = event.currentTarget.value

          if (text !== note.note.text) {
            store.updateNote(noteKey, text.trim() ? "Edit text" : "Delete text", (current) =>
              text.trim() ? { ...current, text } : undefined
            )
          }
        }}
        className="w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
      />
      <p className="type-description mt-2 px-1 text-muted-foreground">
        Saved in {note.path}. Double-click it on the canvas to edit in place.
      </p>
    </PanelSection>
  )
}
