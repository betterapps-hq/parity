import type { Meta, StoryObj } from "@storybook/react-vite"
import { Box } from "tldraw"
import { AppWindow } from "../App.tsx"
import signInDesktopDark from "../stories/bitmaps/sign-in-desktop-dark.png?inline"
import signInDesktopLight from "../stories/bitmaps/sign-in-desktop-light.png?inline"
import signInMobileLight from "../stories/bitmaps/sign-in-mobile-light.png?inline"
import { design, example, onCanvas } from "../stories/fixtures.tsx"
import { answering } from "../stories/host.ts"
import { shapeIdFor } from "./CanvasEditor.tsx"
import { bitmapScale } from "./frame-bitmaps.ts"

/**
 * Zoomed far out, a frame whose bitmap isn't taken yet shows its skeleton: the boxes it draws, measured from it once it
 * has drawn, as faded bars for text and solid shapes for cards, fields and buttons. Its live frame then skips drawing,
 * as it does behind a bitmap. Storybook has no offscreen window to take bitmaps in, so frames here keep their skeletons
 * unless a story hands out bitmaps; zoom in past about 29% (on a 1x screen) and the live frames show instead.
 */
const meta = {
  title: "Parity/Canvas/Frame skeletons",
  component: AppWindow,
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof AppWindow>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Zooms out on designs as far as fitting them takes, and at least until their frames draw no larger than their bitmaps
 * would, which is when skeletons show.
 */
function zoomOut(names: string[]): void {
  const editor = example().editor
  const bounds = names.flatMap((name) => editor?.getShapePageBounds(shapeIdFor(design(name))) ?? [])
  if (!editor || bounds.length === 0) return
  editor.zoomToBounds(Box.Common(bounds), { inset: 48, targetZoom: (bitmapScale * 0.9) / devicePixelRatio })
}

/** Designs zoomed out, each board showing light and dark desktop and light mobile. */
function zoomedOut(...names: string[]): Story {
  return onCanvas(names, undefined, () => zoomOut(names))
}

/** App screens: a sidebar and top bar around stat cards, charts and tables. */
export const AppScreens: Story = zoomedOut("Dashboard", "Projects")

/** A marketing page: a hero, a billing toggle and pricing cards. */
export const MarketingPage: Story = zoomedOut("Pricing")

/** A form, Sign in: fields and buttons in a narrow column in the middle. */
export const Form: Story = zoomedOut("Sign in")

/** Settings: tabs over sections of fields, a select and switches. */
export const Settings: Story = zoomedOut("Settings")

/** Components on their smaller boards, where a skeleton is a handful of bars and boxes. */
export const Components: Story = zoomedOut("Stat card", "Plan card", "Activity item", "Member row")

/** The selected board stays live, so what's being worked on is the real thing; the rest are skeletons. */
export const SelectedStaysLive: Story = onCanvas(["Dashboard", "Projects"], undefined, () => {
  zoomOut(["Dashboard", "Projects"])
  example().selection.set({ design: design("Projects") })
})

/** Bitmaps the app took of the example's Sign in board, by the mode they're of. They can lag behind the design. */
const signInBitmaps = {
  "desktop-light": signInDesktopLight,
  "desktop-dark": signInDesktopDark,
  mobile: signInMobileLight
}

/**
 * The swap: Sign in's frames draw live for a moment, then show their skeletons once measured, then their bitmaps, each
 * taking three seconds and one at a time, as captures are. The other board keeps its skeletons, getting no bitmaps.
 */
export const Swap: Story = onCanvas(
  ["Settings", "Sign in"],
  () =>
    answering({
      "frames.capture": async ({ job }) => {
        const root = example().store.getEntry(design("Sign in"))?.container.root.id
        if (!root || !JSON.stringify(job.tree).includes(`"nodeId":"${root}"`)) return {}
        await new Promise((resolve) => setTimeout(resolve, 3000))
        let bitmap = signInBitmaps["desktop-light"]
        if (job.mode.width < 768) bitmap = signInBitmaps.mobile
        else if (job.mode.classNames.includes("dark")) bitmap = signInBitmaps["desktop-dark"]
        return { png: bitmap.split(",")[1] }
      }
    }),
  () => zoomOut(["Settings", "Sign in"])
)
