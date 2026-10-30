import { Check, CornerDownRight, X } from "lucide-react"
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { me, type Person } from "../explore-data.ts"
import type { Proposal } from "./collab-data.ts"

const amber = "oklch(0.8 0.14 75)"

function nameOf(person: Person): string {
  return person === me ? "You" : person.name
}

/**
 * What an agent, or anyone set to propose changes, says it will do before doing it: a line for each change, then
 * Approve or Decline, so nobody has to reply "go ahead". Declining can say why, and the one who proposed it sees that.
 * Once decided, it folds to who decided and when. Someone who can only comment sees that it's waiting for an editor.
 */
export function ProposalCard({
  proposal,
  lines,
  agent,
  canApprove = true,
  onApprove,
  onDecline
}: {
  proposal: Proposal
  /** The changes, each already rendered with its layer links. */
  lines: ReactNode[]
  /** Who proposed it, by first name. */
  agent: string
  canApprove?: boolean
  onApprove?: () => void
  onDecline?: (reason: string) => void
}) {
  const [declining, setDeclining] = useState(false)

  if (proposal.status !== "waiting") {
    const approved = proposal.status === "approved"
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border bg-background/40 px-2.5 py-2 text-xs motion-safe:animate-in motion-safe:fade-in-0">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {approved ? <Check className="size-3.5 text-emerald-400" /> : <X className="size-3.5" />}
          <span>
            <span className="font-medium text-foreground">{nameOf(proposal.by ?? me)}</span>{" "}
            {approved ? "approved" : "declined"} this, {(proposal.when ?? "just now").toLowerCase()}
          </span>
        </span>
        <span className="truncate pl-5 text-muted-foreground">{proposal.summary}</span>
        {proposal.reason && (
          <span className="ml-5 border-l-2 pl-2 text-foreground/85 [overflow-wrap:anywhere]">{proposal.reason}</span>
        )}
      </div>
    )
  }

  let actions: ReactNode
  if (!canApprove) actions = <span className="text-xs text-muted-foreground">Waiting for an editor to approve it.</span>
  else if (declining)
    actions = (
      <DeclineBox agent={agent} onCancel={() => setDeclining(false)} onDecline={(reason) => onDecline?.(reason)} />
    )
  else
    actions = (
      <div className="flex gap-1.5">
        <Button size="xs" className="gap-1" onClick={onApprove}>
          <Check /> Approve
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setDeclining(true)}>
          Decline
        </Button>
      </div>
    )
  return (
    <div
      className="flex flex-col gap-2.5 rounded-lg border p-2.5"
      style={{
        borderColor: `color-mix(in oklch, ${amber} 35%, transparent)`,
        background: `color-mix(in oklch, ${amber} 6%, transparent)`
      }}
    >
      <span className="text-[11px] font-medium" style={{ color: amber }}>
        Waiting for approval
      </span>
      <ul className="flex flex-col gap-1.5">
        {lines.map((line, index) => (
          <li key={index} className="flex gap-2 [&_p]:text-[13px] [&_p]:leading-snug">
            <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>
      {actions}
    </div>
  )
}

/** Why you're declining, for the one who proposed it. Optional: Decline works with nothing written. */
function DeclineBox({
  agent,
  onCancel,
  onDecline
}: {
  agent: string
  onCancel: () => void
  onDecline: (reason: string) => void
}) {
  const [reason, setReason] = useState("")
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => field.current?.focus(), [])
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      onCancel()
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      onDecline(reason.trim())
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        ref={field}
        rows={2}
        value={reason}
        aria-label={`Why, for ${agent}`}
        placeholder={`Why? ${agent} will see this (optional)`}
        onChange={(event) => setReason(event.target.value)}
        onKeyDown={onKeyDown}
        className="min-h-0 resize-none bg-background text-[13px] md:text-[13px]"
      />
      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" variant="outline" onClick={() => onDecline(reason.trim())}>
          Decline
        </Button>
      </div>
    </div>
  )
}
