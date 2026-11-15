import type { Meta, StoryObj } from "@storybook/react-vite"
import type { AccountState } from "../../shared/account.ts"
import { Screen, Seeded, ada, own, signedInTo, signedOut, work } from "./sign-in-stories.tsx"
import { SignInDialog } from "./SignIn.tsx"

/** Sign-in that ends without a session (PAR-612): each problem, and a session WorkOS ended (PAR-669). */
const meta = {
  title: "Parity/Sign in/Problems",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

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

/** WorkOS refused a refresh. Who it was, one button to sign in again the same way, and nothing open changes. */
export const SessionEnded: Story = {
  render: () => (
    <Seeded state={{ ...signedOut, ended: { person: ada, provider: "GoogleOAuth" } }}>
      <SignInDialog />
    </Seeded>
  )
}

/** The session of the account you're in ended, so you're in your other one for now. */
export const SessionEndedInAnotherAccount: Story = {
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
