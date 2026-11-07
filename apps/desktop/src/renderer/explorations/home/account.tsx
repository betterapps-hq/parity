import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Skeleton,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, ChevronsUpDown, Mail, Plus, Search, X } from "lucide-react"
import {
  type FormEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react"
import type { SignInProvider } from "../../../shared/account.ts"
import { OrganizationBadge } from "../../account/OrganizationBadge.tsx"
import { NobodyAvatar, PersonAvatar } from "../../account/PersonAvatar.tsx"
import { SignInPanel, WaitingPanel } from "../../account/SignInPanels.tsx"
import { whenLabel } from "../../start/projects.ts"
import { useNow } from "../../start/use-now.ts"
import type { Account, Member, Person, Role, SentInvitation, Team } from "./data.ts"

/** An email that, when it's cut short, keeps its domain: the part that tells your accounts apart. */
function Email({ address }: { address: string }) {
  const at = address.lastIndexOf("@")
  if (at < 0) return <span className="min-w-0 truncate">{address}</span>
  return (
    <span className="flex min-w-0">
      <span className="min-w-0 truncate">{address.slice(0, at)}</span>
      <span className="shrink-0">{address.slice(at)}</span>
    </span>
  )
}

/** A leading slot as wide as an organization's badge, so every label in the menu starts at the same place. */
function Lead({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="grid size-5 shrink-0 place-items-center">
      {children}
    </span>
  )
}

/**
 * Where you're working, at the top left of Home: Personal or an organization, in the account you're in. Its menu
 * switches between them with a refresh in the background and makes a new organization; with several accounts it says
 * whose they are. Your accounts are at the end of the title bar. Settings stay in the app's menu; an organization's
 * people wait for organization settings.
 */
export function WorkspaceMenu({
  account,
  several,
  current,
  switching,
  status,
  defaultOpen,
  triggerRef,
  onSwitch,
  onNewOrganization
}: {
  /** The account you're in. */
  account: Account
  /** Whether you're signed in to more than one account, so the menu says whose workspaces these are. */
  several: boolean
  /** The organization you're in there, or none for Personal. */
  current: Team | undefined
  /** The workspace a switch is moving to, while it does. */
  switching?: string
  /** What a screen reader hears about switching: where it's moving to, then where you are. */
  status?: string
  defaultOpen?: boolean
  /** Where the keyboard goes back to when a dialog opened from the menu closes. */
  triggerRef?: RefObject<HTMLButtonElement | null>
  /** Moves to Personal, or an organization, in the account you're in. */
  onSwitch: (id: string | undefined) => void
  onNewOrganization: () => void
}) {
  return (
    <>
      <DropdownMenu {...(defaultOpen ? { defaultOpen } : {})}>
        <DropdownMenuTrigger
          render={
            <button
              ref={triggerRef}
              type="button"
              className="-ml-2 flex max-w-80 min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted/50"
            >
              <OrganizationBadge {...(current ? { organization: current } : {})} size={28} />
              <span className="truncate text-sm font-medium">
                {switching ? `Switching to ${switching}` : (current?.name ?? "Personal")}
              </span>
              {switching ? (
                <Spinner aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-max max-w-[min(24rem,calc(100vw-2rem))] min-w-64">
          <DropdownMenuGroup>
            {several && (
              <DropdownMenuLabel className="truncate text-xs text-muted-foreground">
                {account.person.email}
              </DropdownMenuLabel>
            )}
            <DropdownMenuRadioGroup
              value={current?.id ?? "personal"}
              onValueChange={(id: string) => onSwitch(id === "personal" ? undefined : id)}
            >
              <DropdownMenuRadioItem value="personal" closeOnClick>
                <OrganizationBadge size={20} /> Personal
              </DropdownMenuRadioItem>
              {account.teams.map((team) => (
                <DropdownMenuRadioItem key={team.id} value={team.id} closeOnClick>
                  <OrganizationBadge organization={team} size={20} />
                  <span className="min-w-0 truncate">{team.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuItem onClick={onNewOrganization}>
              <Lead>
                <Plus />
              </Lead>
              New organization
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <output className="sr-only">{status}</output>
    </>
  )
}

/**
 * Your accounts, from your picture at the end of the title bar where the app has it. Each account is a row with its own
 * Sign out, so any of them can go without switching to it first. With one account that's your name, your email and
 * Sign out. With several, each row names its account by email and says where it opens; the one you're in is shaded,
 * and choosing another switches to it. An account whose session ended is dimmed: choosing it signs in again, and Remove
 * forgets it. Add another account is last. Settings stay in the app's menu.
 *
 * It's a panel rather than a menu, since each row holds two actions. It opens with nothing chosen, so Enter can't sign
 * you out by accident; Tab moves through the rows.
 */
export function AccountMenu({
  accounts,
  account,
  defaultOpen = false,
  triggerRef,
  whereIn,
  onSwitchAccount,
  onSignInAgain,
  onAddAccount,
  onSignIn,
  onSignOut
}: {
  accounts: readonly Account[]
  /** The account you're in, or none when signed out. */
  account: Account | undefined
  defaultOpen?: boolean
  /** Where the keyboard goes back to when a dialog opened from the panel closes. */
  triggerRef?: RefObject<HTMLButtonElement | null>
  /** The workspace an account opens in: where you are, or where you were last in it. */
  whereIn: (each: Account) => string
  onSwitchAccount: (email: string) => void
  onSignInAgain: (email: string) => void
  onAddAccount: () => void
  onSignIn: () => void
  /** Signs out of one account, by its email, or forgets one whose session ended. */
  onSignOut: (email: string) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const list = useRef<HTMLDivElement>(null)
  const several = accounts.length > 1
  // Each action closes the panel first, so the keyboard goes back to your picture before anything moves.
  const then = (action: () => void) => () => {
    setOpen(false)
    action()
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            ref={triggerRef}
            type="button"
            aria-label={account ? `Your accounts, signed in as ${account.person.email}` : "Sign in"}
            className="mb-1.5 ml-auto shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring [-webkit-app-region:no-drag]"
          >
            {account ? <PersonAvatar person={account.person} size={24} /> : <NobodyAvatar size={24} />}
          </button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={6}
        initialFocus={list}
        aria-label={account ? "Your accounts" : "Not signed in"}
        className="w-[22rem] max-w-[calc(100vw-2rem)] gap-0 p-1.5"
      >
        <div ref={list} tabIndex={-1} className="flex flex-col gap-0.5 outline-none">
          {account ? (
            <>
              <ul className="flex flex-col gap-0.5">
                {accounts.map((each) => {
                  const { email } = each.person
                  const here = each === account
                  // With one account the row is your name and email; with several, the email and where it opens.
                  let detail = email
                  if (several) detail = each.ended ? "Session ended" : whereIn(each)
                  // The account you're in is shaded once there's another to tell it from.
                  let shade = "hover:bg-accent/60"
                  if (here) shade = several ? "bg-accent" : ""
                  const who = (
                    <>
                      <span className={each.ended ? "opacity-50" : ""}>
                        <PersonAvatar person={each.person} size={32} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex min-w-0 text-sm font-medium">
                          {several ? <Email address={email} /> : <span className="truncate">{each.person.name}</span>}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{detail}</span>
                      </span>
                    </>
                  )
                  return (
                    <li
                      key={email}
                      aria-current={here && several ? "true" : undefined}
                      className={`flex items-center gap-1 rounded-md pr-1.5 ${shade}`}
                    >
                      {here ? (
                        <span className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2">{who}</span>
                      ) : (
                        <button
                          type="button"
                          aria-label={each.ended ? `Sign in again as ${email}` : `Switch to ${email}, ${whereIn(each)}`}
                          onClick={then(() => (each.ended ? onSignInAgain(email) : onSwitchAccount(email)))}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {who}
                        </button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`${each.ended ? "Remove" : "Sign out of"} ${email}`}
                        onClick={then(() => onSignOut(email))}
                        className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {each.ended ? "Remove" : "Sign out"}
                      </Button>
                    </li>
                  )
                })}
              </ul>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                onClick={then(onAddAccount)}
                className="flex items-center gap-3 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground"
                >
                  <Plus className="size-4" />
                </span>
                Add another account
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 px-2 py-2">
              <NobodyAvatar size={32} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">Not signed in</span>
                <span className="truncate text-xs text-muted-foreground">Projects on this computer still work</span>
              </span>
              <Button size="sm" onClick={then(onSignIn)}>
                Sign in
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Another account, from the account menu: the ways in, as signing in has them, then the browser. The accounts you're
 * signed in to stay signed in. Signing in again to an account whose session ended goes straight to the browser, since
 * Parity knows how it signed in.
 */
export function AddAccountDialog({
  signedIn,
  again,
  finalFocus,
  onAdd,
  onClose
}: {
  /** The accounts that stay signed in. */
  signedIn: readonly Person[]
  /** The account whose session ended and how it signed in, to sign in to it again. */
  again?: { email: string; provider: SignInProvider } | undefined
  finalFocus?: RefObject<HTMLElement | null>
  /** The browser handed back a session for the account signed in with `provider`. */
  onAdd: (provider: SignInProvider) => void
  onClose: () => void
}) {
  const [waiting, setWaiting] = useState(again?.provider)
  // The prototype's browser: it hands back an account a moment after it opens.
  const added = useRef(onAdd)
  useEffect(() => {
    added.current = onAdd
  })
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => added.current(waiting), 2500)
    return () => clearTimeout(timer)
  }, [waiting])
  const [only] = signedIn
  return (
    // As signing in from Home does: only Cancel, Escape or the close button end it.
    <Dialog open disablePointerDismissal onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[calc(100vh-2rem)] gap-0 overflow-y-auto p-8 sm:max-w-[28rem]"
        {...(finalFocus ? { finalFocus } : {})}
      >
        {waiting ? (
          <WaitingPanel
            dialog
            attempt={{
              at: "waiting",
              provider: waiting,
              ...(again ? { email: again.email } : {}),
              url: "https://api.workos.com/user_management/authorize"
            }}
            onReopen={() => undefined}
            onCancel={again ? onClose : () => setWaiting(undefined)}
          />
        ) : (
          <SignInPanel
            dialog
            title="Add another account"
            description={
              signedIn.length === 1 && only ? `You stay signed in as ${only.email}.` : "Your accounts stay signed in."
            }
            onSignIn={(request) => setWaiting(request.provider)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Signed out, in the workspace menu's place on Home: Sign in, so nothing looks signed in. */
export function SignInButton({ onSignIn }: { onSignIn: () => void }) {
  return (
    <Button variant="ghost" className="-ml-2.5 gap-2" onClick={onSignIn}>
      <NobodyAvatar size={22} /> Sign in
    </Button>
  )
}

/** The workspace menu's shape while Parity asks main who's signed in, so the header doesn't jump. */
export function WorkspaceMenuLoading() {
  return (
    <div className="flex items-center gap-2.5 py-1.5" aria-hidden>
      <Skeleton className="size-7 rounded-md" />
      <Skeleton className="h-3.5 w-24" />
    </div>
  )
}

/** The account menu's place in the title bar while Parity asks main who's signed in, as the app keeps it. */
export function AccountMenuLoading() {
  return <span className="mb-1.5 ml-auto size-6 shrink-0" />
}

export type PeopleTab = "members" | "invitations"

/** Addresses typed into an invite field, split at commas, semicolons and spaces. */
function addresses(text: string): string[] {
  return text.split(/[\s,;]+/).filter(Boolean)
}

const looksLikeEmail = (text: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)

/** Why the addresses can't be sent, or nothing when they can: none, one that isn't an address, or someone already in. */
function problemWith(emails: readonly string[], team?: Team): string | undefined {
  if (emails.length === 0) return "Enter an email address."
  const wrong = emails.find((email) => !looksLikeEmail(email))
  if (wrong) return `“${wrong}” isn't an email address.`
  const member = team?.members.find((person) => emails.includes(person.email))
  if (member && team) return `${member.name} is already in ${team.name}.`
  const invited = team?.invitations.find((invitation) => emails.includes(invitation.email))
  if (invited) return `${invited.email} is already invited.`
  return undefined
}

/** An email field that takes several addresses, with its hint or what's wrong with it. */
function EmailsField({
  label,
  showLabel,
  problem,
  text,
  describedBy,
  focusFirst = false,
  onText,
  children
}: {
  label: string
  showLabel: boolean
  problem: string | undefined
  text: string
  /** More that describes the field, such as the dialog's description when the field takes the keyboard. */
  describedBy?: string
  /** Takes the keyboard when it appears, as on New organization's second step. */
  focusFirst?: boolean
  onText: (text: string) => void
  children?: ReactNode
}) {
  const field = useId()
  const hint = useId()
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusFirst) input.current?.focus()
  }, [focusFirst])
  return (
    <Field {...(problem ? { "data-invalid": true } : {})}>
      <FieldLabel htmlFor={field} className={showLabel ? "" : "sr-only"}>
        {label}
      </FieldLabel>
      <div className="flex gap-2">
        <Input
          ref={input}
          id={field}
          type="text"
          inputMode="email"
          autoComplete="off"
          placeholder="name@example.com"
          value={text}
          aria-invalid={!!problem}
          aria-describedby={describedBy ? `${describedBy} ${hint}` : hint}
          onChange={(event) => onText(event.target.value)}
        />
        {children}
      </div>
      {problem ? (
        <FieldError id={hint}>{problem}</FieldError>
      ) : (
        <FieldDescription id={hint}>Separate addresses with commas.</FieldDescription>
      )}
    </Field>
  )
}

/** How many people load at a time, and more as the list scrolls to its end. */
const page = 50

const count = (n: number) => n.toLocaleString("en-US")

/** You first, then the admins, then everyone else, by name. */
const byStanding = (you: Person) => (a: Member, b: Member) =>
  Number(b.email === you.email) - Number(a.email === you.email) ||
  Number(b.role === "Admin") - Number(a.role === "Admin") ||
  a.name.localeCompare(b.name)

/**
 * An organization's people and the invitations still waiting. Admins invite from the field at the top, which has the
 * keyboard when the dialog opens, and change roles or remove people from each person's role menu. A removal shows in
 * its row with Undo, and happens when the dialog closes. Members see the list; you can leave from your own row.
 *
 * Past a dozen people the list can be searched by name or email; you and the admins come first, and it loads as it
 * scrolls. Where a directory adds and removes people, as Microsoft Entra ID does for a large company, there's nobody to
 * invite, remove or leave from here: admins change roles.
 */
export function PeopleDialog({
  team,
  you,
  tab,
  startSearch = "",
  finalFocus,
  onTab,
  onClose,
  onInvite,
  onRole,
  onRemove,
  onLeave,
  onResend,
  onRevoke
}: {
  team: Team
  you: Person
  tab: PeopleTab
  /** What's typed in search when it opens, as a story starts it. */
  startSearch?: string
  finalFocus?: RefObject<HTMLElement | null>
  onTab: (tab: PeopleTab) => void
  onClose: () => void
  onInvite: (emails: string[]) => void
  onRole: (member: Member, role: Role) => void
  onRemove: (member: Member) => void
  onLeave: () => void
  onResend: (email: string) => void
  onRevoke: (email: string) => void
}) {
  const [text, setText] = useState("")
  const [problem, setProblem] = useState<string>()
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [revoked, setRevoked] = useState<ReadonlySet<string>>(new Set())
  const [query, setQuery] = useState(startSearch)
  const [limit, setLimit] = useState(page)
  // What the last change did, for a screen reader: the dialog shows it, and a toast would sit behind the dialog.
  const [said, setSaid] = useState("")
  // The row whose Undo takes the keyboard: the one just removed, left or revoked, and only then, so a search, a
  // scroll or a tab that brings a waiting row back doesn't take focus from where it is.
  const [undoFocus, setUndoFocus] = useState<string>()
  const pend = (set: typeof setRemoved, item: string) => {
    set((pending) => toggle(pending, item))
    setUndoFocus(item)
  }
  const list = useRef<HTMLUListElement>(null)
  const admin = team.role === "Admin"
  const managed = !!team.directory
  const canInvite = admin && !managed
  const searchable = team.members.length > 12
  // Admins as they'll be once the dialog closes, so pending removals and your own leaving can't leave it with none.
  const otherAdmins = team.members.filter(
    (member) => member.role === "Admin" && member.email !== you.email && !removed.has(member.email)
  )
  const onlyAdmin = admin && otherAdmins.length === 0
  const leaving = removed.has(you.email)
  // The order is set when People opens, so a role change updates its row in place rather than moving it out of
  // sight; anyone new goes at the end. It's you, the admins, then everyone else again next time.
  const [order] = useState(() => [...team.members].sort(byStanding(you)).map((member) => member.email))
  const ordered = useMemo(() => {
    const placed = new Set(order)
    const byEmail = new Map(team.members.map((member) => [member.email, member]))
    return [
      ...order.flatMap((email) => byEmail.get(email) ?? []),
      ...team.members.filter((member) => !placed.has(member.email))
    ]
  }, [order, team.members])
  const words = query.trim().toLowerCase()
  const matches = words
    ? ordered.filter((member) => member.name.toLowerCase().includes(words) || member.email.includes(words))
    : ordered
  const shown = matches.slice(0, limit)
  // The next page loads when the end of the list scrolls into view. A ref callback, since the dialog's contents mount
  // after the dialog itself.
  const watchEnd = useCallback((element: HTMLLIElement | null) => {
    if (!element) return
    const watcher = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setLimit((loaded) => loaded + page)
    })
    watcher.observe(element)
    return () => watcher.disconnect()
  }, [])
  const toggle = (set: ReadonlySet<string>, item: string) => {
    const next = new Set(set)
    if (!next.delete(item)) next.add(item)
    return next
  }
  const close = () => {
    for (const member of team.members) {
      if (removed.has(member.email) && member.email !== you.email) onRemove(member)
    }
    for (const email of revoked) onRevoke(email)
    onClose()
    if (removed.has(you.email)) onLeave()
  }
  const invite = (event: FormEvent) => {
    event.preventDefault()
    const emails = addresses(text)
    const wrong = problemWith(emails, team)
    setProblem(wrong)
    if (wrong) return
    onInvite(emails)
    setSaid(emails.length === 1 ? `Invited ${emails[0]}` : `Invited ${emails.length} people`)
    setText("")
  }
  const changeRole = (member: Member, role: Role) => {
    onRole(member, role)
    setSaid(`${member.name} is ${role === "Admin" ? "an admin" : "a member"} now`)
  }
  const search = searchable && (
    <InputGroup className="mb-2">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        // A text field, not a search one, whose own clear button and Escape would also close the dialog.
        type="text"
        aria-label={`Search people in ${team.name}`}
        placeholder="Search by name or email"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setLimit(page)
        }}
        // Escape clears what's typed first, as search fields do, and closes the dialog once it's empty.
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !query) return
          event.preventDefault()
          event.stopPropagation()
          setQuery("")
          setLimit(page)
        }}
      />
      {query && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label="Clear search"
            onClick={(event) => {
              setQuery("")
              setLimit(page)
              event.currentTarget.closest("[data-slot=input-group]")?.querySelector("input")?.focus()
            }}
          >
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
  const rows = (
    <ul
      ref={list}
      tabIndex={-1}
      // A landing place for a screen reader when a member's People opens, not a control: the first Tab reaches their menu.
      className="flex flex-col pr-3 outline-none"
    >
      {shown.map((member, index) => {
        const isYou = member.email === you.email
        const gone = removed.has(member.email)
        let role: ReactNode = <StaticRole role={member.role} />
        if (gone) {
          role = (
            <UndoButton
              label={isYou ? `Undo leaving ${team.name}` : `Undo removing ${member.name}`}
              takeFocus={undoFocus === member.email}
              onFocused={() => setUndoFocus(undefined)}
              onUndo={() => setRemoved((set) => toggle(set, member.email))}
            />
          )
        } else if (isYou && !managed) {
          role = (
            <YourRoleMenu
              team={team}
              role={member.role}
              onlyAdmin={onlyAdmin}
              onLeave={() => pend(setRemoved, member.email)}
            />
          )
        } else if (admin && !isYou) {
          role = (
            <RoleMenu
              team={team}
              member={member}
              canRemove={!managed}
              lastAdmin={leaving && otherAdmins.length === 1 && otherAdmins[0]?.email === member.email}
              onRole={changeRole}
              onRemove={() => pend(setRemoved, member.email)}
            />
          )
        }
        return (
          // The list loads as it scrolls, so each row says where it sits among everyone who matches.
          <li key={member.email} aria-setsize={matches.length} aria-posinset={index + 1}>
            <Item size="sm" className="px-0">
              <ItemMedia className={gone ? "opacity-50" : ""}>
                <PersonAvatar person={member} size={32} />
              </ItemMedia>
              <ItemContent className="min-w-0 gap-0">
                <ItemTitle className={`max-w-full ${gone ? "text-muted-foreground" : ""}`}>
                  <span className="truncate">{member.name}</span>
                  {isYou && <span className="font-normal text-muted-foreground">You</span>}
                </ItemTitle>
                <ItemDescription className="truncate">
                  {gone ? `${isYou ? "Leaving" : "Removed from"} ${team.name}` : member.email}
                </ItemDescription>
              </ItemContent>
              <ItemActions>{role}</ItemActions>
            </Item>
          </li>
        )
      })}
      {shown.length < matches.length && (
        <li ref={watchEnd} aria-hidden className="grid place-items-center py-3">
          <Spinner className="size-4 text-muted-foreground" />
        </li>
      )}
      {matches.length === 0 && (
        <li className="py-6 text-sm text-muted-foreground">
          No one in {team.name} matches “{query.trim()}”.
        </li>
      )}
    </ul>
  )
  let description = admin
    ? "Invite people by email. They join as members."
    : "Only admins can invite people or change roles."
  if (managed) {
    description = `${team.directory} adds and removes ${team.name}'s ${count(team.members.length)} people. ${
      admin ? "Admins change roles here." : "Only admins can change roles."
    }`
  }
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        {...(finalFocus ? { finalFocus } : {})}
        // Without a field to type in, a member's only control is their own menu, which leaves; the list takes the
        // keyboard instead.
        {...(canInvite || searchable ? {} : { initialFocus: list })}
      >
        <output className="sr-only">{said}</output>
        <output className="sr-only">
          {words && `${count(matches.length)} ${matches.length === 1 ? "person matches" : "people match"}`}
        </output>
        <DialogHeader>
          <DialogTitle>People in {team.name}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {canInvite ? (
          <>
            <form onSubmit={invite} noValidate>
              <EmailsField
                label="Email addresses to invite"
                showLabel={false}
                problem={problem}
                text={text}
                onText={(value) => {
                  setText(value)
                  setProblem(undefined)
                }}
              >
                <Button type="submit">Invite</Button>
              </EmailsField>
            </form>
            <Tabs value={tab} onValueChange={(value: PeopleTab) => onTab(value)}>
              <TabsList variant="line">
                <TabsTrigger value="members">
                  Members <span className="text-muted-foreground tabular-nums">{count(team.members.length)}</span>
                </TabsTrigger>
                <TabsTrigger value="invitations">
                  Invitations{" "}
                  <span className="text-muted-foreground tabular-nums">{count(team.invitations.length)}</span>
                </TabsTrigger>
              </TabsList>
              {/* Both panels keep one height, so changing tabs doesn't move the dialog. */}
              <TabsContent value="members">
                {search}
                <ScrollArea className={`-mr-3 ${searchable ? "h-86" : "h-96"}`}>{rows}</ScrollArea>
              </TabsContent>
              <TabsContent value="invitations">
                <ScrollArea className="-mr-3 h-96">
                  {team.invitations.length === 0 ? (
                    <p className="py-6 text-sm text-muted-foreground">No invitations are waiting.</p>
                  ) : (
                    <ul className="flex flex-col pr-3">
                      {team.invitations.map((invitation) => (
                        <InvitationRow
                          key={invitation.email}
                          invitation={invitation}
                          revoked={revoked.has(invitation.email)}
                          onResend={() => {
                            onResend(invitation.email)
                            setSaid(`Sent the invitation to ${invitation.email} again`)
                          }}
                          takeFocus={undoFocus === invitation.email}
                          onFocused={() => setUndoFocus(undefined)}
                          onRevoke={() => pend(setRevoked, invitation.email)}
                          onUndo={() => setRevoked((set) => toggle(set, invitation.email))}
                        />
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div>
            {search}
            {searchable ? (
              <ScrollArea className="-mr-3 h-96">{rows}</ScrollArea>
            ) : (
              <div className="-mr-3 max-h-96 overflow-y-auto">{rows}</div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** An invitation still waiting, with its state as a menu that sends it again or revokes it. */
function InvitationRow({
  invitation,
  revoked,
  takeFocus,
  onFocused,
  onResend,
  onRevoke,
  onUndo
}: {
  invitation: SentInvitation
  revoked: boolean
  takeFocus: boolean
  onFocused: () => void
  onResend: () => void
  onRevoke: () => void
  onUndo: () => void
}) {
  const now = useNow()
  return (
    <li>
      <Item size="sm" className="px-0">
        <ItemMedia className={`size-8 rounded-full bg-muted text-muted-foreground ${revoked ? "opacity-50" : ""}`}>
          <Mail className="size-4" />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-0">
          <ItemTitle className={`max-w-full ${revoked ? "text-muted-foreground" : ""}`}>
            <span className="truncate">{invitation.email}</span>
          </ItemTitle>
          <ItemDescription>{revoked ? "Revoked" : `Sent ${whenLabel(invitation.sent, now)}`}</ItemDescription>
        </ItemContent>
        <ItemActions>
          {revoked ? (
            <UndoButton
              label={`Undo revoking the invitation to ${invitation.email}`}
              takeFocus={takeFocus}
              onFocused={onFocused}
              onUndo={onUndo}
            />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    <span className="sr-only">The invitation to {invitation.email}:</span>{" "}
                    {invitation.expired ? "Expired" : "Invited"} <ChevronDown className="opacity-60" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onResend}>Resend invitation</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onRevoke}>
                  Revoke invitation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </ItemActions>
      </Item>
    </li>
  )
}

/**
 * Undo, in a row whose change waits for the dialog to close. Right after the change it takes the keyboard from the menu
 * that made it, and it gives the keyboard back to the row's menu.
 */
function UndoButton({
  label,
  takeFocus,
  onFocused,
  onUndo
}: {
  label: string
  takeFocus: boolean
  onFocused: () => void
  onUndo: () => void
}) {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!takeFocus) return
    button.current?.focus()
    onFocused()
  }, [takeFocus, onFocused])
  return (
    <Button
      ref={button}
      variant="ghost"
      size="sm"
      aria-label={label}
      onClick={(event) => {
        // The row's menu comes back in Undo's place; the keyboard goes to it.
        const row = event.currentTarget.closest("li")
        onUndo()
        // After the dialog's own focus handling, which sends focus to the dialog when Undo goes.
        setTimeout(() => row?.querySelector("button")?.focus())
      }}
    >
      Undo
    </Button>
  )
}

/** A role you can't change, lined up with the role menus beside it. */
function StaticRole({ role }: { role: Role }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 px-2.5 text-[0.8rem] font-medium text-muted-foreground">
      {role}
      <ChevronDown aria-hidden className="invisible size-3.5" />
    </span>
  )
}

/** What each role does; where a directory adds people, nobody invites. */
const roles = (managed: boolean): { role: Role; does: string }[] => [
  { role: "Admin", does: managed ? "Also changes roles" : "Also invites people and changes roles" },
  { role: "Member", does: "Comments, reviews and shares projects" }
]

/**
 * Someone's role, as a menu that changes it or removes them. While you're leaving, the admin who'd be left keeps their
 * role, so the organization always has one.
 */
function RoleMenu({
  team,
  member,
  canRemove,
  lastAdmin,
  onRole,
  onRemove
}: {
  team: Team
  member: Member
  /** Whether people are removed from here; where a directory adds and removes them, it does that. */
  canRemove: boolean
  lastAdmin: boolean
  onRole: (member: Member, role: Role) => void
  onRemove: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <span className="sr-only">{member.name}&apos;s role:</span> {member.role}{" "}
            <ChevronDown className="opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuRadioGroup value={member.role} onValueChange={(role: Role) => onRole(member, role)}>
          {roles(!canRemove).map(({ role, does }) => (
            <DropdownMenuRadioItem
              key={role}
              value={role}
              disabled={lastAdmin && role === "Member"}
              closeOnClick
              className="flex-col items-start gap-0"
            >
              {role}
              <span className="text-xs text-muted-foreground">{does}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {canRemove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={lastAdmin}
              onClick={onRemove}
              className="flex-col items-start gap-0"
            >
              Remove from {team.name}
              {lastAdmin && (
                <span className="text-xs text-muted-foreground">
                  You&apos;re leaving, so {team.name} needs them as an admin.
                </span>
              )}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Your own role, as a menu that leaves the organization, unless you're the admin it can't do without. Another admin
 * changes your role, from their side, where it can be changed back.
 */
function YourRoleMenu({
  team,
  role,
  onlyAdmin,
  onLeave
}: {
  team: Team
  role: Role
  onlyAdmin: boolean
  onLeave: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <span className="sr-only">Your role:</span> {role} <ChevronDown className="opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          variant="destructive"
          disabled={onlyAdmin}
          onClick={onLeave}
          className="flex-col items-start gap-0"
        >
          Leave {team.name}
          {onlyAdmin && <span className="text-xs text-muted-foreground">Make someone else an admin first.</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A new organization in two steps: its name, which makes it and moves you into it, then the people to invite, which
 * can wait.
 */
export function NewOrganizationDialog({
  start = "name",
  startName = "",
  you,
  finalFocus,
  onCreate,
  onInvite,
  onClose
}: {
  start?: "name" | "invite"
  startName?: string
  you: Person
  finalFocus?: RefObject<HTMLElement | null>
  onCreate: (name: string) => void
  onInvite: (emails: string[]) => void
  onClose: () => void
}) {
  const [step, setStep] = useState(start)
  const [name, setName] = useState(startName)
  const [nameProblem, setNameProblem] = useState<string>()
  const [text, setText] = useState("")
  const [problem, setProblem] = useState<string>()
  const nameField = useId()
  const nameHint = useId()
  const ready = useId()
  const create = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setNameProblem("Enter a name.")
      return
    }
    onCreate(name.trim())
    setStep("invite")
  }
  const invite = (event: FormEvent) => {
    event.preventDefault()
    const emails = addresses(text)
    // Nobody's invited yet; you're its one member.
    const made: Team = { id: "", name, role: "Admin", members: [{ ...you, role: "Admin" }], invitations: [], notes: [] }
    const wrong = problemWith(emails, made)
    setProblem(wrong)
    if (!wrong) onInvite(emails)
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" {...(finalFocus ? { finalFocus } : {})}>
        {step === "name" ? (
          <form onSubmit={create} noValidate className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>New organization</DialogTitle>
              <DialogDescription>
                Work with your team in Parity: share projects, ask for reviews and comment on designs.
              </DialogDescription>
            </DialogHeader>
            <Field {...(nameProblem ? { "data-invalid": true } : {})}>
              <FieldLabel htmlFor={nameField}>Name</FieldLabel>
              <Input
                id={nameField}
                value={name}
                maxLength={64}
                autoComplete="organization"
                aria-invalid={!!nameProblem}
                aria-describedby={nameHint}
                onChange={(event) => {
                  setName(event.target.value)
                  setNameProblem(undefined)
                }}
              />
              {nameProblem ? (
                <FieldError id={nameHint}>{nameProblem}</FieldError>
              ) : (
                <FieldDescription id={nameHint}>Usually your company or team.</FieldDescription>
              )}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Create organization</Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={invite} noValidate className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Invite people to {name}</DialogTitle>
              <DialogDescription id={ready}>
                {name} is ready. Each person gets an email with a link to join.
              </DialogDescription>
            </DialogHeader>
            <EmailsField
              label="Email addresses"
              showLabel
              problem={problem}
              text={text}
              describedBy={ready}
              focusFirst
              onText={(value) => {
                setText(value)
                setProblem(undefined)
              }}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Skip for now
              </Button>
              <Button type="submit">Send invitations</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
