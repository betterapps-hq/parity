import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import type { AccountState } from "../../shared/account.ts"
import { AccountMenu } from "./AccountMenu.tsx"
import { Seeded, own, signedInTo, signedOut, work } from "./sign-in-stories.tsx"
import { SignInDialog, UntilQuitDialog } from "./SignIn.tsx"

/** The account menu at the end of the title bar (PAR-669): who's signed in, switching accounts, and signing out. */
const meta = {
  title: "Parity/Sign in/Account menu",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

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
export const SignedIn: Story = { render: () => <TitleBar state={signedInTo([own])} />, play: openPanel }

/**
 * Your own account and your work one: each by email, with where it opens. The one you're in is shaded; choosing the
 * other switches at once, and each has its own Sign out.
 */
export const TwoAccounts: Story = {
  render: () => <TitleBar state={signedInTo([own, work])} />,
  play: openPanel
}

/** Your work account's session ended: dimmed, choosing it signs in again, and Remove forgets it. */
export const SessionEnded: Story = {
  render: () => <TitleBar state={signedInTo([own, { ...work, ended: true }])} />,
  play: openPanel
}

/** In no organization yet: the email says which account it is. */
export const NoOrganization: Story = {
  render: () => <TitleBar state={signedInTo([{ email: "ada@hey.com", provider: "GitHubOAuth" }])} />,
  play: openPanel
}

/** Signed in on a system with no keyring, where Parity keeps accounts only until it quits. */
export const UntilQuit: Story = {
  render: () => <TitleBar state={signedInTo([own], true)} />,
  play: openPanel
}

/** Signed out: an outline of an avatar, whose panel offers Sign in. */
export const SignedOut: Story = { render: () => <TitleBar state={signedOut} />, play: openPanel }
