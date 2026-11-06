import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ReactNode, useLayoutEffect } from "react"
import { userEvent, within } from "storybook/test"
import type { AccountState } from "../../shared/account.ts"
import { setStoryAccount } from "../stories/host.ts"
import { accountActions, useAccount } from "./account.ts"
import { AccountMenu } from "./AccountMenu.tsx"
import { SignInDialog, SignInScreen, UntilQuitDialog } from "./SignIn.tsx"

/**
 * Signing in, as the app builds it from the Sign in explorations (PAR-612). The host stands in for main: a button
 * waits for a browser that never hands back, and Cancel and Sign out do what they say.
 */
const meta = {
  title: "Parity/Sign in",
  parameters: { layout: "fullscreen" }
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

const ada = { email: "ada@kestrel.dev", name: "Ada Lovelace" }
const signedOut: AccountState = { account: null, attempt: null, ended: null }
const url = "https://api.workos.com/user_management/authorize?client_id=client_story"

/** Says who's signed in as the story mounts, as main would, after the preview has put the last story's back. */
function Seeded({ state, dialog, children }: { state: AccountState; dialog?: boolean; children: ReactNode }) {
  useLayoutEffect(() => {
    setStoryAccount(state)
    if (dialog) accountActions.open()
  }, [state, dialog])
  return children
}

/** The window below its title bar, showing the sign-in screen as the first launch does. */
function Screen({ state }: { state: AccountState }) {
  const { state: shown } = useAccount()
  return (
    <Seeded state={state}>
      <div className="flex h-screen min-h-[600px] flex-col bg-background text-foreground">
        <SignInScreen state={shown} />
      </div>
    </Seeded>
  )
}

/** The first launch: the ways in, and going on without signing in. */
export const FirstLaunch: Story = { render: () => <Screen state={signedOut} /> }

/** After a button: Parity waits for the browser, and never gives up on its own. */
export const WaitingForBrowser: Story = {
  render: () => <Screen state={{ ...signedOut, attempt: { at: "waiting", provider: "GitHubOAuth", url } }} />
}

/** Canceled at the provider or on AuthKit's page. */
export const CanceledInBrowser: Story = {
  render: () => (
    <Screen state={{ ...signedOut, attempt: { at: "problem", provider: "GoogleOAuth", problem: "canceled" } }} />
  )
}

const failed: AccountState = {
  ...signedOut,
  attempt: {
    at: "problem",
    provider: "MicrosoftOAuth",
    problem: "failed",
    details: "POST /user_management/authenticate\n400 invalid_grant\nThe code has expired or was already used."
  }
}

/** An error handed back, or from trading the code, with what WorkOS said to copy. */
export const CouldNotSignIn: Story = { render: () => <Screen state={failed} /> }

const refused: AccountState = {
  ...signedOut,
  attempt: {
    at: "problem",
    provider: "GoogleOAuth",
    problem: "refused",
    email: "ada@hey.com",
    details: "POST /user_management/authenticate\n403 user_not_allowed\nThis account isn't allowed to sign in."
  }
}

/** WorkOS turned the account down. */
export const AccountRefused: Story = { render: () => <Screen state={refused} /> }

/** The account's organization requires its single sign-on. */
export const SingleSignOnRequired: Story = {
  render: () => (
    <Screen
      state={{
        ...signedOut,
        attempt: { at: "problem", provider: "GitHubOAuth", problem: "single-sign-on", email: "ada@kestrel.dev" }
      }}
    />
  )
}

/** Sign in from the title bar or Home: the same screen in a dialog, without the way to skip it. */
export const SignInDialogOverHome: Story = {
  render: () => (
    <Seeded state={signedOut} dialog>
      <SignInDialog />
    </Seeded>
  )
}

/** WorkOS refused a refresh. Who it was, one button to sign in again the same way, and nothing open changes. */
export const SessionEnded: Story = {
  render: () => (
    <Seeded state={{ ...signedOut, ended: { person: ada, provider: "GoogleOAuth" } }}>
      <SignInDialog />
    </Seeded>
  )
}

/** The end of the title bar, where the account menu sits. */
function TitleBar({ state }: { state: AccountState }) {
  return (
    <Seeded state={state}>
      <div className="flex h-screen flex-col bg-background">
        <div className="flex h-10 items-end border-b bg-neutral-100 px-4 dark:bg-[#0a0a0a]">
          <AccountMenu />
        </div>
        <SignInDialog />
        <UntilQuitDialog />
      </div>
    </Seeded>
  )
}

const openMenu = async () => {
  const body = within(document.body)
  await userEvent.click(await body.findByRole("button", { name: /^(Your account|Sign in and settings)$/ }))
}

/** Signed in: who you are, your organization and role, Settings, and Sign out. */
export const AccountMenuSignedIn: Story = {
  render: () => (
    <TitleBar
      state={{ ...signedOut, account: { ...ada, organizationId: "org_01KESTREL", role: "admin", untilQuit: false } }}
    />
  ),
  play: openMenu
}

/** In no organization yet: the email says which account it is. */
export const AccountMenuNoOrganization: Story = {
  render: () => <TitleBar state={{ ...signedOut, account: { email: "ada@hey.com", untilQuit: false } }} />,
  play: openMenu
}

/** Signed in on a system with no keyring, where Parity keeps the session only until it quits. */
export const AccountMenuUntilQuit: Story = {
  render: () => <TitleBar state={{ ...signedOut, account: { ...ada, untilQuit: true } }} />,
  play: openMenu
}

/** Signed out: an outline of an avatar, whose menu offers Sign in and keeps Settings. */
export const AccountMenuSignedOut: Story = { render: () => <TitleBar state={signedOut} />, play: openMenu }
