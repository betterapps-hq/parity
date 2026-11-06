import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Kbd
} from "@buildkitgg/shadcn-baseui-kit"
import {
  ChevronDown,
  ChevronsUpDown,
  FileInput,
  FolderOpen,
  KeyRound,
  LogOut,
  Plus,
  Search,
  Settings,
  UserPlus
} from "lucide-react"
import { useEffect, useRef } from "react"
import { accountActions, useAccount } from "../account/account.ts"
import { currentOrganization, knownOrganizations, OrganizationBadge } from "../account/OrganizationBadge.tsx"
import { NobodyAvatar, PersonAvatar } from "../account/PersonAvatar.tsx"
import { actions } from "../chrome/actions.ts"
import { formatKeys } from "../chrome/keys.ts"
import { AzureDevOpsMark, GitHubMark } from "./marks.tsx"
import { newProjectNotReady, notReady, useStartActions } from "./start-actions.ts"

/**
 * Looks like a field and opens search, which finds your projects and every action. `takeFocus` gives it the keyboard
 * when it shows, as a new tab does, so Enter or Space searches at once.
 */
export function SearchButton({ large, takeFocus = false }: { large?: boolean; takeFocus?: boolean }) {
  const actions = useStartActions()
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (takeFocus) button.current?.focus({ preventScroll: true })
  }, [takeFocus])
  return (
    <button
      ref={button}
      type="button"
      onClick={actions.search}
      className={`flex items-center gap-2.5 border bg-card/60 text-left text-muted-foreground outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring ${
        large
          ? "h-12 w-full rounded-xl px-4 text-[15px] shadow-[0_8px_30px_-12px_rgb(0_0_0/0.35)]"
          : "h-8 w-[280px] max-w-full min-w-0 shrink rounded-lg px-3 text-sm"
      }`}
    >
      <Search className={large ? "size-[18px]" : "size-4"} />
      <span className="flex-1 truncate">{large ? "Search projects and actions" : "Search"}</span>
      <Kbd>{formatKeys("Ctrl K")}</Kbd>
    </button>
  )
}

/** Opening what's already there: a folder, a project file, or a repository to clone. */
export function OpenMenu() {
  const actions = useStartActions()
  const clone = () => notReady("Cloning isn't ready yet", "For now, clone the repository yourself and open its folder.")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline">
            <FolderOpen /> Open <ChevronDown className="opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={actions.openFolder}>
          <FolderOpen /> Open a folder <DropdownMenuShortcut>{formatKeys("Ctrl O")}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={actions.openFile}>
          <FileInput /> Open a project file <DropdownMenuShortcut>{formatKeys("Ctrl Shift O")}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={clone}>
          <GitHubMark /> Clone from GitHub
        </DropdownMenuItem>
        <DropdownMenuItem onClick={clone}>
          <AzureDevOpsMark /> Clone from Azure DevOps
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function NewProjectButton() {
  const actions = useStartActions()
  return (
    <Button onClick={() => newProjectNotReady(actions)}>
      <Plus /> New project
    </Button>
  )
}

/**
 * You, at the top of Home, in place of an organization switcher (your call, 2026-11-05): your picture, your name and
 * where you're working, the organization or Personal in none. Its menu switches between the organizations Parity knows
 * you're in, which main does with a refresh in the background, then Settings and Sign out. Every project on this
 * computer shows either way, since Parity can't tell which organization a folder belongs to. Personal is always listed:
 * it's where you are in no organization, and later an organization of your own. Making that one, New organization and
 * Invite people wait for Parity's service (PAR-616). Signed out it's Sign in, so nothing looks signed in.
 */
export function HomeAccountMenu() {
  const { loaded, state } = useAccount()
  const { account } = state
  if (!loaded) return <span className="h-10" />
  if (!account) {
    return (
      <Button variant="ghost" className="-ml-2.5 gap-2" onClick={accountActions.open}>
        <NobodyAvatar size={22} /> Sign in
      </Button>
    )
  }
  const current = currentOrganization(account)
  const organizations = knownOrganizations(account)
  const notYet = () => notReady("Organizations aren't ready yet", "Parity can't make one or invite people yet.")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="-ml-2 flex max-w-72 min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted/50"
          >
            <PersonAvatar person={account} size={32} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm leading-tight font-medium">{account.name ?? account.email}</span>
              <span className="truncate text-xs leading-tight text-muted-foreground">
                {current?.name ?? "Personal"}
              </span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col py-2 font-normal">
            <span className="truncate text-sm font-medium text-foreground">{account.name ?? account.email}</span>
            {account.name && <span className="truncate text-xs text-muted-foreground">{account.email}</span>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Switch to</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={current?.id ?? "personal"}
            onValueChange={(id: string) => {
              if (id === (current?.id ?? "personal")) return
              // Personal is one more organization, just yours, which Parity's service makes (PAR-616). A session
              // can't leave an organization, so until then there's no Personal to switch to.
              if (id === "personal") {
                notReady(
                  "Personal isn't ready yet",
                  "It needs an organization of your own, which Parity can't make yet."
                )
                return
              }
              accountActions.switchOrganization(id)
            }}
          >
            <DropdownMenuRadioItem value="personal">
              <OrganizationBadge size={20} /> Personal
              <span className="ml-auto pl-2 text-xs text-muted-foreground">Just you</span>
            </DropdownMenuRadioItem>
            {organizations.map((organization) => (
              <DropdownMenuRadioItem key={organization.id} value={organization.id}>
                <OrganizationBadge organization={organization} size={20} />
                <span className="min-w-0 truncate">{organization.name}</span>
                {organization.id === current?.id && account.role && (
                  <span className="ml-auto pl-2 text-xs text-muted-foreground capitalize">
                    {account.role.replaceAll(/[-_]+/g, " ")}
                  </span>
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {/* Inviting needs an organization to invite people to. */}
          {current && (
            <DropdownMenuItem onClick={notYet}>
              <UserPlus /> Invite people
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={notYet}>
            <Plus /> New organization
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {account.untilQuit && (
          <DropdownMenuItem
            onClick={() => accountActions.explainUntilQuit(true)}
            className="text-xs text-muted-foreground"
          >
            <KeyRound /> Signed in until you quit Parity
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => void actions.settings.run()}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={accountActions.signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
