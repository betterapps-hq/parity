import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { KeyRound, LogIn, LogOut, Settings } from "lucide-react"
import type { AccountState } from "../../shared/account.ts"
import { actions } from "../chrome/actions.ts"
import { accountActions, useAccount } from "./account.ts"
import { NobodyAvatar, PersonAvatar } from "./PersonAvatar.tsx"

type SignedIn = NonNullable<AccountState["account"]>

/**
 * Where the person belongs, under their name: their organization and role, as "Your organization, billing admin", or,
 * in no organization yet, their email, which says which account it is. WorkOS's token names the organization only by
 * its ID until Parity's service can look it up (PAR-616).
 */
function belongsTo(account: SignedIn): string {
  if (!account.organizationId) return account.email
  return account.role ? `Your organization, ${account.role.replaceAll(/[-_]+/g, " ")}` : "Your organization"
}

/**
 * Your account, at the end of the title bar: who you are and where, Settings, and Sign out. Signed out, the avatar's
 * an outline, and the menu offers Sign in in your name's place and keeps Settings, which needs no account. Keyboard
 * shortcuts and their keys stay in the app's menus (your call, 2026-11-05).
 */
export function AccountMenu() {
  const { loaded, state } = useAccount()
  const { account } = state
  if (!loaded) return <span className="mb-1.5 ml-auto size-6 shrink-0" />
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={account ? "Your account" : "Sign in and settings"}
            className="mb-1.5 ml-auto shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring [-webkit-app-region:no-drag]"
          >
            {account ? <PersonAvatar person={account} size={24} /> : <NobodyAvatar size={24} />}
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        {account ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2.5 py-2 font-normal">
              <PersonAvatar person={account} size={28} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{account.name ?? account.email}</span>
                <span className="truncate text-xs text-muted-foreground">{belongsTo(account)}</span>
              </span>
            </DropdownMenuLabel>
            {account.untilQuit && (
              <DropdownMenuItem
                onClick={() => accountActions.explainUntilQuit(true)}
                className="text-xs text-muted-foreground"
              >
                <KeyRound /> Signed in until you quit Parity
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2.5 py-2 font-normal">
              <NobodyAvatar size={28} />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-foreground">Not signed in</span>
                <span className="text-xs text-muted-foreground">Projects on this computer still work</span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={accountActions.open}>
              <LogIn /> Sign in
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void actions.settings.run()}>
          <Settings /> Settings
        </DropdownMenuItem>
        {account && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={accountActions.signOut}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
