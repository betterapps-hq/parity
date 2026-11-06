import type { Meta, StoryObj } from "@storybook/react-vite"
import { HomePrototype } from "./home/prototype.tsx"

/**
 * Home and the new tab page with organizations (PAR-612, PAR-616), built on the start page's own pieces: its layout,
 * search, Open, New project, Continue and project cards with the example project's real screens. What this adds:
 *
 * - The account menu at the top left switches between Personal and your organizations with a refresh in the
 *   background, so nothing open closes. Personal is just you; every project on this computer shows in each.
 * - For you lists what needs you in every organization you're in, and invitations to the ones you're not.
 * - People in an organization: invite by email, change roles, remove people, and the invitations still waiting. A
 *   large one is searched and loads as it scrolls, and where a directory adds and removes people, only roles change.
 * - New organization: its name, then the people to invite, which can wait.
 *
 * Each story is the same working prototype, started at a different point.
 */
const meta = {
  title: "Parity/Explorations/Home",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** In Kestrel, where you're an admin: Maya mentioned you, Sam wants a review, Lena replied. */
export const HomeInAnOrganization: Story = { render: () => <HomePrototype /> }

/** In Personal: the same projects, and nothing needs you, since nobody else is in it. */
export const HomeInPersonal: Story = { render: () => <HomePrototype workspace="personal" /> }

/** The account menu: Personal and two organizations with your role in each, People and New organization. */
export const AccountMenu: Story = { render: () => <HomePrototype menuOpen /> }

/** Invited to Northwind Studio: Join moves you into it, Decline can be undone. */
export const Invited: Story = { render: () => <HomePrototype invitation="waiting" /> }

/** An invitation that ran out: ask whoever sent it for a new one. */
export const InvitationExpired: Story = { render: () => <HomePrototype invitation="expired" /> }

/** Signed in for the first time: no projects yet, no organization, and an invitation waiting. */
export const NewAccount: Story = { render: () => <HomePrototype newAccount /> }

/** Signed out: projects on this computer still open; the account menu and For you offer Sign in. */
export const SignedOut: Story = { render: () => <HomePrototype signedOut /> }

/** Before Parity knows who's signed in: the account menu and For you hold their shape. */
export const Loading: Story = { render: () => <HomePrototype loading /> }

/** A new tab, as the start page has it: search first, New project and Open, then your projects. */
export const NewTab: Story = { render: () => <HomePrototype page="new-tab" /> }

/** Kestrel's people, with the invite field ready. */
export const People: Story = { render: () => <HomePrototype dialog="people" /> }

/** The invitations Kestrel has sent that nobody has taken up yet, one of them expired. */
export const PeopleInvitations: Story = { render: () => <HomePrototype dialog="invitations" /> }

/** Halcyon Labs' people, where you're a member: no inviting, and roles you can read but not change. */
export const PeopleAsAMember: Story = { render: () => <HomePrototype workspace="halcyon" dialog="people" /> }

/**
 * Contoso's 1,201 people, which Microsoft Entra ID adds and removes: no inviting, removing or leaving here, only roles.
 * You and the admins come first, search finds anyone by name or email, and the list loads as it scrolls.
 */
export const PeopleInALargeOrganization: Story = {
  render: () => <HomePrototype workspace="contoso" dialog="people" />
}

/** Searching Contoso's people: 40 match “patel”. */
export const PeopleSearching: Story = {
  render: () => <HomePrototype workspace="contoso" dialog="people" search="patel" />
}

/** A new organization, from Personal: its name first. */
export const NewOrganization: Story = { render: () => <HomePrototype workspace="personal" dialog="new-organization" /> }

/** Northwind, just made: invite your team now, or skip it. */
export const NewOrganizationInvite: Story = { render: () => <HomePrototype dialog="invite-step" /> }
