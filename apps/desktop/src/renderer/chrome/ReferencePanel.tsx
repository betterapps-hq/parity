import { Button, Textarea } from "@buildkitgg/shadcn-baseui-kit"
import { moreFromApp } from "@parity-app/editor"
import { ExternalLink, Search, Telescope } from "lucide-react"
import { useProject } from "../canvas/context.ts"
import { kindColors } from "../canvas/kinds.tsx"
import { openReference, referenceSource } from "../canvas/ReferenceUtil.tsx"
import { useReference } from "../design-store.ts"
import { findReferences } from "../references/find-references.ts"
import { panelEnd, PanelSection } from "./PanelSection.tsx"
import { headingIcon, headingName, SelectionHeading } from "./SelectionHeading.tsx"

/**
 * The inspector's Design tab for a selected reference (PAR-840), as a selected note has its own: where the screen is
 * from, how it was found and who placed it, and a note on why it's here. A reference has nothing to style.
 */
export function ReferencePanel({ referenceKey }: { referenceKey: string }) {
  const session = useProject()
  const entry = useReference(session.store, referenceKey)

  if (!entry) {
    return null
  }

  const { reference } = entry
  const source = referenceSource(reference)

  const saveNote = (text: string) => {
    const note = text.trim() || undefined

    if (note !== reference.note) {
      session.store.updateReference(referenceKey, note ? "Edit reference note" : "Remove reference note", (current) => {
        const next = { ...current, note }

        if (!note) {
          delete next.note
        }

        return next
      })
    }
  }

  return (
    <>
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <SelectionHeading
          icon={<Telescope className={headingIcon} />}
          color={kindColors.layer}
          kind="Reference"
          detail={`Reference, from ${source}`}
          name={<span className={`truncate px-1.5 ${headingName}`}>{reference.app}</span>}
        />
      </div>
      <PanelSection title="Source">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-1 text-xs">
          <dt className="text-muted-foreground">From</dt>
          <dd>{source}</dd>
          <dt className="text-muted-foreground">Platform</dt>
          <dd>{reference.platform === "ios" ? "iOS" : "Web"}</dd>
          {reference.query && (
            <>
              <dt className="text-muted-foreground">Found with</dt>
              <dd>“{reference.query}”</dd>
            </>
          )}
          <dt className="text-muted-foreground">Placed by</dt>
          <dd>{reference.by ?? "You"}</dd>
        </dl>
        <div className="mt-3 flex flex-col gap-1.5">
          <Button variant="outline" size="sm" onClick={() => openReference(reference)}>
            <ExternalLink /> Open in {source}
          </Button>
          <Button variant="outline" size="sm" onClick={() => findReferences(session, moreFromApp(reference))}>
            <Search /> More from {reference.app}
          </Button>
        </div>
      </PanelSection>
      <PanelSection title="Note">
        <Textarea
          key={`${referenceKey} ${reference.note ?? ""}`}
          defaultValue={reference.note}
          onBlur={(event) => saveNote(event.currentTarget.value)}
          aria-label="Note"
          placeholder="Why it's here"
          className="min-h-16 text-xs md:text-xs"
        />
      </PanelSection>
    </>
  )
}
