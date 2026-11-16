import { Button, Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { KeyRound, Plus } from "lucide-react"
import { useRef, useState } from "react"
import type { SignedInAccount } from "../../shared/account.ts"
import { Name } from "../chrome/Name.tsx"
import { accountActions, useAccount, workspaceOf } from "./account.ts"
import { NobodyAvatar, PersonAvatar } from "./PersonAvatar.tsx"

/** An email that, when it's cut short, keeps its domain: the part that tells your accounts apart. */
function Email({ address }: { address: string }) {
  const at = address.lastIndexOf("@")

  if (at < 0) {
    return <span className="min-w-0 truncate">{address}</span>
  }

  return (
    <span className="flex min-w-0">
      <span className="min-w-0 truncate">{address.slice(0, at)}</span>
      <span className="shrink-0">{address.slice(at)}</span>
    </span>
  )
}

/**
 * Your accounts, from your picture at the end of the title bar (PAR-669). Each account is a row with its own Sign out,
 * so any of them can go without switching to it first. With one account that's your name, your email and Sign out.
 * With several, each row names its account by email and says where it opens; the one you're in is shaded, and choosing
 * another switches to it at once. An account whose session ended is dimmed: choosing it signs in again, and Remove
 * forgets it. Add another account is last. Settings stay in the app's menu, and where someone's organization is, Home's
 * workspace menu says. Signed out, the picture's an outline and the panel offers Sign in.
 *
 * It's a panel rather than a menu, since each row holds two actions. It opens with nothing chosen, so Enter can't sign
 * you out by accident; Tab moves through the rows.
 */
export function AccountMenu() {
  const { loaded, state } = useAccount()
  const { account, accounts } = state
  const [open, setOpen] = useState(false)
  const list = useRef<HTMLDivElement>(null)

  if (!loaded) {
    return <span className="mb-1.5 ml-auto size-6 shrink-0" />
  }

  const several = accounts.length > 1

  // Each action closes the panel first, so the keyboard goes back to your picture before anything moves.
  const then = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  let label = "Sign in"

  if (account) {
    label = `Your accounts, signed in as ${account.email}`
  } else if (accounts.length > 0) {
    label = "Your accounts, not signed in"
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="mb-1.5 ml-auto shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring [-webkit-app-region:no-drag]"
          >
            {account ? <PersonAvatar person={account} size={24} /> : <NobodyAvatar size={24} />}
          </button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={6}
        initialFocus={list}
        aria-label={accounts.length > 0 ? "Your accounts" : "Not signed in"}
        className="w-[22rem] max-w-[calc(100vw-2rem)] gap-0 p-1.5"
      >
        <div ref={list} tabIndex={-1} className="flex flex-col gap-0.5 outline-none">
          {accounts.length > 0 ? (
            <>
              <ul className="flex flex-col gap-0.5">
                {accounts.map((each) => (
                  <AccountRow
                    key={each.email}
                    account={each}
                    here={each.email === account?.email}
                    several={several}
                    then={then}
                  />
                ))}
              </ul>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                onClick={then(accountActions.open)}
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
              {account?.untilQuit && (
                <button
                  type="button"
                  onClick={then(() => accountActions.explainUntilQuit(true))}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground outline-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden className="grid w-8 shrink-0 place-items-center">
                    <KeyRound className="size-3.5" />
                  </span>
                  Signed in until you quit Parity
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3 px-2 py-2">
              <NobodyAvatar size={32} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">Not signed in</span>
                <span className="truncate text-xs text-muted-foreground">Projects on this computer still work</span>
              </span>
              <Button size="sm" onClick={then(accountActions.open)}>
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
 * One account in the panel: who, and where it opens or that its session ended, then Sign out, or Remove once it ended.
 * The account you're in is a row to read; another switches to it, or signs in again.
 */
function AccountRow({
  account,
  here,
  several,
  then
}: {
  account: SignedInAccount
  here: boolean
  several: boolean
  then: (action: () => void) => () => void
}) {
  const { email, ended } = account
  // With one account the row is your name and email; with several, the email and where it opens.
  let detail = email

  if (several) {
    detail = ended ? "Session ended" : workspaceOf(account)
  }

  // The account you're in is shaded once there's another to tell it from.
  let shade = "hover:bg-accent/60"

  if (here) {
    shade = several ? "bg-accent" : ""
  }

  const who = (
    <>
      <span className={ended ? "opacity-50" : ""}>
        <PersonAvatar person={account} size={32} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 text-sm font-medium">
          {several ? <Email address={email} /> : <Name>{account.name ?? email}</Name>}
        </span>
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
      </span>
    </>
  )

  return (
    <li
      aria-current={here && several ? "true" : undefined}
      className={`flex items-center gap-1 rounded-md pr-1.5 ${shade}`}
    >
      {here ? (
        <span className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2">{who}</span>
      ) : (
        <button
          type="button"
          aria-label={ended ? `Sign in again as ${email}` : `Switch to ${email}, ${workspaceOf(account)}`}
          onClick={then(() => (ended ? accountActions.signInAgain(account) : accountActions.use(email)))}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {who}
        </button>
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-label={`${ended ? "Remove" : "Sign out of"} ${email}`}
        onClick={then(() => accountActions.signOut(email))}
        className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
      >
        {ended ? "Remove" : "Sign out"}
      </Button>
    </li>
  )
}
