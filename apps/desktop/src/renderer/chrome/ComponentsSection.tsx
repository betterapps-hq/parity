import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { type RepeatCandidate } from "@parity-app/core"
import { Diamond, ScanSearch, Sparkles } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { useProject } from "../canvas/context.ts"
import { kindColors } from "../canvas/kinds.tsx"
import type { ContainerEntry } from "../design-store.ts"
import { extractIntoComponent } from "./components.ts"
import { Hint } from "./Hint.tsx"
import { NameInput } from "./Name.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { clearRepeatedParts, findRepeatedParts, holdRepeatedParts, useRepeatedParts } from "./repeated-parts.ts"
import { revealSelection } from "./reveal.ts"

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
