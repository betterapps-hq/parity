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
  Kbd,
  Spinner
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, ChevronsUpDown, FileInput, FolderOpen, Plus, Search } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { accountActions, useAccount } from "../account/account.ts"
import { currentOrganization, knownOrganizations, OrganizationBadge } from "../account/OrganizationBadge.tsx"
import { NobodyAvatar } from "../account/PersonAvatar.tsx"
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
    if (takeFocus) {
      button.current?.focus({ preventScroll: true })
    }
  }, [takeFocus])

  return (
    <button
      ref={button}
      type="button"
      onClick={actions.search}
      className={`flex items-center gap-2.5 border bg-card/60 text-left text-muted-foreground outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring ${
        large
          ? "h-12 w-full rounded-xl px-4 text-base shadow-[0_8px_30px_-12px_rgb(0_0_0/0.35)]"
          : "h-8 w-[280px] max-w-full min-w-0 shrink rounded-lg px-3 text-sm max-sm:w-full"
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

/** A leading slot as wide as an organization's badge, so every label in the menu starts at the same place. */
function Lead({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="grid size-5 shrink-0 place-items-center">
      {children}
    </span>
  )
}

/**
 * Where you're working, at the top left of Home (PAR-669): the organization you're in, or Personal in none, in the
 * account you're in. Its menu switches between the organizations Parity knows you're in, which main does with a refresh
 * in the background, and with several accounts it says whose they are. Every project on this computer shows either
 * way, since Parity can't tell which organization a folder belongs to. Personal is always listed: it's where you are in
 * no organization, and later an organization of your own. Making that one and New organization wait for Parity's
 * service (PAR-616). Your accounts, and signing out, are at the end of the title bar; Settings stay in the app's menu.
 * Signed out it's Sign in, so nothing looks signed in.
 */
export function WorkspaceMenu() {
  const { loaded, state } = useAccount()
  const { account, accounts } = state
  // The organization a switch is moving to, while main refreshes.
  const [switching, setSwitching] = useState<string>()
  const [said, setSaid] = useState("")

  if (!loaded) {
    return <span className="h-10" />
  }

  if (!account) {
    return (
      <Button variant="ghost" className="-ml-2.5 gap-2" onClick={accountActions.open}>
        <NobodyAvatar size={22} /> Sign in
      </Button>
    )
  }

  const current = currentOrganization(account)
  const organizations = knownOrganizations(account)

  const switchTo = (id: string) => {
    if (id === (current?.id ?? "personal")) {
      return
    }

    // Personal is one more organization, just yours, which Parity's service makes (PAR-616). A session can't leave an
    // organization, so until then there's no Personal to switch to.
    if (id === "personal") {
      notReady("Personal isn't ready yet", "It needs an organization of your own, which Parity can't make yet.")

      return
    }

    const name = organizations.find((organization) => organization.id === id)?.name ?? "your organization"
    setSwitching(name)
    setSaid(`Switching to ${name}`)
    void accountActions.switchOrganization(id).finally(() => {
      setSwitching(undefined)
      setSaid("")
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
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
            {/* Whose workspaces these are, once there's more than one account to tell apart. */}
            {accounts.length > 1 && (
              <DropdownMenuLabel className="truncate text-xs text-muted-foreground">{account.email}</DropdownMenuLabel>
            )}
            <DropdownMenuRadioGroup value={current?.id ?? "personal"} onValueChange={switchTo}>
              <DropdownMenuRadioItem value="personal" closeOnClick>
                <OrganizationBadge size={20} /> Personal
              </DropdownMenuRadioItem>
              {organizations.map((organization) => (
                <DropdownMenuRadioItem key={organization.id} value={organization.id} closeOnClick>
                  <OrganizationBadge organization={organization} size={20} />
                  <span className="min-w-0 truncate">{organization.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuItem
              onClick={() => notReady("Organizations aren't ready yet", "Parity can't make one or invite people yet.")}
            >
              <Lead>
                <Plus />
              </Lead>
              New organization
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <output className="sr-only">{said}</output>
    </>
  )
}
