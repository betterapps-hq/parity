import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Kbd
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, ChevronsUpDown, FileInput, FolderOpen, Plus, Search, UserPlus } from "lucide-react"
import { useAccount } from "../account/account.ts"
import { formatKeys } from "../chrome/keys.ts"
import { AzureDevOpsMark, GitHubMark } from "./marks.tsx"
import { newProjectNotReady, notReady, useStartActions } from "./start-actions.ts"

/** Looks like a field and opens search, which finds your projects and every action. */
export function SearchButton({ large }: { large?: boolean }) {
  const actions = useStartActions()
  return (
    <button
      type="button"
      onClick={actions.search}
      className={`flex items-center gap-2.5 border bg-card/60 text-left text-muted-foreground outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring ${
        large
          ? "h-12 w-full rounded-xl px-4 text-[15px] shadow-[0_8px_30px_-12px_rgb(0_0_0/0.35)]"
          : "h-9 w-[280px] max-w-full min-w-0 shrink rounded-lg px-3 text-sm"
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

/** The organization signed in to, by the name Parity can give it until its service can look one up (PAR-616). */
const sessionOrganization = "Your organization"

/**
 * Whose projects the page shows: the organization you're signed in to, or Personal in no organization yet. Every
 * project on this computer shows either way, since Parity can't tell which organization a folder belongs to. Signed
 * out there's none, so it doesn't look like you're signed in (your call, 2026-11-05); the account menu and For you offer
 * Sign in. The menu offers inviting people and making an organization, which aren't ready.
 */
export function OrgSwitcher() {
  const { state } = useAccount()
  const { account } = state
  const organization = account?.organizationId ? sessionOrganization : undefined
  const notYet = () =>
    notReady("Organizations aren't ready yet", "For now, your projects are the ones on this computer.")
  if (!account) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="-ml-1.5 flex w-fit items-center gap-2 rounded-lg px-1.5 py-1 text-sm outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted/50"
          >
            <OrgBadge name={organization ?? "Personal"} />
            <span className="font-medium">{organization ?? "Personal"}</span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuRadioGroup value={organization ? "organization" : "personal"} onValueChange={notYet}>
          {organization && (
            <DropdownMenuRadioItem value="organization">
              <OrgBadge name={organization} size={18} /> {organization}
            </DropdownMenuRadioItem>
          )}
          <DropdownMenuRadioItem value="personal">
            <OrgBadge name="Personal" size={18} /> Personal
            <span className="ml-auto text-xs text-muted-foreground">Just you</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {/* Inviting needs an organization to invite people to. */}
        {organization && (
          <DropdownMenuItem onClick={notYet}>
            <UserPlus /> Invite people
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={notYet}>
          <Plus /> New organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** An organization's first letter in its color: Personal's green, and an organization's violet. */
function OrgBadge({ name, size = 20 }: { name: string; size?: number }) {
  const hue = name === "Personal" ? 162 : 275
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-md font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.55,
        background: `oklch(0.45 0.1 ${hue})`,
        color: `oklch(0.95 0.04 ${hue})`
      }}
    >
      {name.charAt(0)}
    </span>
  )
}
