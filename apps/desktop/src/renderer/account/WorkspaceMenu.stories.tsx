import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import type { AccountState } from "../../shared/account.ts"
import { WorkspaceMenu } from "../start/StartControls.tsx"
import { Seeded, ada, kestrel, own, signedInTo, signedOut, work } from "./sign-in-stories.tsx"
import { SignInDialog, UntilQuitDialog } from "./SignIn.tsx"

/** The workspace menu at the top of Home (PAR-669): the organization you're working in, and switching to another. */
const meta = {
  title: "Parity/Sign in/Workspace menu",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

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
export const TwoOrganizations: Story = {
  render: () => <HomeHeader state={signedInTo([own])} />,
  play: openHomeMenu
}

/** Signed in to two accounts: the menu says whose organizations these are. */
export const TwoAccounts: Story = {
  render: () => <HomeHeader state={signedInTo([own, work])} />,
  play: openHomeMenu
}

/** In one organization, which WorkOS picked without naming it, so Parity calls it Your organization. */
export const OneOrganization: Story = {
  render: () => (
    <HomeHeader state={signedInTo([{ ...ada, organizationId: kestrel.id, role: "member", provider: "GoogleOAuth" }])} />
  ),
  play: openHomeMenu
}

/** In no organization: Personal. */
export const Personal: Story = {
  render: () => <HomeHeader state={signedInTo([{ email: "ada@hey.com", provider: "GitHubOAuth" }])} />,
  play: openHomeMenu
}

/** Signed out: Sign in, so nothing looks signed in. */
export const SignedOut: Story = { render: () => <HomeHeader state={signedOut} /> }
