import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ReactNode, useLayoutEffect } from "react"
import { userEvent, within } from "storybook/test"
import type { AccountState, SignedInAccount } from "../../shared/account.ts"
import { type HandBack, handBackHtml, handBackText } from "../../shared/hand-back-page.ts"
import { WorkspaceMenu } from "../start/StartControls.tsx"
import { setStoryAccount } from "../stories/host.ts"
import { useResolvedTheme } from "../theme.ts"
import { accountActions, useAccount } from "./account.ts"
import { AccountMenu } from "./AccountMenu.tsx"
import { SignInDialog, SignInScreen, UntilQuitDialog } from "./SignIn.tsx"
import { WaitingPanel } from "./SignInPanels.tsx"

/**
 * Signing in (PAR-612), several accounts (PAR-669), and the page the browser shows once it hands back (PAR-614). The
 * host stands in for main: a button waits for a browser that never hands back, and Cancel, switching accounts and Sign
 * out do what they say.
 */
const meta = {
  title: "Parity/Sign in",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const ada = { email: "ada@kestrel.dev", name: "Ada Lovelace" }
const signedOut: AccountState = { account: null, accounts: [], attempt: null, ended: null }
const url = "https://api.workos.com/user_management/authorize?client_id=client_story"

/** Says who's signed in as the story mounts, as main would, after the preview has put the last story's back. */
function Seeded({ state, dialog, children }: { state: AccountState; dialog?: boolean; children: ReactNode }) {
  useLayoutEffect(() => {
    setStoryAccount(state)

    if (dialog) {
      accountActions.open()
    }
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

/** Half a minute on: the page may never have shown, so opening it again comes first. */
export const StillWaitingForBrowser: Story = {
  render: () => (
    <div className="grid h-screen min-h-[600px] place-items-center bg-background p-6 text-foreground">
      <WaitingPanel
        attempt={{ at: "waiting", provider: "GitHubOAuth", url }}
        slow
        onReopen={accountActions.reopen}
        onCancel={accountActions.back}
      />
    </div>
  )
}

/** Someone in more than one organization: WorkOS names them, and AuthKit signs in to the one chosen. */
export const ChooseOrganization: Story = {
  render: () => (
    <Screen
      state={{
        ...signedOut,
        attempt: {
          at: "problem",
          provider: "GoogleOAuth",
          problem: "choose-organization",
          email: "ada@kestrel.dev",
          organizations: [
            { id: "org_01KESTREL", name: "Kestrel" },
            { id: "org_01ANALYTICAL", name: "Analytical Engines and Difference Machines Incorporated" }
          ]
        }
      }}
    />
  )
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

const kestrel = { id: "org_01KESTREL", name: "Kestrel" }
const engines = { id: "org_01ENGINES", name: "Analytical Engines" }
const contoso = { id: "org_01CONTOSO", name: "Contoso" }

const own: SignedInAccount = {
  ...ada,
  organizationId: kestrel.id,
  role: "admin",
  organizations: [kestrel, engines],
  provider: "GoogleOAuth"
}

const work: SignedInAccount = {
  email: "ada.lovelace@contoso.com",
  name: "Ada Lovelace",
  organizationId: contoso.id,
  role: "member",
  organizations: [contoso],
  provider: "MicrosoftOAuth"
}

/** Signed in to `accounts`, in the first whose session is still going, as main says it. */
function signedInTo(accounts: SignedInAccount[], untilQuit = false): AccountState {
  const here = accounts.find((each) => !each.ended)

  if (!here) {
    return { ...signedOut, accounts }
  }

  const { provider: _provider, ended: _ended, ...person } = here

  return { ...signedOut, account: { ...person, untilQuit }, accounts }
}

/** The end of the title bar, where your accounts are. */
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

const openPanel = async () => {
  const body = within(document.body)
  await userEvent.click(await body.findByRole("button", { name: /^(Your accounts|Sign in)/ }))
}

/** One account: your name and email, Sign out, and Add another account. */
export const AccountMenuSignedIn: Story = { render: () => <TitleBar state={signedInTo([own])} />, play: openPanel }

/**
 * Your own account and your work one: each by email, with where it opens. The one you're in is shaded; choosing the
 * other switches at once, and each has its own Sign out.
 */
export const AccountMenuTwoAccounts: Story = {
  render: () => <TitleBar state={signedInTo([own, work])} />,
  play: openPanel
}

/** Your work account's session ended: dimmed, choosing it signs in again, and Remove forgets it. */
export const AccountMenuSessionEnded: Story = {
  render: () => <TitleBar state={signedInTo([own, { ...work, ended: true }])} />,
  play: openPanel
}

/** In no organization yet: the email says which account it is. */
export const AccountMenuNoOrganization: Story = {
  render: () => <TitleBar state={signedInTo([{ email: "ada@hey.com", provider: "GitHubOAuth" }])} />,
  play: openPanel
}

/** Signed in on a system with no keyring, where Parity keeps accounts only until it quits. */
export const AccountMenuUntilQuit: Story = {
  render: () => <TitleBar state={signedInTo([own], true)} />,
  play: openPanel
}

/** Signed out: an outline of an avatar, whose panel offers Sign in. */
export const AccountMenuSignedOut: Story = { render: () => <TitleBar state={signedOut} />, play: openPanel }

/** Add another account, from the panel: the ways in, and the account you're in stays signed in. */
export const AddAnotherAccount: Story = {
  render: () => (
    <Seeded state={signedInTo([own])} dialog>
      <SignInDialog />
    </Seeded>
  )
}

/** The session of the account you're in ended, so you're in your other one for now. */
export const SessionEndedWithAnotherAccount: Story = {
  render: () => (
    <Seeded
      state={{
        ...signedInTo([own, { ...work, ended: true }]),
        ended: { person: { email: work.email, name: "Ada Lovelace" }, provider: "MicrosoftOAuth" }
      }}
    >
      <SignInDialog />
    </Seeded>
  )
}

/** The top of Home, where you're working takes the organization switcher's place. */
function HomeHeader({ state }: { state: AccountState }) {
  return (
    <Seeded state={state}>
      <div className="h-screen bg-background p-6 text-foreground sm:px-10">
        <WorkspaceMenu />
        <SignInDialog />
        <UntilQuitDialog />
      </div>
    </Seeded>
  )
}

const openHomeMenu = async () => {
  const body = within(document.body)
  await userEvent.click(await body.findByRole("button", { name: /^(Kestrel|Your organization|Personal)/ }))
}

/** In two organizations Parity knows by name: choosing the other one switches in the background. */
export const WorkspaceMenuTwoOrganizations: Story = {
  render: () => <HomeHeader state={signedInTo([own])} />,
  play: openHomeMenu
}

/** Signed in to two accounts: the menu says whose organizations these are. */
export const WorkspaceMenuTwoAccounts: Story = {
  render: () => <HomeHeader state={signedInTo([own, work])} />,
  play: openHomeMenu
}

/** In one organization, which WorkOS picked without naming it, so Parity calls it Your organization. */
export const WorkspaceMenuOneOrganization: Story = {
  render: () => (
    <HomeHeader state={signedInTo([{ ...ada, organizationId: kestrel.id, role: "member", provider: "GoogleOAuth" }])} />
  ),
  play: openHomeMenu
}

/** In no organization: Personal. */
export const WorkspaceMenuPersonal: Story = {
  render: () => <HomeHeader state={signedInTo([{ email: "ada@hey.com", provider: "GitHubOAuth" }])} />,
  play: openHomeMenu
}

/** Signed out: Sign in, so nothing looks signed in. */
export const WorkspaceMenuSignedOut: Story = { render: () => <HomeHeader state={signedOut} /> }

/** The browser tab once it hands back to a `pnpm dev` copy: the page its loopback serves, in the app's theme. */
function HandBackPage({ outcome }: { outcome: HandBack }) {
  const theme = useResolvedTheme()

  return (
    <iframe
      title={handBackText[outcome].title}
      className="block h-screen min-h-[560px] w-full border-0"
      srcDoc={handBackHtml(outcome, theme)}
    />
  )
}

/**
 * The browser after it has handed back to a `pnpm dev` copy, once the code is traded: plain HTML with no scripts, in
 * the system's light or dark. Installed apps hand back through `parity://`, and the browser shows its own prompt.
 */
export const BrowserAfterHandingBack: Story = { render: () => <HandBackPage outcome="signed-in" /> }

/** The same page when the code couldn't be traded: Parity's window says why, so the page only points there. */
export const BrowserAfterAProblem: Story = { render: () => <HandBackPage outcome="problem" /> }

/** Handed back with one more step in Parity: choosing an organization, or single sign-on. */
export const BrowserWithOneMoreStep: Story = { render: () => <HandBackPage outcome="continue" /> }
