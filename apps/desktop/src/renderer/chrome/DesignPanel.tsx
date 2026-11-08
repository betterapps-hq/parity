import { Button, Label, RadioGroup, RadioGroupItem, Switch } from "@buildkitgg/shadcn-baseui-kit"
import { kindName, kindTitle, selectionKey } from "@parity-app/editor"
import { Crown, MousePointerClick } from "lucide-react"
import { useProject } from "../canvas/context.ts"
import { DesignIcon, designColor } from "../canvas/kinds.tsx"
import { containerModes, modeNames, withMainMode } from "../canvas/view.ts"
import { type ContainerEntry, useContainerEntry, useModeSettings, useNotes } from "../design-store.ts"
import { useSelection } from "../selection.ts"
import { ComponentsSection, InCodeSection, ParamsSection } from "./ComponentsSection.tsx"
import { ExportSection } from "./ExportSection.tsx"
import { FieldTarget, FirstStateName } from "./fields.tsx"
import { Hint } from "./Hint.tsx"
import { updateAndRecord } from "./inspector-events.ts"
import { LayerPanel } from "./LayerPanel.tsx"
import { ArrangePanel, MultiLayerPanel } from "./MultiPanel.tsx"
import { Name, NameInput } from "./Name.tsx"
import { PanelSection, panelEnd } from "./PanelSection.tsx"
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
  const { store, selection } = useProject()
  const selected = useSelection(selection)
  const entry = useContainerEntry(store, selected.design)
  return (
    <FieldTarget value={selectionKey(selected)}>
      <FirstStateName value={entry?.container.states[0]?.name ?? "Default"}>
        <SelectedPanel />
      </FirstStateName>
    </FieldTarget>
  )
}

function SelectedPanel() {
  const { store, selection } = useProject()
  const selected = useSelection(selection)
  const entry = useContainerEntry(store, selected.design)
  if (selected.note) return <NotePanel noteKey={selected.note} />
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
  if (selected.designs && selected.designs.length > 1) return <ArrangePanel keys={selected.designs} />
  if (selected.node) return <LayerPanel key={selected.node} entry={entry} nodeId={selected.node} />
  return <DesignPanel entry={entry} />
}

function DesignPanel({ entry }: { entry: ContainerEntry }) {
  const { store } = useProject()
  const settings = useModeSettings(store)
  const { container, key } = entry
  const { primary } = containerModes(settings, container)
  const kind = kindName(container.kind)

  return (
    <>
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <SelectionHeading
          icon={
            <DesignIcon kind={container.kind} className={headingIcon} style={{ color: designColor(container.kind) }} />
          }
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
                  updateAndRecord(store, key, `Rename ${kind}`, (current) => ({ ...current, name }), {
                    field: "name",
                    read: (current) => current.name
                  })
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
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

      {container.kind === "frame" ? <FrameStyles entry={entry} /> : <ScreenOrComponentSections entry={entry} />}

      <ExportSection targets={[{ design: key, name: container.name }]} label={`Export ${container.name}`} />
    </>
  )
}

/**
 * A frame's own layout, size and fill, straight after its name, since selecting a frame selects its root layout: it
 * has no states, modes or params. Its width and height are the frame's size (see `useStyleEditor`).
 */
function FrameStyles({ entry }: { entry: ContainerEntry }) {
  const editor = useStyleEditor(entry, [entry.container.root.id])
  return editor ? <StyleSections editor={editor} node={entry.container.root} /> : null
}

/** A screen's or component's states, params or components, the modes it shows, and a component's code. */
function ScreenOrComponentSections({ entry }: { entry: ContainerEntry }) {
  const { store, selection } = useProject()
  const settings = useModeSettings(store)
  const selected = useSelection(selection)
  const { container, key } = entry
  const { primary, all } = containerModes(settings, container)
  const shown = new Set(container.view?.modes ?? [])
  const kind = kindName(container.kind)
  const setModes = (modes: string[]) =>
    store.updateView(key, `Show ${modeNames(all, [primary.id, ...modes])}`, (view) => ({ ...view, modes }))

  return (
    <>
      <StatesSection entry={entry} />
      {container.kind === "component" ? <ParamsSection entry={entry} /> : <ComponentsSection entry={entry} />}

      <PanelSection
        title="Modes"
        description={`Pick the mode this ${kind} shows first. Turn others on to see them beside it. Edit modes in the Modes tab.`}
      >
        <RadioGroup
          value={primary.id}
          onValueChange={(mode) =>
            store.updateView(key, `Show ${modeNames(all, [mode])} first`, (view) => withMainMode(view, mode, all))
          }
          className="gap-0.5"
          aria-label="Shown first"
        >
          {all.map((mode, index) => {
            const isMain = mode.id === primary.id
            const isSelected = selected.mode === mode.id
            return (
              <div
                key={mode.id}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/50 ${
                  isSelected ? "bg-accent/60" : ""
                }`}
              >
                <RadioGroupItem value={mode.id} id={`main-${mode.id}`} aria-label={`Show in ${mode.name}`} />
                <Label
                  htmlFor={`main-${mode.id}`}
                  className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0 font-normal"
                >
                  <span className="flex items-center gap-1.5 text-sm">
                    <ModeViewportIcon of={mode} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <Name>{mode.name}</Name>
                    {index === 0 && <Crown className="size-3 shrink-0 text-amber-400" aria-label="Project primary" />}
                  </span>
                  <span className="flex flex-wrap gap-1 pt-0.5">
                    <OptionChip>{mode.width}px</OptionChip>
                    {mode.options.slice(1).map(({ variable, option }) => (
                      <OptionChip key={variable.id}>{option.name}</OptionChip>
                    ))}
                  </span>
                </Label>
                {isMain ? (
                  <span className="text-xs whitespace-nowrap text-muted-foreground">Shown first</span>
                ) : (
                  <Hint label="Show beside the first preview">
                    <span className="inline-flex">
                      <Switch
                        size="sm"
                        aria-label={`Show ${mode.name} beside it`}
                        checked={shown.has(mode.id)}
                        onCheckedChange={(on) =>
                          setModes(
                            all
                              .filter((m) => !(m.id === primary.id) && (m.id === mode.id ? on : shown.has(m.id)))
                              .map((m) => m.id)
                          )
                        }
                      />
                    </span>
                  </Hint>
                )}
              </div>
            )
          })}
        </RadioGroup>
        <div className="mt-3 flex gap-2 px-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModes(all.filter((mode) => mode.id !== primary.id).map((mode) => mode.id))}
          >
            Show all
          </Button>
          <Button variant="outline" size="sm" onClick={() => setModes([])}>
            Only {primary.name}
          </Button>
        </div>
      </PanelSection>
      {container.kind === "component" && <InCodeSection entry={entry} />}
    </>
  )
}

/** A tag on a mode's row, its width or a variable's option: a Caption. */
function OptionChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-muted px-1.5 py-px text-2xs text-muted-foreground">{children}</span>
}

function NotePanel({ noteKey }: { noteKey: string }) {
  const { store } = useProject()
  const note = useNotes(store).find((entry) => entry.key === noteKey)
  if (!note) return null
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
