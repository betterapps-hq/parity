import type { Meta, StoryObj } from "@storybook/react-vite"
import { accountActions } from "./account.ts"
import { Screen, Seeded, own, signedInTo, signedOut, url } from "./sign-in-stories.tsx"
import { SignInDialog } from "./SignIn.tsx"
import { WaitingPanel } from "./SignInPanels.tsx"

/** Signing in (PAR-612): the ways in, waiting for the browser, choosing an organization, and adding another account (PAR-669). */
const meta = {
  title: "Parity/Sign in/Signing in",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

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

/** Sign in from the title bar or Home: the same screen in a dialog, without the way to skip it. */
export const SignInDialogOverHome: Story = {
  render: () => (
    <Seeded state={signedOut} dialog>
      <SignInDialog />
    </Seeded>
  )
}

/** Add another account, from the panel: the ways in, and the account you're in stays signed in. */
export const AddAnotherAccount: Story = {
  render: () => (
    <Seeded state={signedInTo([own])} dialog>
      <SignInDialog />
    </Seeded>
  )
}
