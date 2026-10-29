import type { Meta, StoryObj } from "@storybook/react-vite"
import { Lock } from "lucide-react"
import { expect, userEvent, within } from "storybook/test"
import { pricingPins } from "./collab-data.ts"
import { LiveBoard } from "./live-board.tsx"
import { AccessRequest, BrowserBanner, CopyLinkMenu, LinkUnfurl, RequestAccess, ShareDialog } from "./sharing.tsx"
import { PricingDesign, Stage } from "./stage.tsx"

/**
 * Sharing a project: who has access and what they can do, agents' access, links to exactly the layer you mean, asking
 * for access, and opening a link in the browser without Parity.
 */
const meta = {
  title: "Parity/Explorations/Collaboration/Sharing",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * The share dialog, from Share in the title bar: invite by name or email, change anyone's role, set what agents may do,
 * and who else can open the link. Priya can edit but can't push, so the dialog says her changes open a pull request.
 */
export const ShareDialogStory: Story = {
  name: "Share dialog",
  render: () => (
    <Stage>
      <ShareDialog />
    </Stage>
  )
}

/** Inviting: names and emails become chips (Enter or a comma), and Invite adds them with the role picked. */
export const Inviting: Story = {
  render: () => (
    <Stage>
      <ShareDialog />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Each confirming key is its own step, so the dialog has re-rendered with what was typed first.
    await userEvent.type(canvas.getByRole("textbox", { name: "Invite people" }), "Lena Fischer")
    await userEvent.keyboard("{Enter}")
    await userEvent.keyboard("alex@studio.dev")
    await userEvent.keyboard(",")
    await userEvent.click(canvas.getByRole("button", { name: "Invite" }))
    await expect(canvas.getByText("alex@studio.dev")).toBeInTheDocument()
    await expect(canvas.getAllByText(/Invited just now/)).toHaveLength(2)
  }
}

/** A person's role: what each allows, and Remove access. */
export const RoleOptions: Story = {
  render: () => (
    <Stage>
      <ShareDialog />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole("button", { name: /^Can edit/ })[1]!)
  }
}

/** An agent's role. Proposes changes suits agents: it says what it will change, and someone approves with a click. */
export const AgentRoles: Story = {
  render: () => (
    <Stage>
      <ShareDialog />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole("button", { name: /^Can edit/ })[4]!)
  }
}

/** Copying a link to exactly what you mean: a layer, a layer in one frame, a design, or the project. Try one. */
export const CopyLink: Story = {
  render: () => (
    <Stage>
      <CopyLinkMenu />
    </Stage>
  )
}

/** A link to a layer, pasted in a chat, and the preview it unfurls to. */
export const LinkPreview: Story = {
  render: () => (
    <Stage>
      <LinkUnfurl />
    </Stage>
  )
}

/** Asking for access when a link won't open, and the request as the owner gets it. Both answer when clicked. */
export const RequestingAccess: Story = {
  render: () => (
    <Stage className="flex flex-wrap items-start gap-8">
      <RequestAccess />
      <AccessRequest />
    </Stage>
  )
}

/**
 * A link opened in the browser, by someone without Parity: the design, its pins and threads, and a way to open it in
 * Parity to edit. Sam can comment, so the thread takes replies.
 */
export const GuestInTheBrowser: Story = {
  render: () => (
    <div className="h-screen bg-[#0c0c0f] p-8">
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-background">
        <div className="flex h-10 shrink-0 items-center border-b bg-neutral-900 px-3">
          <div className="flex h-7 flex-1 items-center gap-2 rounded-md bg-black/40 px-3 text-xs text-muted-foreground">
            <Lock className="size-3" />
            parity.example/buildkit/website/pricing?layer=plan-card
          </div>
        </div>
        <BrowserBanner />
        <div className="relative min-h-0 flex-1 overflow-auto bg-[#0c0c0f] p-10">
          <LiveBoard
            name="Pricing"
            frame="Desktop, Dark"
            initial={pricingPins}
            design={(mark) => <PricingDesign mark={mark} />}
          />
        </div>
      </div>
    </div>
  )
}
