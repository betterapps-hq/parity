import { FaceStack, type Presence } from "@parity-app/presence-ui"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { expect, userEvent, waitFor, within } from "storybook/test"
import type { AccountPerson } from "../../shared/account.ts"
import { PersonAvatar } from "../account/PersonAvatar.tsx"
import { scrolls } from "../stories/canvas-kit.tsx"
import { CanvasBoard } from "../stories/CanvasBoard.tsx"
import { CanvasPane } from "../stories/CanvasPane.tsx"
import { DashboardDesign } from "../stories/DashboardDesign.tsx"
import { Themes } from "../stories/Themes.tsx"
import { useResolvedTheme } from "../theme.ts"
import { accounts, members, presences, signedIn, TopRight } from "./story-kit.tsx"

/**
 * Who's here, on a bar of its own just left of the canvas's zoom, at its height, built as the toolbar and zoom are
 * (PAR-1293). Everyone is in one stack, your own face first. Faces are round for everyone: a person's picture or
 * initials on their soft gradient, an agent's sparkle on its vivid one. They overlap, and spread apart under the
 * pointer so each is easy to hit; a face rises as you point at it and says who it is. Whoever you follow comes next,
 * ringed in their color; each person's agents come just after them; anyone away is faded and last. Past four others, a
 * count opens everyone, people and agents apart. Your face opens your card, where you can present. Signed in, your own
 * face is drawn as your account avatar in the window's top right draws you, so you can tell which face is yours (PAR-1309);
 * everyone else still sees you in your palette.
 */
const meta = {
  title: "Parity/Multiplayer/Avatar stack",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const { mia, jonas, priya, claude, codex, sam, lena, theo } = presences
const { you } = members

/** A labelled stack, pinned to the right. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 border-b border-border/60 px-4 py-3 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

const away: Presence = { ...priya, away: "8 min" }

/** Each state of the bar: a few here, agents beside the people running them, a crowd counted, away, following. */
export const States: Story = {
  render: () => (
    <Themes width={520} height={420}>
      {() => (
        <div className="flex flex-col py-1">
          <Row label="You, then two people: a picture and initials">
            <FaceStack here={[mia, jonas]} you={you} />
          </Row>
          <Row label="Agents beside whoever runs them">
            <FaceStack here={[mia, jonas, claude, codex]} you={you} />
          </Row>
          <Row label="Eight others: three faces, then the rest">
            <FaceStack here={[mia, jonas, priya, claude, codex, sam, theo, lena]} you={you} />
          </Row>
          <Row label="Priya away, faded and last">
            <FaceStack here={[away, mia, jonas]} you={you} />
          </Row>
          <Row label="Following Jonas, ringed and just after you">
            <FaceStack here={[mia, jonas, priya]} following={members.jonas} you={you} />
          </Row>
          <Row label="Just you">
            <FaceStack here={[]} you={you} />
          </Row>
        </div>
      )}
    </Themes>
  )
}

/** A stack beside the account avatar the window's top right shows for the same person. */
function Matching({ label, account, children }: { label: string; account?: AccountPerson; children: ReactNode }) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-4">
        {children}
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          Account
          {account ? (
            <span data-testid="account-avatar">
              <PersonAvatar person={account} size={28} />
            </span>
          ) : (
            <span>signed out</span>
          )}
        </span>
      </div>
    </Row>
  )
}

/**
 * Your face, as you see it: signed in, it matches your account avatar, your picture or your initials on your own color;
 * signed out, it keeps your palette. Others' faces keep theirs either way.
 */
export const YourOwnFace: Story = {
  render: () => (
    <Themes width={620} height={300}>
      {() => (
        <div className="flex flex-col py-1">
          <Matching label="Signed in, with a picture" account={accounts.picture}>
            <FaceStack here={[mia, jonas]} you={signedIn.picture} />
          </Matching>
          <Matching label="Signed in, with initials" account={accounts.initials}>
            <FaceStack here={[mia, jonas]} you={signedIn.initials} />
          </Matching>
          <Matching label="Signed out">
            <FaceStack here={[mia, jonas]} you={you} />
          </Matching>
        </div>
      )}
    </Themes>
  ),
  play: async ({ canvasElement }) => {
    const pane = within(canvasElement).getAllByRole("list", { name: "People here" }).slice(0, 3)
    const [picture, initials, signedOut] = pane.map((list) => within(list).getAllByRole("button"))

    const fallback = (face: HTMLElement | undefined) =>
      face?.querySelector<HTMLElement>('[data-slot="avatar-fallback"]')

    const account = within(canvasElement).getAllByTestId("account-avatar")

    // With a picture, your face shows the account's picture.
    await waitFor(() =>
      expect(picture?.[0]?.querySelector("img")?.getAttribute("src")).toBe(accounts.picture.pictureUrl)
    )

    // With initials, your face has the account avatar's letters and color.
    const yours = fallback(initials?.[0])
    const avatar = account[1]?.querySelector("span")
    await expect(yours).toHaveTextContent("AC")
    await expect(getComputedStyle(yours!).backgroundColor).toBe(getComputedStyle(avatar!).backgroundColor)

    // Signed out, your face keeps your palette's gradient, and Jonas keeps his everywhere.
    await expect(fallback(signedOut?.[0])?.style.background).toContain("linear-gradient")
    await expect(fallback(initials?.[2])?.style.background).toBe(fallback(signedOut?.[2])?.style.background)
    await expect(fallback(initials?.[2])?.style.background).toContain("linear-gradient")
  }
}

/** Two of you on a canvas wide enough for the row: one stack, beside zoom, at its height. */
export const TwoOnTheCanvas: Story = {
  render: () => (
    <Themes width={760} height={340}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={40} y={48}>
            <DashboardDesign />
          </CanvasBoard>
          <TopRight>
            <FaceStack here={[mia]} you={you} />
          </TopRight>
        </>
      )}
    </Themes>
  ),
  play: async ({ canvasElement }) => {
    for (const list of within(canvasElement).getAllByRole("list", { name: "People here" })) {
      const faces = within(list).getAllByRole("button")
      await expect(faces).toHaveLength(2)
      await expect(faces[0]).toHaveAccessibleName("You")
      await expect(faces[1]).toHaveAccessibleName(/^Mia Rossi/)

      // The pane's zoom bar: the one holding its level button.
      const pane = list.closest("section") ?? canvasElement
      const level = within(pane).getByRole("button", { name: /^Zoom to 100%/ })
      const stack = list.parentElement?.getBoundingClientRect()
      const zoom = level.parentElement?.getBoundingClientRect()
      await expect(stack?.top).toBe(zoom?.top)
      await expect(stack?.height).toBe(zoom?.height)
      await expect((stack?.right ?? Infinity) < (zoom?.left ?? -Infinity)).toBe(true)
    }
  }
}

/** Six others on the canvas: you, three of them, then a count of the rest, beside zoom. */
export const OnTheCanvas: Story = {
  render: () => (
    <Themes width={760} height={340}>
      {() => (
        <>
          <CanvasBoard name="Dashboard" x={40} y={48}>
            <DashboardDesign />
          </CanvasBoard>
          <TopRight>
            <FaceStack here={[mia, jonas, { ...priya, away: "3 min" }, claude, codex, sam]} you={you} />
          </TopRight>
        </>
      )}
    </Themes>
  )
}

/** A canvas with the bar on it, for the stories that point at it. Follows the toolbar's theme. */
function Pointed({ here, onGoTo }: { here: Presence[]; onGoTo?: () => void }) {
  const theme = useResolvedTheme()

  return (
    <div className="min-h-screen bg-background p-6">
      <CanvasPane theme={theme} width={620} height={420}>
        <CanvasBoard name="Dashboard" x={40} y={48}>
          <DashboardDesign />
        </CanvasBoard>
        <TopRight>
          <FaceStack here={here} you={you} onGoTo={onGoTo} />
        </TopRight>
      </CanvasPane>
    </div>
  )
}

/** Pointing at Jonas: the faces spread apart, Jonas's rises, and a tooltip names him. */
export const PointingAtAFace: Story = {
  render: () => <Pointed here={[mia, jonas, claude, codex]} />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("button", { name: /^Jonas Weber/ }))
    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(page.getByText("Jonas Weber", { selector: "span" })).toBeVisible())
  }
}

/** The count opened: everyone here, people and then agents, each with whose it is, and Follow on hover. */
export const Everyone: Story = {
  render: () => <Pointed here={[mia, jonas, priya, claude, codex, sam, theo, lena]} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /more, of 8 here/ }))
    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(page.getByText("8 here")).toBeVisible())
  }
}

/** Your own face opened: you as everyone sees you, Present to everyone, and whether to show their pointers. */
export const YourCard: Story = {
  render: () => <Pointed here={[mia, jonas, claude]} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "You" }))
    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(page.getByRole("button", { name: /Present to everyone/ })).toBeVisible())
  }
}

/** Go to on Jonas's card: the card closes as the canvas goes to him, so it's out of the way of what you went to see. */
export const GoingToSomeone: Story = {
  render: () => <Pointed here={[mia, jonas, claude]} onGoTo={() => undefined} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Jonas Weber/ }))
    const page = within(canvasElement.ownerDocument.body)
    const goTo = await page.findByRole("button", { name: "Go to" })
    await userEvent.click(goTo)
    await waitFor(() => expect(page.queryByRole("button", { name: "Go to" })).not.toBeInTheDocument())
  }
}
