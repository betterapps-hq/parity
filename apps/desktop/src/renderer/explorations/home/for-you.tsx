import {
  Button,
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
  Skeleton,
  Spinner
} from "@buildkitgg/shadcn-baseui-kit"
import { useEffect, useId, useRef, useState } from "react"
import { OrganizationBadge } from "../../account/OrganizationBadge.tsx"
import { PersonAvatar } from "../../account/PersonAvatar.tsx"
import { whenLabel } from "../../start/projects.ts"
import { useNow } from "../../start/use-now.ts"
import type { Note, ReceivedInvitation } from "./data.ts"

/** An invitation in For you, with whether you're joining it. */
export interface WaitingInvitation extends ReceivedInvitation {
  joining?: boolean
}

/**
 * What needs you across every organization you're in, as projects show in every workspace: an invitation first, then
 * mentions, reviews and replies, newest first. Three show until you ask for more, so it doesn't push your projects
 * down. Each opens its project. Signed out it says what signing in adds, with Sign in in the header.
 */
export function ForYou({
  state,
  notes,
  invitation,
  onOpen,
  onJoin,
  onDecline,
  onAsk
}: {
  state: "loading" | "signed-out" | "signed-in"
  notes: readonly Note[]
  invitation?: WaitingInvitation | undefined
  onOpen: (note: Note) => void
  onJoin: () => void
  onDecline: () => void
  onAsk: () => void
}) {
  const heading = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const now = useNow()
  const [all, setAll] = useState(false)
  const shown = 3
  const count = (invitation ? 1 : 0) + notes.length
  const notesShown = all ? notes : notes.slice(0, shown - (invitation ? 1 : 0))
  // The invitation's buttons go with it, so the keyboard stays in For you rather than falling to the page, where Enter
  // would open the project to continue.
  const hadInvitation = useRef(false)
  useEffect(() => {
    if (hadInvitation.current && !invitation && document.activeElement === document.body) headingRef.current?.focus()
    hadInvitation.current = !!invitation
  }, [invitation])
  return (
    <section aria-labelledby={heading} className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={heading} ref={headingRef} tabIndex={-1} className="text-sm font-semibold outline-none">
          For you
        </h2>
        {state === "signed-in" && count > shown && (
          <button
            type="button"
            onClick={() => setAll(!all)}
            className="rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {all ? "Show less" : `Show ${count - shown} more`}
          </button>
        )}
      </div>
      {state === "loading" && <Loading />}
      {state === "signed-out" && (
        <p className="py-2 text-sm text-pretty text-muted-foreground">
          Sign in to see comments, mentions and reviews that need you.
        </p>
      )}
      {state === "signed-in" && !invitation && notes.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">Nothing needs you right now.</p>
      )}
      {state === "signed-in" && (invitation || notes.length > 0) && (
        <ul className="-mx-3 flex flex-col gap-1">
          {invitation && (
            <li>
              <InvitationItem invitation={invitation} now={now} onJoin={onJoin} onDecline={onDecline} onAsk={onAsk} />
            </li>
          )}
          {notesShown.map((note) => {
            const when = whenLabel(note.at, now)
            const said = `${capitalized(note.did)} in ${note.project} ${when}`
            return (
              <li key={note.id}>
                <Item
                  size="sm"
                  render={
                    <button
                      type="button"
                      aria-label={`${note.from.name}${note.quote ? `: ${note.quote}` : ""}. ${said}`}
                      onClick={() => onOpen(note)}
                    />
                  }
                  className="text-left hover:bg-muted"
                >
                  <ItemMedia>
                    <PersonAvatar person={note.from} size={28} />
                  </ItemMedia>
                  <ItemContent className="min-w-0 gap-0.5">
                    <ItemTitle>{note.from.name}</ItemTitle>
                    {note.quote && <span className="line-clamp-2 text-sm">“{note.quote}”</span>}
                    <ItemDescription className="text-xs text-pretty">
                      {capitalized(note.did)} in <span className="whitespace-nowrap">{note.project}</span>{" "}
                      <span className="whitespace-nowrap">{when}</span>
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * An invitation to an organization you're not in: Join moves you into it with a refresh in the background. One that ran
 * out asks whoever sent it for another, or goes.
 */
function InvitationItem({
  invitation,
  now,
  onJoin,
  onDecline,
  onAsk
}: {
  invitation: WaitingInvitation
  now: number
  onJoin: () => void
  onDecline: () => void
  onAsk: () => void
}) {
  const { organization, from, joining = false } = invitation
  return (
    <Item size="sm">
      <ItemMedia>
        <OrganizationBadge organization={organization} size={28} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle>{organization.name}</ItemTitle>
        <ItemDescription className="text-xs text-pretty">
          {invitation.expired ? (
            `${from.name}'s invitation expired`
          ) : (
            <>
              {from.name} invited you <span className="whitespace-nowrap">{whenLabel(invitation.sent, now)}</span>
            </>
          )}
        </ItemDescription>
      </ItemContent>
      <ItemFooter className="justify-start pl-[38px]">
        {invitation.expired ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={onAsk}
              aria-label={`Ask for a new invitation from ${from.name}`}
            >
              Ask for a new invitation
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDecline}
              aria-label={`Dismiss the invitation to ${organization.name}`}
            >
              Dismiss
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              onClick={onJoin}
              disabled={joining}
              focusableWhenDisabled
              aria-label={`${joining ? "Joining" : "Join"} ${organization.name}`}
            >
              {joining && <Spinner aria-hidden />}
              {joining ? "Joining" : "Join"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDecline}
              disabled={joining}
              focusableWhenDisabled
              aria-label={`Decline the invitation to ${organization.name}`}
            >
              Decline
            </Button>
          </>
        )}
      </ItemFooter>
    </Item>
  )
}

/** For you's shape while it loads. */
function Loading() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <output className="sr-only">Loading</output>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-2.5" aria-hidden>
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}
