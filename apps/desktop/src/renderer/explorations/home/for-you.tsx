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
import type { Note, Person, ReceivedInvitation } from "./data.ts"

/** An invitation in For you, with whether you're joining it. */
export interface WaitingInvitation extends ReceivedInvitation {
  joining?: boolean
}

/** A note in For you, with the organization it's from when that's not where you are. */
export interface ShownNote extends Note {
  elsewhere?: string
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
  invitedAs,
  ended = [],
  onOpen,
  onSignInAgain,
  onJoin,
  onDecline,
  onAsk
}: {
  state: "loading" | "signed-out" | "signed-in"
  notes: readonly ShownNote[]
  invitation?: WaitingInvitation | undefined
  /** The address the invitation went to, named when you're signed in to several accounts. */
  invitedAs?: string
  /** Accounts whose session ended: what needs you there waits until you sign in again. */
  ended?: readonly Person[]
  onOpen: (note: Note) => void
  onSignInAgain: (email: string) => void
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
      {state === "signed-in" && !invitation && notes.length === 0 && ended.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">Nothing needs you right now.</p>
      )}
      {state === "signed-in" && (invitation || notes.length > 0 || ended.length > 0) && (
        <ul className="-mx-3 flex flex-col gap-1">
          {invitation && (
            <li>
              <InvitationItem
                invitation={invitation}
                invitedAs={invitedAs}
                now={now}
                onJoin={onJoin}
                onDecline={onDecline}
                onAsk={onAsk}
              />
            </li>
          )}
          {notesShown.map((note) => {
            const when = whenLabel(note.at, now)
            const at = note.elsewhere ? ` at ${note.elsewhere}` : ""
            const said = `${capitalized(note.did)} in ${note.project}${at} ${when}`
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
                    {/*
                     * What and where wrap as words do: never between "in" and the project, nor at a hyphen in its
                     * name, unless a name is too long for a line. When is a line of its own, outside the kit's two-line
                     * clamp, so it's never cut.
                     */}
                    <ItemDescription className="text-xs wrap-anywhere">
                      {capitalized(note.did)} in{"\u00a0"}
                      {note.project.replaceAll("-", "\u2011")}
                      {note.elsewhere && (
                        <>
                          {" "}
                          at{"\u00a0"}
                          {note.elsewhere}
                        </>
                      )}
                    </ItemDescription>
                    <span className="text-xs text-muted-foreground">{when}</span>
                  </ItemContent>
                </Item>
              </li>
            )
          })}
          {ended.map((person) => (
            <li key={person.email}>
              <Item
                size="sm"
                render={
                  <button
                    type="button"
                    aria-label={`Sign in again as ${person.email} to see what needs you there`}
                    onClick={() => onSignInAgain(person.email)}
                  />
                }
                className="text-left hover:bg-muted"
              >
                <ItemMedia className="opacity-50">
                  <PersonAvatar person={person} size={28} />
                </ItemMedia>
                <ItemContent className="min-w-0 gap-0.5">
                  <ItemTitle className="max-w-full">
                    <span className="truncate">{person.email}</span>
                  </ItemTitle>
                  <ItemDescription className="text-xs">Sign in again to see what needs you there</ItemDescription>
                </ItemContent>
              </Item>
            </li>
          ))}
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
  invitedAs,
  now,
  onJoin,
  onDecline,
  onAsk
}: {
  invitation: WaitingInvitation
  invitedAs: string | undefined
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
            `${from.name}'s invitation${invitedAs ? ` to ${invitedAs}` : ""} expired`
          ) : (
            <>
              {from.name} invited {invitedAs ?? "you"}{" "}
              <span className="whitespace-nowrap">{whenLabel(invitation.sent, now)}</span>
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
