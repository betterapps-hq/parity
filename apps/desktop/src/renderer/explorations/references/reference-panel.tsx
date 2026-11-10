import { Button, Textarea } from "@buildkitgg/shadcn-baseui-kit"
import { ExternalLink, Search, Telescope } from "lucide-react"
import { kindColors } from "../../canvas/kinds.tsx"
import { panelEnd, PanelSection } from "../../chrome/PanelSection.tsx"
import { headingIcon, headingName, SelectionHeading } from "../../chrome/SelectionHeading.tsx"
import type { Placed } from "./canvas.tsx"
import { creditOf } from "./library.tsx"

/*
 * The inspector's Design tab for a selected reference, as a selected note has its own: where the screen is from, how
 * it was found, and a note on why it's here. A reference has nothing to style, so there's nothing else.
 */

interface ReferencePanelProps {
  placed: Placed
  onNote: (note: string) => void
  onOpen: () => void
  /** Searches for the app's other screens, which the search does when a description names an app. */
  onMore: () => void
}

export function ReferencePanel({ placed, onNote, onOpen, onMore }: ReferencePanelProps) {
  const { found } = placed
  const app = creditOf(found)

  return (
    <>
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <SelectionHeading
          icon={<Telescope className={headingIcon} />}
          color={kindColors.layer}
          kind="Reference"
          detail="Reference, from Mobbin"
          name={<span className={`truncate px-1.5 ${headingName}`}>{app}</span>}
        />
      </div>
      <PanelSection title="Source">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-1 text-xs">
          <dt className="text-muted-foreground">From</dt>
          <dd>Mobbin</dd>
          <dt className="text-muted-foreground">Platform</dt>
          <dd>{found.platform === "ios" ? "iOS" : "Web"}</dd>
          <dt className="text-muted-foreground">Found with</dt>
          <dd>“{placed.query}”</dd>
          <dt className="text-muted-foreground">Placed by</dt>
          <dd>{placed.by ?? "You"}</dd>
        </dl>
        <div className="mt-3 flex flex-col gap-1.5">
          <Button variant="outline" size="sm" onClick={onOpen}>
            <ExternalLink /> Open in Mobbin
          </Button>
          <Button variant="outline" size="sm" onClick={onMore}>
            <Search /> More from {app}
          </Button>
        </div>
      </PanelSection>
      <PanelSection title="Note">
        <Textarea
          key={placed.key}
          defaultValue={placed.note}
          onBlur={(event) => onNote(event.currentTarget.value.trim())}
          aria-label="Note"
          placeholder="Why it's here"
          className="min-h-16 text-xs md:text-xs"
        />
      </PanelSection>
    </>
  )
}
