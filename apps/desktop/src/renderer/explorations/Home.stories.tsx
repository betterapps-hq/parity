import type { Meta, StoryObj } from "@storybook/react-vite"
import { openProjects } from "../stories/fixtures.tsx"
import { workspace } from "../workspace.ts"
import { HomePrototype } from "./home/prototype.tsx"

/**
 * Home and the new tab page with organizations (PAR-612, PAR-616), built on the start page's own pieces: its layout,
 * search, Open, New project, Continue and project cards with the example project's real screens. What this adds:
 *
 * - The workspace menu at the top left switches between Personal and your organizations with a refresh in the
 *   background, so nothing open closes. Personal is just you; every project on this computer shows in each.
 * - Your accounts, from your picture at the end of the title bar where the app has it: each with its own Sign out,
 *   then Add another account.
 * - For you lists what needs you in every organization you're in, and invitations to the ones you're not.
 * - People in an organization: invite by email, change roles, remove people, and the invitations still waiting. A
 *   large one is searched and loads as it scrolls, and where a directory adds and removes people, only roles change.
 *   It waits for organization settings: no menu opens it yet, so its stories start with it open.
 * - New organization: its name, then the people to invite, which can wait.
 * - Several accounts (PAR-669), such as your own and your company's: the account menu lists them, the one you're in
 *   checked and the others saying where they open, and signs out of the one you're in. For you covers every account,
 *   and names the organization a note is from when it isn't where you are.
 *
 * Each story is the same working prototype, started at a different point, in the whole window: the title bar over the
 * page.
 */
const meta = {
  title: "Parity/Explorations/Home",
  parameters: { layout: "fullscreen" },
  // No project tabs, so the title bar has Home and whatever the story opens.
  loaders: [() => openProjects()]
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** In Kestrel, where you're an admin: Maya mentioned you, Sam wants a review, Lena replied. */
export const HomeInAnOrganization: Story = { render: () => <HomePrototype /> }

/** In Personal: the same projects, and nothing needs you, since nobody else is in it. */
export const HomeInPersonal: Story = { render: () => <HomePrototype workspace="personal" /> }

/** In Kestrel with your work account signed in too: For you covers both, and says when a note is from Contoso. */
export const HomeWithTwoAccounts: Story = { render: () => <HomePrototype twoAccounts /> }

/** Where you work, at the top left: Personal, Kestrel and Halcyon Labs, and New organization. */
export const WorkspaceMenu: Story = { render: () => <HomePrototype menuOpen="workspaces" /> }

/** Your account, from your picture at the end of the title bar: your name and email, Sign out, Add another account. */
export const AccountMenu: Story = { render: () => <HomePrototype menuOpen="accounts" /> }

/**
 * Your own account, shaded since you're in it, and your work one, which says where it opens: where you were last in it.
 * Choosing it switches; each has its own Sign out, so either can go without switching to it first.
 */
export const AccountMenuWithTwoAccounts: Story = { render: () => <HomePrototype twoAccounts menuOpen="accounts" /> }

/**
 * Contoso's policy ended your work account's session. It keeps its row, dimmed: choosing it signs in again, and Remove
 * forgets it. For you says so in place of its notes; you stay where you are.
 */
export const WorkAccountSessionEnded: Story = { render: () => <HomePrototype workEnded menuOpen="accounts" /> }

/**
 * Adding another account: the ways in, then the browser. Microsoft or a work email brings back your Contoso account;
 * Google or GitHub a Gmail one.
 */
export const AddAnotherAccount: Story = { render: () => <HomePrototype dialog="add-account" /> }

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
export const NewTab: Story = {
  loaders: [
    async () => {
      await openProjects()
      workspace.newTab()
    }
  ],
  render: () => <HomePrototype page="new-tab" />
}

/** Kestrel's people, with the invite field ready. */
export const People: Story = { render: () => <HomePrototype dialog="people" /> }

/** The invitations Kestrel has sent that nobody has taken up yet, one of them expired. */
export const PeopleInvitations: Story = { render: () => <HomePrototype dialog="invitations" /> }

/** Halcyon Labs' people, where you're a member: no inviting, and roles you can read but not change. */
export const PeopleAsAMember: Story = { render: () => <HomePrototype workspace="halcyon" dialog="people" /> }

/**
 * Contoso's 1,201 people, in your work account, which Microsoft Entra ID adds and removes: no inviting, removing or
 * leaving here, only roles. You and the admins come first, search finds anyone by name or email, and the list loads as
 * it scrolls.
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
