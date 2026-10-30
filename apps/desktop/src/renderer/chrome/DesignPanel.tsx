import type { ContainerKind } from "@parity-app/core"
import { Crown, MousePointerClick } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useProject } from "../canvas/context.ts"
import { DesignIcon, designColor } from "../canvas/kinds.tsx"
import { containerModes, withMainMode } from "../canvas/view.ts"
import { type ContainerEntry, useContainerEntry, useModeSettings, useNotes } from "../design-store.ts"
import { useSelection } from "../selection.ts"
import { ComponentsSection, ParamsSection } from "./ComponentsSection.tsx"
import { Hint } from "./Hint.tsx"
import { LayerPanel } from "./LayerPanel.tsx"
import { ArrangePanel, MultiLayerPanel } from "./MultiPanel.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { StatesSection } from "./StatesSection.tsx"
import { ModeViewportIcon } from "./viewports.tsx"

/** The Design tab: whatever is selected, a design, one of its layers or modes, or text on the canvas. */
export function DesignTab() {
  const { store, selection } = useProject()
  const selected = useSelection(selection)
  const entry = useContainerEntry(store, selected.design)
  if (selected.note) return <NotePanel noteKey={selected.note} />
  if (!entry) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
        <MousePointerClick className="size-5" />
        Select a design on the canvas or in Layers.
        <span className="text-xs">Click inside a design to select a layer, and double-click to go deeper.</span>
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
  const { store, selection } = useProject()
  const settings = useModeSettings(store)
  const selected = useSelection(selection)
  const { container, key } = entry
  const { primary, all } = containerModes(settings, container)
  const shown = new Set(container.view?.modes ?? [])
  const setModes = (modes: string[]) => store.updateView(key, (view) => ({ ...view, modes }))

  return (
    <>
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <DesignIcon
            kind={container.kind}
            className="size-4 shrink-0"
            style={{ color: designColor(container.kind) }}
          />
          <Input
            key={container.name}
            defaultValue={container.name}
            aria-label="Design name"
            className="h-7 flex-1 border-transparent bg-transparent px-1.5 text-base font-semibold shadow-none hover:border-input dark:bg-transparent"
            onBlur={(event) => {
              const name = event.currentTarget.value.trim()
              if (name && name !== container.name) {
                store.updateContainer(key, "Rename design", (current) => ({ ...current, name }))
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
          />
        </div>
        <div className="mt-2 flex items-center gap-2 pl-6">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={container.kind ?? "screen"}
            onValueChange={(value) =>
              value &&
              store.updateContainer(key, "Change design kind", (current) => ({
                ...current,
                kind: value as ContainerKind
              }))
            }
          >
            <ToggleGroupItem value="screen" className="h-6 px-2 text-xs">
              Screen
            </ToggleGroupItem>
            <ToggleGroupItem value="component" className="h-6 px-2 text-xs">
              Component
            </ToggleGroupItem>
          </ToggleGroup>
          <Hint label={entry.path} wait>
            <Badge variant="outline" className="min-w-0 truncate font-normal">
              {entry.path}
            </Badge>
          </Hint>
        </div>
      </div>

      <StatesSection entry={entry} />
      {container.kind === "component" ? <ParamsSection entry={entry} /> : <ComponentsSection entry={entry} />}

      <PanelSection
        title="Modes"
        description="Pick the mode this design is shown in. Turn others on to see them beside it. Edit modes in the Modes tab."
      >
        <RadioGroup
          value={primary.id}
          onValueChange={(mode) => store.updateView(key, (view) => withMainMode(view, mode, all))}
          className="gap-0.5"
          aria-label="Main mode"
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
                    <span className="truncate">{mode.name}</span>
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
                  <span className="text-xs text-muted-foreground">Main</span>
                ) : (
                  <Hint label="Show beside the main frame">
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
    </>
  )
}

function OptionChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">{children}</span>
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
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        Saved in {note.path}. Double-click it on the canvas to edit in place.
      </p>
    </PanelSection>
  )
}
