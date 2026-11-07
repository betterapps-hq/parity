import { SonnerToaster, TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { type ReactNode, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { SignInProvider } from "../../../shared/account.ts"
import { TabBar } from "../../chrome/TabBar.tsx"
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
  AddAccountDialog,
  WorkspaceMenu,
  WorkspaceMenuLoading,
  NewOrganizationDialog,
  PeopleDialog,
  type PeopleTab,
  SignInButton
} from "./account.tsx"
import {
  type Account,
  contoso,
  gmail,
  halcyon,
  kestrel,
  northwindInvitation,
  sampleNotes,
  samplePictures,
  sampleRecent,
  type Team,
  work,
  you
} from "./data.ts"
import { ForYou, type WaitingInvitation } from "./for-you.tsx"

/** Where a story starts. Everything after that works: switching, inviting, joining, making an organization. */
export interface Start {
  page?: "home" | "new-tab"
  /** The organization you're in, or Personal. Contoso is your work account's. */
  workspace?: "personal" | "kestrel" | "halcyon" | "contoso"
  /** Your work account is signed in too, beside your own. */
  twoAccounts?: boolean
  /** Your work account is signed in too, but Contoso's policy ended its session. */
  workEnded?: boolean
  signedOut?: boolean
  /** Parity hasn't heard from main who's signed in yet. */
  loading?: boolean
  /** Signed in for the first time: no projects and no organization yet, with an invitation waiting. */
  newAccount?: boolean
  invitation?: "waiting" | "expired"
  /** Which of the header's menus is open: where you work, or who you are. */
  menuOpen?: "workspaces" | "accounts"
  dialog?: "people" | "invitations" | "new-organization" | "invite-step" | "add-account"
  /** What's typed in People's search when it opens. */
  search?: string
}

type Open =
  | { at: "people"; tab: PeopleTab }
  | { at: "new-organization"; step: "name" | "invite"; name?: string }
  | { at: "add-account"; again?: string }
  | undefined

/** Where you are: which account, and which of its organizations, or none for its Personal. */
interface Place {
  email: string
  team: string | undefined
}

/** Northwind, just made, for the story that starts at inviting people to it. */
const northwind: Team = {
  id: "org_01NORTHWIND",
  name: "Northwind",
  role: "Admin",
  members: [{ ...you, role: "Admin" }],
  invitations: [],
  notes: []
}

/** Your own account, as you first sign in to it. */
const yourAccount = (): Account => ({ person: you, teams: [kestrel, halcyon] })

const workAccount: Account = { person: work, teams: [contoso], provider: "MicrosoftOAuth" }

function startingAccounts(start: Start): Account[] {
  if (start.signedOut) return []
  if (start.newAccount) return [{ person: you, teams: [] }]
  const own = start.dialog === "invite-step" ? { person: you, teams: [kestrel, halcyon, northwind] } : yourAccount()
  if (start.workEnded) return [own, { ...workAccount, ended: true }]
  return start.twoAccounts || start.workspace === "contoso" ? [own, workAccount] : [own]
}

function startingPlace(start: Start): Place {
  if (start.dialog === "invite-step") return { email: you.email, team: northwind.id }
  if (start.workspace === "contoso") return { email: work.email, team: contoso.id }
  if (start.newAccount || start.workspace === "personal") return { email: you.email, team: undefined }
  return { email: you.email, team: start.workspace === "halcyon" ? halcyon.id : kestrel.id }
}

function startingDialog(start: Start): Open {
  if (start.dialog === "people") return { at: "people", tab: "members" }
  if (start.dialog === "invitations") return { at: "people", tab: "invitations" }
  if (start.dialog === "new-organization") return { at: "new-organization", step: "name" }
  if (start.dialog === "invite-step") return { at: "new-organization", step: "invite", name: northwind.name }
  if (start.dialog === "add-account") return { at: "add-account" }
  return undefined
}

function startingInvitation(start: Start): WaitingInvitation | undefined {
  if (start.newAccount || start.invitation === "waiting") return northwindInvitation
  if (start.invitation === "expired") return { ...northwindInvitation, expired: true }
  return undefined
}

/** The account the browser hands back: your work one through Microsoft or a work email, otherwise a Gmail one. */
function accountFrom(provider: SignInProvider): Account {
  return provider === "MicrosoftOAuth" || provider === "authkit" ? workAccount : { person: gmail, teams: [] }
}

/**
 * Home and the new tab page, built from the start page's own pieces, with the account menu, For you and the
 * organization dialogs this exploration proposes.
 */
export function HomePrototype(start: Start) {
  const theme = useResolvedTheme()
  const [accounts, setAccounts] = useState(() => startingAccounts(start))
  const [place, setPlace] = useState(() => startingPlace(start))
  // Where you were last in each account, so switching back or signing out of another returns you there.
  const [lastIn, setLastIn] = useState<Record<string, string | undefined>>({})
  // The accounts you've been in, the latest first: signing out hands over to the one you used last.
  const [used, setUsed] = useState<readonly string[]>(() => [startingPlace(start).email])
  const [switching, setSwitching] = useState<string>()
  const [status, setStatus] = useState<string>()
  // Where the keyboard goes back to when a dialog closes: the menu it was opened from.
  const workspaceTrigger = useRef<HTMLButtonElement>(null)
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
  const account = accounts.find((each) => each.person.email === place.email) ?? accounts[0]
  const current = account?.teams.find((team) => team.id === place.team)
  // What needs you in every organization of every signed-in account, as every project shows in each: newest first,
  // each with where it's from, named when that's not where you are, since opening it goes there.
  const waiting = accounts
    .filter((each) => !each.ended)
    .flatMap((each) =>
      each.teams.flatMap((team) =>
        team.notes.map((note) => {
          const here = each.person.email === place.email && team.id === place.team
          return { ...note, team: team.id, email: each.person.email, ...(here ? {} : { elsewhere: team.name }) }
        })
      )
    )
    .sort((a, b) => b.at - a.at)
  const projects = knownProjects(recent, notes)
  const ignore = () => undefined

  const go = (to: Place) => {
    setPlace(to)
    setLastIn((kept) => ({ ...kept, [to.email]: to.team }))
    setUsed((list) => [to.email, ...list.filter((email) => email !== to.email)])
  }

  const teamsOf = (email: string, change: (teams: Team[]) => Team[]) =>
    setAccounts((all) =>
      all.map((each) => (each.person.email === email ? { ...each, teams: change(each.teams) } : each))
    )

  const updateTeam = (id: string, change: (team: Team) => Team) => {
    if (account) teamsOf(account.person.email, (teams) => teams.map((team) => (team.id === id ? change(team) : team)))
  }

  /**
   * Main moves the session with a refresh in the background, or to another account's session, which it keeps; nothing
   * open closes.
   */
  const switchTo = (email: string, id: string | undefined) => {
    if (email === place.email && id === place.team) return
    const name = accounts.find((each) => each.person.email === email)?.teams.find((team) => team.id === id)?.name
    const named = name ?? "Personal"
    const elsewhere = email !== place.email
    setSwitching(named)
    setStatus(`Switching to ${named}`)
    setTimeout(() => {
      go({ email, team: id })
      setSwitching(undefined)
      // Another account is a different you, so it says so where everyone sees it; the toast is announced too.
      if (elsewhere) {
        setStatus("")
        toast(`Switched to ${email}`, { description: `You're in ${named} now.` })
      } else {
        setStatus(`You're in ${named}`)
      }
    }, 900)
  }

  /** Where an account opens: where you were last in it, or its first organization, or its Personal. */
  const placeIn = (each: Account): Place => ({
    email: each.person.email,
    team: each.person.email in lastIn ? lastIn[each.person.email] : each.teams[0]?.id
  })

  const nameOf = (to: Place) =>
    accounts.find((each) => each.person.email === to.email)?.teams.find((team) => team.id === to.team)?.name ??
    "Personal"

  /**
   * The browser handed back an account: a new one, one whose session ended, or one that's signed in already, which is a
   * switch to it. Each opens where you were last in it. The toasts say it, so the status doesn't say it again.
   */
  const add = (provider: SignInProvider) => {
    setDialog(undefined)
    const added = accountFrom(provider)
    const { email } = added.person
    const existing = accounts.find((each) => each.person.email === email)
    const to = existing ? placeIn(existing) : { email, team: added.teams[0]?.id }
    const named = (existing ?? added).teams.find((team) => team.id === to.team)?.name ?? "Personal"
    const there = { description: `You're in ${named} now.` }
    if (!existing) {
      setAccounts((all) => [...all, added])
      toast(`Added ${email}`, there)
    } else if (existing.ended) {
      setAccounts((all) => all.map((each) => (each === existing ? { ...each, ended: false } : each)))
      toast(`Signed in again as ${email}`, there)
    } else {
      toast(`${email} is already signed in`, email === place.email ? {} : there)
    }
    go(to)
  }

  /**
   * Signs out of any account, or forgets one whose session ended. Another account than the one you're in just goes; you
   * stay where you are. Leaving the one you're in hands over to the account you used last, never one whose session
   * ended, since Parity doesn't hold that identity; with none left, you're signed out.
   */
  const signOut = (which: string) => {
    const leaving = accounts.find((each) => each.person.email === which)
    const rest = accounts.filter((each) => each.person.email !== which)
    setAccounts(rest)
    if (which !== place.email) {
      toast(leaving?.ended ? `Removed ${which}` : `Signed out of ${which}`)
      return
    }
    const email = which
    const rank = (each: Account) => (used.includes(each.person.email) ? used.indexOf(each.person.email) : 999)
    const next = rest.filter((each) => !each.ended).toSorted((a, b) => rank(a) - rank(b))[0]
    if (!next) {
      setAccounts([])
      toast(`Signed out of ${email}`, { description: "Projects on this computer stay open." })
      return
    }
    const to = placeIn(next)
    go(to)
    toast(`Signed out of ${email}`, { description: `You're in ${nameOf(to)} as ${to.email} now.` })
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
      // The invitation went to your own account's email, so that's where you join.
      teamsOf(you.email, (all) => [...all, joined])
      go({ email: you.email, team: joined.id })
      setInvitation(undefined)
      const as = place.email === you.email ? "" : ` as ${you.email}`
      toast(`You joined ${joined.name}`, { description: `You're in ${joined.name}${as} now.` })
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
    if (!account) return
    const made: Team = {
      id: `org_01${name.toUpperCase().replaceAll(/\W/g, "")}`,
      name,
      role: "Admin",
      members: [{ ...account.person, role: "Admin" }],
      invitations: [],
      notes: []
    }
    teamsOf(account.person.email, (all) => [...all, made])
    go({ email: account.person.email, team: made.id })
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

  const signIn = () => {
    setAccounts([yourAccount()])
    go({ email: you.email, team: kestrel.id })
  }

  let workspaceMenu: ReactNode = <WorkspaceMenuLoading />
  // Signed out there's no workspace to show, so nothing looks signed in: Sign in takes its place.
  if (!start.loading && !account) workspaceMenu = <SignInButton onSignIn={signIn} />
  const accountMenu = start.loading ? (
    <AccountMenuLoading />
  ) : (
    <AccountMenu
      accounts={accounts}
      account={account}
      {...(start.menuOpen === "accounts" ? { defaultOpen: true } : {})}
      triggerRef={accountTrigger}
      whereIn={(each) => nameOf(each.person.email === place.email ? place : placeIn(each))}
      onSwitchAccount={(email) => {
        const target = accounts.find((each) => each.person.email === email)
        if (target) switchTo(email, placeIn(target).team)
      }}
      onSignInAgain={(email) => setDialog({ at: "add-account", again: email })}
      onAddAccount={() => setDialog({ at: "add-account" })}
      onSignIn={signIn}
      onSignOut={signOut}
    />
  )
  if (!start.loading && account) {
    workspaceMenu = (
      <WorkspaceMenu
        account={account}
        several={accounts.length > 1}
        current={current}
        {...(switching ? { switching } : {})}
        {...(status ? { status } : {})}
        {...(start.menuOpen === "workspaces" ? { defaultOpen: true } : {})}
        triggerRef={workspaceTrigger}
        onSwitch={(id) => switchTo(account.person.email, id)}
        onNewOrganization={() => setDialog({ at: "new-organization", step: "name" })}
      />
    )
  }

  let forYouState: "loading" | "signed-out" | "signed-in" = "signed-in"
  if (start.loading) forYouState = "loading"
  else if (!account) forYouState = "signed-out"

  const forYou = (
    <ForYou
      state={forYouState}
      notes={waiting}
      invitation={invitation}
      // With several accounts, the invitation says which one it went to, since that's where Join puts you.
      {...(accounts.length > 1 ? { invitedAs: you.email } : {})}
      ended={accounts.filter((each) => each.ended).map((each) => each.person)}
      onSignInAgain={(email) => setDialog({ at: "add-account", again: email })}
      onOpen={(note) => {
        // A note from another organization or account opens its project there, with the same switch as the menu's.
        const from = waiting.find((item) => item.id === note.id)
        if (from) switchTo(from.email, from.team)
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
        {/* The whole window: the title bar, with the account menu at its end, over the page. */}
        <TooltipProvider>
          <div className="flex h-screen flex-col bg-background text-foreground">
            <TabBar account={accountMenu} />
            {start.page === "new-tab" ? (
              <NewTab projects={projects} />
            ) : (
              <Home projects={projects} workspace={workspaceMenu} forYou={forYou} />
            )}
          </div>
        </TooltipProvider>
        {dialog?.at === "people" && account && current && (
          <PeopleDialog
            team={current}
            you={account.person}
            tab={dialog.tab}
            {...(start.search ? { startSearch: start.search } : {})}
            finalFocus={workspaceTrigger}
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
              const { email } = account.person
              teamsOf(email, (all) => all.filter((team) => team.id !== left.id))
              go({ email, team: undefined })
              toast(`You left ${left.name}`, {
                description: "You're in Personal now.",
                action: {
                  label: "Undo",
                  onClick: () => {
                    teamsOf(email, (all) => [...all, left])
                    go({ email, team: left.id })
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
        {dialog?.at === "new-organization" && account && (
          <NewOrganizationDialog
            start={dialog.step}
            {...(dialog.name ? { startName: dialog.name } : {})}
            you={account.person}
            finalFocus={workspaceTrigger}
            onCreate={create}
            onInvite={(emails) => {
              if (current) inviteTo(current, emails, true)
              setDialog(undefined)
            }}
            onClose={() => setDialog(undefined)}
          />
        )}
        {dialog?.at === "add-account" && account && (
          <AddAccountDialog
            signedIn={accounts.filter((each) => !each.ended).map((each) => each.person)}
            again={(() => {
              const ended = accounts.find((each) => each.person.email === dialog.again)
              return ended?.provider ? { email: ended.person.email, provider: ended.provider } : undefined
            })()}
            finalFocus={accountTrigger}
            onAdd={add}
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
 * Home as the start page lays it out, with this exploration's workspace menu and For you in their places. The header
 * keeps its height signed out too, Continue keeps to the top however long For you runs, and before any project has
 * opened, Open a project says what goes there without an empty list under it.
 */
function Home({
  projects,
  workspace,
  forYou
}: {
  projects: readonly KnownProject[]
  workspace: ReactNode
  forYou: ReactNode
}) {
  const last = projects.find((project) => project.recent)
  return (
    <main aria-label="Home" className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-11 px-4 pt-6 pb-14 sm:px-10">
        <h1 className="sr-only">Home</h1>
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {workspace}
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2 max-sm:w-full">
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
