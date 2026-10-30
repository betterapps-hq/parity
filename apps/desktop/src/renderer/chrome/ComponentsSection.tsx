import {
  addVariant,
  addVariantOption,
  findNode,
  findRepeats,
  type ParamSpec,
  removeParam,
  removeVariantOption,
  renameVariantOption,
  type RepeatCandidate
} from "@parity-app/core"
import { instancesOf } from "@parity-app/editor"
import { Diamond, Plus, ScanSearch, Sparkles, Trash2, X } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useProject } from "../canvas/context.ts"
import { focusOnMount, kindColors } from "../canvas/kinds.tsx"
import type { ContainerEntry } from "../design-store.ts"
import { extractIntoComponent } from "./components.ts"
import { ChoiceInput, ValueInput } from "./fields.tsx"
import { Hint } from "./Hint.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { valueKind } from "./prop-values.ts"
import { revealSelection } from "./reveal.ts"

/**
 * Breaking a screen into components. Repeated parts are found exactly; extracting one makes a component design with
 * params for whatever differs, and is refused unless the screen still renders the same in every state and viewport.
 * Naming parts and finding the ones used once is an agent's job (the decompose skill).
 */
export function ComponentsSection({ entry }: { entry: ContainerEntry }) {
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
      title="Components"
      description="Find parts that repeat and turn them into component designs. Each copy becomes an instance with its own content."
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
      {candidate.params.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {candidate.params.map((param) => (
            <Hint key={param.name} label={param.values.map(String).join(", ")} wait>
              <code className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{param.name}</code>
            </Hint>
          ))}
        </div>
      )}
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

/** A component design's params, with their defaults, its variants, and where it's used. */
export function ParamsSection({ entry }: { entry: ContainerEntry }) {
  const session = useProject()
  const all = Object.entries(entry.container.params ?? {})
  const params = all.filter(([, param]) => param.type !== "variant")
  const variants = all.filter(([, param]) => param.type === "variant")
  const usages = instancesOf(session.store.getEntries(), entry.container.id)
  return (
    <>
      <VariantsSection entry={entry} variants={variants} />
      <PanelSection
        title="Params"
        count={params.length}
        description="What each instance sets. Defaults show on this board."
      >
        {params.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">No params: every instance looks the same.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {params.map(([name, param]) => (
              <div key={name} className="grid grid-cols-[96px_1fr] items-center gap-2">
                <Hint label={`${name}: ${param.type}`} wait>
                  <span className="truncate font-mono text-xs">{name}</span>
                </Hint>
                <ValueInput
                  value={param.default}
                  kind={valueKind(param.default, param.type)}
                  title={`${name} default`}
                  onCommit={(value) =>
                    session.store.updateContainer(entry.key, `Change ${name} default`, (container) => ({
                      ...container,
                      params: { ...container.params, [name]: { ...container.params![name]!, default: value } }
                    }))
                  }
                />
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 px-1 text-xs text-muted-foreground">
          {usages.length === 0 ? "Not used yet." : `Used ${usages.length} time${usages.length === 1 ? "" : "s"}:`}
        </div>
        <ul className="mt-1 flex flex-col">
          {usages.map(({ entry: usage, node }) => (
            <li key={`${usage.key}/${node}`}>
              <button
                type="button"
                onClick={() => {
                  session.selection.set({ design: usage.key, node })
                  revealSelection(session)
                }}
                className="flex h-7 w-full items-center gap-2 rounded-md px-1 text-left text-xs hover:bg-accent/50"
              >
                <Diamond className="size-3 shrink-0" style={{ color: kindColors.component }} />
                <span className="truncate">{usage.container.name}</span>
                <span className="ml-auto truncate text-muted-foreground">
                  {findNode(usage.container.root, node)?.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PanelSection>
    </>
  )
}

/**
 * A component design's variants: choices an instance makes, like size or tone. Each option changes the design the way
 * a state does; pick one in the title bar to see it on the board, and edits there go to that option.
 */
function VariantsSection({ entry, variants }: { entry: ContainerEntry; variants: [string, ParamSpec][] }) {
  const { store } = useProject()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string>()
  const update = (label: string, change: (container: ContainerEntry["container"]) => ContainerEntry["container"]) => {
    try {
      store.updateContainer(entry.key, label, change)
      setError(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  return (
    <PanelSection
      title="Variants"
      count={variants.length}
      description="Choices each instance makes, like size or tone. Pick one in the title bar to edit it on the board."
      action={
        !adding && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setAdding(true)}>
            <Plus /> Add
          </Button>
        )
      }
    >
      {adding && (
        <form
          className="mb-3 flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const text = (field: string) => {
              const entry = data.get(field)
              return typeof entry === "string" ? entry : ""
            }
            const name = text("name").trim()
            const options = text("options")
              .split(",")
              .map((option) => option.trim())
              .filter(Boolean)
            if (!name || options.length === 0) return
            update(`Add ${name} variant`, (container) => addVariant(container, name, options))
            setAdding(false)
          }}
        >
          <Input name="name" ref={focusOnMount} placeholder="Name, like size" className="h-7 px-2 text-xs" />
          <Input name="options" placeholder="Options, like Small, Medium, Large" className="h-7 px-2 text-xs" />
          <div className="flex gap-1.5">
            <Button type="submit" size="sm" className="flex-1">
              Add variant
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {variants.length === 0 && !adding && (
        <p className="px-1 text-xs text-muted-foreground">No variants: every instance has the same design.</p>
      )}
      <div className="flex flex-col gap-3">
        {variants.map(([name, param]) => (
          <div key={name} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 px-1">
              <span className="flex-1 truncate font-mono text-xs">{name}</span>
              <Hint label={`Remove the ${name} variant and what its options change`}>
                <button
                  type="button"
                  aria-label={`Remove the ${name} variant`}
                  className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => update(`Remove ${name} variant`, (container) => removeParam(container, name))}
                >
                  <Trash2 className="size-3" />
                </button>
              </Hint>
            </div>
            <div className="grid grid-cols-[96px_1fr] items-center gap-2">
              <span className="px-1 text-xs text-muted-foreground">Default</span>
              <ChoiceInput
                value={typeof param.default === "string" ? param.default : undefined}
                options={(param.options ?? []).map((option) => ({ value: option.id, label: option.name }))}
                placeholder={param.options?.[0]?.name}
                onChange={(option) =>
                  update(`Change ${name} default`, (container) => {
                    const spec = { ...container.params![name]! }
                    if (option) spec.default = option
                    else delete spec.default
                    return { ...container, params: { ...container.params, [name]: spec } }
                  })
                }
              />
            </div>
            <ul className="flex flex-col">
              {(param.options ?? []).map((option) => (
                <li key={option.id} className="flex items-center gap-1">
                  <Input
                    key={option.name}
                    defaultValue={option.name}
                    aria-label={`${name} option name`}
                    className="h-7 flex-1 border-transparent bg-transparent px-1 text-xs shadow-none hover:border-input dark:bg-transparent"
                    onBlur={(event) => {
                      const next = event.currentTarget.value.trim()
                      if (next && next !== option.name)
                        update("Rename option", (container) => renameVariantOption(container, name, option.id, next))
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur()
                    }}
                  />
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {Object.keys(option.overrides ?? {}).length > 0
                      ? `${Object.keys(option.overrides ?? {}).length} changed`
                      : ""}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${option.name}`}
                    disabled={(param.options?.length ?? 0) < 2}
                    className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                    onClick={() =>
                      update(`Remove ${option.name}`, (container) => removeVariantOption(container, name, option.id))
                    }
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-1"
              onSubmit={(event) => {
                event.preventDefault()
                const input = event.currentTarget.elements.namedItem("option") as HTMLInputElement
                const option = input.value.trim()
                if (!option) return
                update(`Add ${option}`, (container) => addVariantOption(container, name, option).container)
                input.value = ""
              }}
            >
              <Input name="option" placeholder="Add an option" className="h-7 flex-1 px-1 text-xs" />
            </form>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 px-1 text-xs text-destructive">{error}</p>}
    </PanelSection>
  )
}
