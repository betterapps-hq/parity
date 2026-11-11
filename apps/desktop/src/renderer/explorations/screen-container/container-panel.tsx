import {
  Badge,
  Button,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import {
  boardTarget,
  editNode,
  editsDesign,
  findRepeats,
  type NodeChange,
  nodeOnBoard,
  type PatchField,
  type RepeatCandidate,
  resetOverride,
  type StateSpec,
  targetPatches
} from "@parity-app/core"
import { editingState, type Selection, selectionKey } from "@parity-app/editor"
import { Crown, Diamond, MousePointerClick, ScanSearch, Sparkles } from "lucide-react"
import { type ReactNode, useState } from "react"
import { useProject } from "../../canvas/context.ts"
import { DesignIcon, designColor, kindColors } from "../../canvas/kinds.tsx"
import { containerModes, modeNames, withMainMode } from "../../canvas/view.ts"
import { extractIntoComponent } from "../../chrome/components.ts"
import { ParamsSection } from "../../chrome/ComponentsSection.tsx"
import { DesignTab } from "../../chrome/DesignPanel.tsx"
import { FieldTarget } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { PropsSection } from "../../chrome/PropsSection.tsx"
import { revealSelection } from "../../chrome/reveal.ts"
import { StatesSection } from "../../chrome/StatesSection.tsx"
import { useStyleEditor } from "../../chrome/style-editor.ts"
import { StyleSections } from "../../chrome/StyleSections.tsx"
import { ModeViewportIcon } from "../../chrome/viewports.tsx"
import { useComponents } from "../../components-store.ts"
import { type ContainerEntry, useContainerEntry, useModeSettings } from "../../design-store.ts"
import { useSelection } from "../../selection.ts"

/*
 * The inspector's Design tab once a screen and its root layout are one selection (PAR-542, decision 3 of
 * docs/proposals/new-user-experience.md). Selecting a screen or component shows its root's size, fill, padding and auto
 * layout first, as Figma shows a top-level frame's, then what only a screen or component has: its variants and params,
 * its states, its modes, and finding repeated parts. Everything else, a layer, several layers or a note, still shows
 * the shipped panels.
 *
 * The sections are the shipped ones wherever they're exported. The editing bar, Modes and Repeated parts are copies of
 * the shipped ones in DesignPanel, LayerPanel and ComponentsSection, with the glossary's words; PAR-547 moves them.
 */

/** Whether a selection is one screen or component on its own, or its root, which is now the same thing. */
export function selectsContainer(selected: Selection, entry: ContainerEntry | undefined): entry is ContainerEntry {
  if (!entry || selected.note || (selected.designs?.length ?? 0) > 1) {
    return false
  }

  if ((selected.nodes?.length ?? 0) > 1) {
    return false
  }

  return !selected.node || selected.node === entry.container.root.id
}

/** The Design tab: a screen or component as its container, or the shipped panel for anything else selected. */
export function ContainerTab() {
  const { store, selection } = useProject()
  const selected = useSelection(selection)
  const entry = useContainerEntry(store, selected.design)

  if (!selected.design && !selected.note) {
    return <NothingSelected />
  }

  if (!selectsContainer(selected, entry)) {
    return <DesignTab />
  }

  return (
    <FieldTarget value={selectionKey(selected)}>
      <ContainerPanel key={entry.key} entry={entry} />
    </FieldTarget>
  )
}

/**
 * Nothing selected, in the words PAR-541 settled: what to select. There's no empty-canvas state, since every project
 * opens on a screen (PAR-560). The shipped panel still says "Select a design".
 */
function NothingSelected() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
      <MousePointerClick className="size-5" />
      Select a screen or component on the canvas or in Layers.
      <span className="text-xs">Its size, layout and styles show here, then its states and modes.</span>
    </div>
  )
}

/** A screen or component: its name and kind, its root's sections, then its own. */
export function ContainerPanel({ entry }: { entry: ContainerEntry }) {
  const component = entry.container.kind === "component"

  return (
    <>
      <ContainerHeader entry={entry} />
      <RootSections entry={entry} />
      {component && <ParamsSection entry={entry} />}
      <StatesSection entry={entry} />
      <ModesSection entry={entry} />
      {!component && <RepeatedPartsSection entry={entry} />}
    </>
  )
}

function ContainerHeader({ entry }: { entry: ContainerEntry }) {
  const { store, selection } = useProject()
  const selected = useSelection(selection)
  const { container, key } = entry
  const kind = container.kind ?? "screen"
  const noun = kind === "component" ? "Component" : "Screen"
  const variants = Object.values(container.params ?? {}).some((param) => param.type === "variant")

  return (
    <div className="border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <DesignIcon kind={container.kind} className="size-4 shrink-0" style={{ color: designColor(container.kind) }} />
        <Input
          key={container.name}
          defaultValue={container.name}
          aria-label={`${noun} name`}
          className="h-7 flex-1 border-transparent bg-transparent px-1.5 text-base font-semibold shadow-none hover:border-input dark:bg-transparent"
          onBlur={(event) => {
            const name = event.currentTarget.value.trim()

            if (name && name !== container.name) {
              store.updateContainer(key, `Rename ${noun.toLowerCase()}`, (current) => ({ ...current, name }))
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur()
            }
          }}
        />
      </div>
      <div className="mt-2 flex items-center gap-2 pl-6">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[kind]}
          aria-label="Screen or component"
          onValueChange={([value]) => {
            if (value !== "screen" && value !== "component") {
              return
            }

            store.updateContainer(
              key,
              value === "component" ? "Make it a component" : "Make it a screen",
              (current) => ({
                ...current,
                kind: value
              })
            )
          }}
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
      {/* Says where the root's edits go, once there's somewhere else for them to go. */}
      {(container.states.length > 1 || variants) && (
        <EditingBar entry={entry} state={editingState(container, selected.state)} />
      )}
    </div>
  )
}

/** The state, or variant, the root's edits go to, and a switch to another. LayerPanel's StateTarget, reworded. */
function EditingBar({ entry, state }: { entry: ContainerEntry; state: StateSpec }) {
  const { store, selection } = useProject()
  const selected = useSelection(selection)
  const target = boardTarget(entry.container, state.id)
  const base = editsDesign(entry.container, target)
  const chosen = target.variant

  const variant = chosen
    ? entry.container.params?.[chosen.param]?.options?.find((option) => option.id === chosen.option)
    : undefined

  let changes = "changes only this state"

  if (base) {
    changes = "changes every state"
  } else if (variant && state.id === entry.container.states[0]!.id) {
    changes = `changes only the ${variant.name} variant`
  }

  return (
    <div
      className="mt-3 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
      style={
        base
          ? undefined
          : { borderColor: kindColors.agent, background: "color-mix(in oklch, var(--canvas-agent) 8%, transparent)" }
      }
    >
      <span className="shrink-0 text-muted-foreground">Editing</span>
      <Select
        items={entry.container.states.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
        value={state.id}
        onValueChange={(id) => {
          if (!id) {
            return
          }

          const name = entry.container.states.find((candidate) => candidate.id === id)?.name ?? id
          store.updateView(entry.key, `Show ${name}`, (view) => ({ ...view, state: id }))
          selection.set({ ...selected, state: id })
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label="State to edit"
          className="h-6 flex-1 border-none bg-transparent px-1.5 text-xs shadow-none dark:bg-transparent"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {entry.container.states.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              {candidate.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="shrink-0 text-muted-foreground">{changes}</span>
    </div>
  )
}

/**
 * The root's own sections, as the layer inspector shows a layer's: a component root's props, then every style section
 * that applies. A root has no parent, so there's no Position or Align self, and nothing to hide it in.
 */
function RootSections({ entry }: { entry: ContainerEntry }) {
  const session = useProject()
  const { store, selection } = session
  const selected = useSelection(selection)
  const components = useComponents(session.components)
  const { container, key } = entry
  const rootId = container.root.id
  const state = editingState(container, selected.state)
  const target = boardTarget(container, state.id)
  const node = nodeOnBoard(container, container.root, state)
  const editor = useStyleEditor(entry, [rootId])
  const override = targetPatches(container, target)?.[rootId]

  const change = (label: string, value: NodeChange, gesture?: string) =>
    store.updateContainer(key, label, (current) => editNode(current, boardTarget(current, state.id), rootId, value), {
      gesture
    })

  const reset = (field?: PatchField) =>
    store.updateContainer(key, "Reset change", (current) =>
      resetOverride(current, boardTarget(current, state.id), rootId, field)
    )

  return (
    <>
      {node.type === "component" && (
        <PropsSection
          node={node}
          info={components[node.component]}
          changed={(name) => override?.props?.[name] !== undefined}
          onChange={(name, value, gesture) => change(`Change ${name}`, { props: { [name]: value } }, gesture)}
          onReset={(name) => reset({ kind: "props", key: name })}
        />
      )}
      {editor && <StyleSections editor={editor} container={entry.container} />}
    </>
  )
}

/** The modes a screen or component shows: DesignPanel's Modes section, with previews where it says frames. */
function ModesSection({ entry }: { entry: ContainerEntry }) {
  const { store, selection } = useProject()
  const settings = useModeSettings(store)
  const selected = useSelection(selection)
  const { container, key } = entry
  const { primary, all } = containerModes(settings, container)
  const shown = new Set(container.view?.modes ?? [])
  const noun = container.kind === "component" ? "component" : "screen"

  const setModes = (modes: string[]) =>
    store.updateView(key, `Show ${modeNames(all, [primary.id, ...modes])}`, (view) => ({ ...view, modes }))

  return (
    <PanelSection
      title="Modes"
      description={`Pick the mode this ${noun} is shown in. Turn others on to see their previews beside it. Edit modes in the Modes tab.`}
    >
      <RadioGroup
        value={primary.id}
        onValueChange={(mode) =>
          store.updateView(key, `Show ${modeNames(all, [mode])} first`, (view) => withMainMode(view, mode, all))
        }
        className="gap-0.5"
        aria-label="Main mode"
      >
        {all.map((mode, index) => {
          const isMain = mode.id === primary.id

          return (
            <div
              key={mode.id}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/50 ${
                selected.mode === mode.id ? "bg-accent/60" : ""
              }`}
            >
              <RadioGroupItem value={mode.id} id={`first-${mode.id}`} aria-label={`Show in ${mode.name}`} />
              <Label
                htmlFor={`first-${mode.id}`}
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
                <Hint label="Show beside the main preview">
                  <span className="inline-flex">
                    <Switch
                      size="sm"
                      aria-label={`Show ${mode.name} beside it`}
                      checked={shown.has(mode.id)}
                      onCheckedChange={(on) =>
                        setModes(
                          all
                            .filter((m) => m.id !== primary.id && (m.id === mode.id ? on : shown.has(m.id)))
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
  )
}

function OptionChip({ children }: { children: ReactNode }) {
  return <span className="rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">{children}</span>
}

/** ComponentsSection under a heading that says what it does, rather than "Components". */
function RepeatedPartsSection({ entry }: { entry: ContainerEntry }) {
  const [candidates, setCandidates] = useState<RepeatCandidate[]>()
  let content: ReactNode

  if (candidates === undefined) {
    content = (
      <Button variant="outline" size="sm" onClick={() => setCandidates(findRepeats(entry.container.root))}>
        <ScanSearch /> Find repeated parts
      </Button>
    )
  } else if (candidates.length === 0) {
    content = (
      <p className="px-1 text-xs text-muted-foreground">
        Nothing repeats with the same structure. Select a layer and use Make component to extract a part used once.
      </p>
    )
  } else {
    content = (
      <ul className="flex flex-col gap-2">
        {candidates.map((candidate) => (
          <CandidateCard
            key={candidate.nodes.join()}
            entry={entry}
            candidate={candidate}
            onDone={() => setCandidates(undefined)}
          />
        ))}
      </ul>
    )
  }

  return (
    <PanelSection
      title="Repeated parts"
      description="Find parts that repeat and turn them into components. Each copy becomes an instance with its own content."
    >
      {content}
    </PanelSection>
  )
}

function CandidateCard({
  entry,
  candidate,
  onDone
}: {
  entry: ContainerEntry
  candidate: RepeatCandidate
  onDone: () => void
}) {
  const session = useProject()
  const [name, setName] = useState(candidate.name)
  const [error, setError] = useState<string>()

  return (
    <li className="rounded-md border p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <Diamond className="size-3.5 shrink-0" style={{ color: kindColors.component }} />
        <Input
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          className="h-7 flex-1 px-2 text-xs"
          aria-label="Component name"
        />
      </div>
      <p className="mb-1.5 text-xs text-muted-foreground">
        {candidate.nodes.length} copies of {candidate.size} layers
      </p>
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            try {
              const key = extractIntoComponent(session, entry, candidate.nodes, name.trim() || candidate.name)
              session.selection.set({ design: key })
              revealSelection(session)
              onDone()
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : String(reason))
            }
          }}
        >
          <Sparkles /> Extract component
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            session.selection.set({ design: entry.key, node: candidate.nodes[0] })
            revealSelection(session)
          }}
        >
          Show
        </Button>
      </div>
    </li>
  )
}
