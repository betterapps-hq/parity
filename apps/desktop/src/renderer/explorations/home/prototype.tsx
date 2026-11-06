import { SonnerToaster } from "@buildkitgg/shadcn-baseui-kit"
import { type ReactNode, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ContinueCard, FirstTime } from "../../start/HomePage.tsx"
import { NewTab } from "../../start/NewTabPage.tsx"
import { PictureSourceProvider } from "../../start/pictures.ts"
import { ProjectList } from "../../start/ProjectList.tsx"
import { type KnownProject, knownProjects } from "../../start/projects.ts"
import { StartActionsProvider } from "../../start/start-actions.ts"
import { NewProjectButton, OpenMenu, SearchButton } from "../../start/StartControls.tsx"
import { useResolvedTheme } from "../../theme.ts"
import {
  AccountMenu,
  AccountMenuLoading,
  NewOrganizationDialog,
  PeopleDialog,
  type PeopleTab,
  SignInButton
} from "./account.tsx"
import {
  contoso,
  halcyon,
  kestrel,
  northwindInvitation,
  sampleNotes,
  samplePictures,
  sampleRecent,
  type Team,
  you
} from "./data.ts"
import { ForYou, type WaitingInvitation } from "./for-you.tsx"

/** Where a story starts. Everything after that works: switching, inviting, joining, making an organization. */
export interface Start {
  page?: "home" | "new-tab"
  /** The organization you're in, or Personal. */
  workspace?: "personal" | "kestrel" | "halcyon" | "contoso"
  signedOut?: boolean
  /** Parity hasn't heard from main who's signed in yet. */
  loading?: boolean
  /** Signed in for the first time: no projects and no organization yet, with an invitation waiting. */
  newAccount?: boolean
  invitation?: "waiting" | "expired"
  menuOpen?: boolean
  dialog?: "people" | "invitations" | "new-organization" | "invite-step"
  /** What's typed in People's search when it opens. */
  search?: string
}

type Open =
  | { at: "people"; tab: PeopleTab }
  | { at: "new-organization"; step: "name" | "invite"; name?: string }
  | undefined

/** Northwind, just made, for the story that starts at inviting people to it. */
const northwind: Team = {
  id: "org_01NORTHWIND",
  name: "Northwind",
  role: "Admin",
  members: [{ ...you, role: "Admin" }],
  invitations: [],
  notes: []
}

function startingTeams(start: Start): Team[] {
  if (start.newAccount) return []
  return start.dialog === "invite-step" ? [kestrel, halcyon, contoso, northwind] : [kestrel, halcyon, contoso]
}

function startingWorkspace(start: Start): string | undefined {
  if (start.dialog === "invite-step") return northwind.id
  if (start.newAccount || start.workspace === "personal") return undefined
  if (start.workspace === "contoso") return contoso.id
  return start.workspace === "halcyon" ? halcyon.id : kestrel.id
}

function startingDialog(start: Start): Open {
  if (start.dialog === "people") return { at: "people", tab: "members" }
  if (start.dialog === "invitations") return { at: "people", tab: "invitations" }
  if (start.dialog === "new-organization") return { at: "new-organization", step: "name" }
  if (start.dialog === "invite-step") return { at: "new-organization", step: "invite", name: northwind.name }
  return undefined
}

function startingInvitation(start: Start): WaitingInvitation | undefined {
  if (start.newAccount || start.invitation === "waiting") return northwindInvitation
  if (start.invitation === "expired") return { ...northwindInvitation, expired: true }
  return undefined
}

/**
 * Home and the new tab page, built from the start page's own pieces, with the account menu, For you and the
 * organization dialogs this exploration proposes.
 */
export function HomePrototype(start: Start) {
  const theme = useResolvedTheme()
  const [signedIn, setSignedIn] = useState(!start.signedOut)
  const [teams, setTeams] = useState(() => startingTeams(start))
  const [currentId, setCurrentId] = useState(() => startingWorkspace(start))
  const [switching, setSwitching] = useState<string>()
  const [status, setStatus] = useState<string>()
  const accountTrigger = useRef<HTMLButtonElement>(null)
  const [invitation, setInvitation] = useState(() => startingInvitation(start))
  const [dialog, setDialog] = useState<Open>(() => startingDialog(start))
  const [recent, setRecent] = useState<readonly string[]>(start.newAccount ? [] : sampleRecent)
  const [notes, setNotes] = useState(start.newAccount ? {} : sampleNotes)
  const pictures = useMemo(
    () => ({
      subscribe: () => () => undefined,
      get: (root: string) => samplePictures[root] ?? null,
      ask: () => undefined
    }),
    []
  )
  const current = teams.find((team) => team.id === currentId)
  // What needs you in every organization, as every project shows in each: newest first, each with where it's from.
  const waiting = teams
    .flatMap((team) => team.notes.map((note) => ({ ...note, team: team.id })))
    .sort((a, b) => b.at - a.at)
  const projects = knownProjects(recent, notes)
  const ignore = () => undefined

  const updateTeam = (id: string, change: (team: Team) => Team) =>
    setTeams((all) => all.map((team) => (team.id === id ? change(team) : team)))

  /** Main moves the session with a refresh in the background; nothing open closes. */
  const switchTo = (id: string | undefined) => {
    if (id === currentId) return
    const name = teams.find((team) => team.id === id)?.name ?? "Personal"
    setSwitching(name)
    setStatus(`Switching to ${name}`)
    setTimeout(() => {
      setCurrentId(id)
      setSwitching(undefined)
      setStatus(`You're in ${name}`)
    }, 900)
  }

  const join = () => {
    if (!invitation) return
    setInvitation({ ...invitation, joining: true })
    setTimeout(() => {
      const joined: Team = {
        ...invitation.organization,
        role: "Member",
        members: [
          { ...invitation.from, role: "Admin" },
          { ...you, role: "Member" }
        ],
        invitations: [],
        notes: []
      }
      setTeams((all) => [...all, joined])
      setCurrentId(joined.id)
      setInvitation(undefined)
      toast(`You joined ${joined.name}`, { description: "Switch organizations from your account menu." })
    }, 1200)
  }

  const decline = () => {
    const declined = invitation
    setInvitation(undefined)
    toast(`${declined?.expired ? "Dismissed" : "Declined"} the invitation to ${declined?.organization.name}`, {
      action: { label: "Undo", onClick: () => setInvitation(declined) },
      duration: 10_000
    })
  }

  const create = (name: string) => {
    const made: Team = {
      id: `org_01${name.toUpperCase().replaceAll(/\W/g, "")}`,
      name,
      role: "Admin",
      members: [{ ...you, role: "Admin" }],
      invitations: [],
      notes: []
    }
    setTeams((all) => [...all, made])
    setCurrentId(made.id)
    setDialog({ at: "new-organization", step: "invite", name })
  }

  /** Sends invitations. People shows them in its list, so only New organization, which closes, says so. */
  const inviteTo = (team: Team, emails: string[], say: boolean) => {
    const sent = Date.now()
    updateTeam(team.id, (target) => ({
      ...target,
      invitations: [
        ...emails.map((email) => ({ email, sent })),
        ...target.invitations.filter((invitation) => !emails.includes(invitation.email))
      ]
    }))
    if (say) toast(emails.length === 1 ? `Invited ${emails[0]}` : `Invited ${emails.length} people to ${team.name}`)
  }

  let account: ReactNode = <AccountMenuLoading />
  if (!start.loading && !signedIn) account = <SignInButton onSignIn={() => setSignedIn(true)} />
  if (!start.loading && signedIn) {
    account = (
      <AccountMenu
        person={you}
        teams={teams}
        current={current}
        {...(switching ? { switching } : {})}
        {...(status ? { status } : {})}
        {...(start.menuOpen ? { defaultOpen: true } : {})}
        triggerRef={accountTrigger}
        onSwitch={switchTo}
        onPeople={() => setDialog({ at: "people", tab: "members" })}
        onNewOrganization={() => setDialog({ at: "new-organization", step: "name" })}
        onSignOut={() => {
          setSignedIn(false)
          toast("You're signed out", { description: "Projects on this computer stay open." })
        }}
      />
    )
  }

  let forYouState: "loading" | "signed-out" | "signed-in" = "signed-in"
  if (start.loading) forYouState = "loading"
  else if (!signedIn) forYouState = "signed-out"

  const forYou = (
    <ForYou
      state={forYouState}
      notes={waiting}
      invitation={invitation}
      onOpen={(note) => {
        // A note from another organization opens its project there, with the same refresh as the menu's.
        const from = waiting.find((item) => item.id === note.id)?.team
        if (from !== currentId) switchTo(from)
      }}
      onJoin={join}
      onDecline={decline}
      onAsk={() => {
        setInvitation(undefined)
        if (invitation) toast(`Asked ${invitation.from.name} for a new invitation`)
      }}
    />
  )

  return (
    <PictureSourceProvider value={pictures}>
      <StartActionsProvider
        value={{
          open: ignore,
          openFolder: ignore,
          openFile: ignore,
          search: ignore,
          star: (root, starred) => setNotes((kept) => ({ ...kept, [root]: { ...kept[root], starred } })),
          forget: (root) => setRecent((listed) => listed.filter((candidate) => candidate !== root))
        }}
      >
        <div className="flex h-screen flex-col bg-background text-foreground">
          {start.page === "new-tab" ? (
            <NewTab projects={projects} />
          ) : (
            <Home projects={projects} account={account} forYou={forYou} />
          )}
        </div>
        {dialog?.at === "people" && current && (
          <PeopleDialog
            team={current}
            you={you}
            tab={dialog.tab}
            {...(start.search ? { startSearch: start.search } : {})}
            finalFocus={accountTrigger}
            onTab={(tab) => setDialog({ at: "people", tab })}
            onClose={() => setDialog(undefined)}
            onInvite={(emails) => {
              inviteTo(current, emails, false)
              setDialog({ at: "people", tab: "invitations" })
            }}
            onRole={(member, role) => {
              updateTeam(current.id, (team) => ({
                ...team,
                members: team.members.map((item) => (item.email === member.email ? { ...item, role } : item))
              }))
            }}
            onRemove={(member) => {
              updateTeam(current.id, (team) => ({
                ...team,
                members: team.members.filter((item) => item.email !== member.email)
              }))
              toast(`Removed ${member.name} from ${current.name}`)
            }}
            onLeave={() => {
              const left = current
              setTeams((all) => all.filter((team) => team.id !== left.id))
              setCurrentId(undefined)
              setStatus("You're in Personal")
              toast(`You left ${left.name}`, {
                description: "You're in Personal now.",
                action: {
                  label: "Undo",
                  onClick: () => {
                    setTeams((all) => [...all, left])
                    setCurrentId(left.id)
                    setStatus(`You're in ${left.name}`)
                  }
                },
                duration: 10_000
              })
            }}
            onResend={(email) => {
              updateTeam(current.id, (team) => ({
                ...team,
                invitations: team.invitations.map((item) => (item.email === email ? { email, sent: Date.now() } : item))
              }))
            }}
            onRevoke={(email) => {
              updateTeam(current.id, (team) => ({
                ...team,
                invitations: team.invitations.filter((item) => item.email !== email)
              }))
            }}
          />
        )}
        {dialog?.at === "new-organization" && (
          <NewOrganizationDialog
            start={dialog.step}
            {...(dialog.name ? { startName: dialog.name } : {})}
            you={you}
            finalFocus={accountTrigger}
            onCreate={create}
            onInvite={(emails) => {
              if (current) inviteTo(current, emails, true)
              setDialog(undefined)
            }}
            onClose={() => setDialog(undefined)}
          />
        )}
        {/* The kit follows the system's theme unless told, which in a light story is the wrong one. */}
        <SonnerToaster theme={theme} position="bottom-right" />
      </StartActionsProvider>
    </PictureSourceProvider>
  )
}

/**
 * Home as the start page lays it out, with this exploration's account menu and For you in their places. The header
 * keeps the account menu's height signed out too, Continue keeps to the top however long For you runs, and before any
 * project has opened, Open a project says what goes there without an empty list under it.
 */
function Home({
  projects,
  account,
  forYou
}: {
  projects: readonly KnownProject[]
  account: ReactNode
  forYou: ReactNode
}) {
  const last = projects.find((project) => project.recent)
  return (
    <main aria-label="Home" className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-11 px-4 pt-6 pb-14 sm:px-10">
        <h1 className="sr-only">Home</h1>
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {account}
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
            <SearchButton />
            <OpenMenu />
            <NewProjectButton />
          </div>
        </header>
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
          {last ? <ContinueCard project={last} active /> : <FirstTime />}
          {forYou}
        </div>
        {projects.length > 0 && <ProjectList projects={projects} skip={last?.root} />}
      </div>
    </main>
  )
}
