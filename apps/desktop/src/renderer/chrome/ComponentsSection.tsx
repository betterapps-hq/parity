import { Button, DropdownMenuItem, Input } from "@buildkitgg/shadcn-baseui-kit"
import {
  type ContainerSpec,
  designSlots,
  type ParamSpec,
  removeParam,
  renameParam,
  type RepeatCandidate
} from "@parity-app/core"
import { Diamond, Pencil, ScanSearch, Sparkles, Trash2 } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { useProject } from "../canvas/context.ts"
import { focusOnMount, kindColors } from "../canvas/kinds.tsx"
import type { ContainerEntry } from "../design-store.ts"
import { FieldGrid, TitleMenu } from "../inspector/controls/field-row.tsx"
import { type PropRow, PropRows, type PropValueRow } from "../inspector/controls/instance-section.tsx"
import { extractIntoComponent } from "./components.ts"
import { Hint } from "./Hint.tsx"
import { paramValue, updateAndRecord } from "./inspector-events.ts"
import { NameInput } from "./Name.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { booleanValue, numberValue, readPropValue, textValue, valueKind } from "./prop-values.ts"
import { clearRepeatedParts, findRepeatedParts, holdRepeatedParts, useRepeatedParts } from "./repeated-parts.ts"
import { revealSelection } from "./reveal.ts"
import { AddProp, NewPropRow, SlotPropRow } from "./slot-props.tsx"

/**
 * Breaking a screen into components. Repeated parts are found exactly; extracting one makes a component design with
 * params for whatever differs, and is refused unless the screen still renders the same in every state and viewport.
 * Naming parts and finding the ones used once is an agent's job (the decompose skill).
 */
export function ComponentsSection({ entry }: { entry: ContainerEntry }) {
  const { root } = useProject().info
  const candidates = useRepeatedParts(root, entry.key)
  useEffect(() => holdRepeatedParts(root, entry.key), [root, entry.key])
  let content: ReactNode

  if (candidates === undefined) {
    content = (
      <Button variant="outline" size="sm" onClick={() => findRepeatedParts(root, entry)}>
        <ScanSearch /> Find repeated parts
      </Button>
    )
  } else if (candidates.length === 0) {
    content = (
      <p className="type-description px-1 text-muted-foreground">
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
            onDone={() => clearRepeatedParts(root, entry.key)}
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
        <NameInput
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          className="h-7 flex-1 px-2 text-xs"
          aria-label="Component name"
        />
      </div>
      <p className="mb-1.5 text-xs text-muted-foreground">
        {candidate.nodes.length} copies of {candidate.size} layers
      </p>
      {candidate.params.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {candidate.params.map((param) => (
            <Hint key={param.name} label={param.values.map(String).join(", ")} wait>
              <code className="rounded bg-muted px-1.5 text-2xs text-muted-foreground">{param.name}</code>
            </Hint>
          ))}
        </div>
      )}
      {error && <p className="type-message mb-2 text-destructive">{error}</p>}
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

/**
 * A component design's props: params with their defaults, then slots, a kind of prop that takes layers, with the layout
 * each fills where a param has its default. Variants aren't listed for now (PAR-1017).
 */
export function ParamsSection({ entry }: { entry: ContainerEntry }) {
  const all = Object.entries(entry.container.params ?? {})
  const params = all.filter(([, param]) => param.type !== "variant")
  const slots = designSlots(entry.container)

  return (
    <PanelSection
      title="Props"
      count={params.length + slots.length}
      description="What each instance can change."
      action={<AddProp entry={entry} />}
    >
      <div className="flex flex-col gap-2.5">
        {params.length > 0 && <ParamRows entry={entry} params={params} />}
        {slots.map((slot) => (
          <SlotPropRow key={slot.node.id} entry={entry} slot={slot} />
        ))}
        <NewPropRow entry={entry} />
      </div>
    </PanelSection>
  )
}

/** A param's row for its kind of value: its default, which an instance shows faintly until it sets its own. */
function paramRow(name: string, param: ParamSpec): PropValueRow {
  const value = readPropValue(param.default)
  const kind = valueKind(value, param.type)

  if (kind === "boolean") {
    return { type: "boolean", value: booleanValue.safeParse(value).data ?? false }
  }

  if (kind === "number") {
    return { type: "number", value: numberValue.safeParse(value).data }
  }

  if (kind === "text") {
    return { type: "text", value: textValue.safeParse(value).data, placeholder: `${name}'s default` }
  }

  return { type: "value", value, loose: kind === "any" }
}

/**
 * A component design's params in the rows an instance's props are drawn in, each with its default to edit, and a menu
 * at the end of its name's row to rename or remove it.
 */
function ParamRows({ entry, params }: { entry: ContainerEntry; params: [string, ParamSpec][] }) {
  const session = useProject()
  const [renaming, setRenaming] = useState<string>()
  const [error, setError] = useState<string>()

  const record = (label: string, name: string, change: (container: ContainerSpec) => ContainerSpec, gesture?: string) =>
    updateAndRecord(session.store, entry.key, label, change, {
      field: `params.${name}`,
      read: (container) => paramValue(container, name),
      gesture
    })

  const rename = (from: string, to: string) => {
    setRenaming(undefined)

    if (to === "" || to === from) {
      setError(undefined)

      return
    }

    try {
      record(`Rename ${from}`, from, (container) => renameParam(container, from, to))
      setError(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const rows = params.map(([name, param]): PropRow => {
    if (renaming === name) {
      return {
        name,
        type: "shown",
        shown: (
          <Input
            ref={focusOnMount}
            defaultValue={name}
            aria-label={`Rename ${name}`}
            className="h-7 px-2 font-mono text-xs"
            onBlur={(event) => rename(name, event.currentTarget.value.trim())}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur()
              } else if (event.key === "Escape") {
                setRenaming(undefined)
              }
            }}
          />
        )
      }
    }

    return {
      ...paramRow(name, param),
      name,
      hint: `${name}: ${param.type}`,
      action: (
        <TitleMenu label={`More options for ${name}`} className="size-5" menuClassName="w-40">
          <DropdownMenuItem onClick={() => setRenaming(name)}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => record(`Remove ${name}`, name, (container) => removeParam(container, name))}
          >
            <Trash2 /> Remove
          </DropdownMenuItem>
        </TitleMenu>
      )
    }
  })

  return (
    <>
      <FieldGrid>
        <PropRows
          rows={rows}
          onChange={(name, value, gesture) =>
            record(
              `Change ${name} default`,
              name,
              (container) => ({
                ...container,
                params: { ...container.params, [name]: { ...container.params![name]!, default: value } }
              }),
              gesture
            )
          }
        />
      </FieldGrid>
      {error && <p className="type-message text-destructive">{error}</p>}
    </>
  )
}
