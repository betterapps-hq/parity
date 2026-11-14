import type { Meta, StoryObj } from "@storybook/react-vite"
import { openInspector } from "../../chrome/inspector-stories.tsx"
import { example } from "../../stories/fixtures.tsx"
import { withManyLocales } from "./model.ts"
import { ContainerWorkspace } from "./workspace.tsx"

/**
 * One slim container for every design on the canvas, whichever adapter brought it. Its title is one line: the icon,
 * the name, and what the adapter knows, such as a page's path with its params and where it lands. Hover or select a
 * design and its stories and modes menus follow the name, an icon each with how many show, and the adapter's action.
 *
 * A design's previews are a grid: a row for each story, under its name, and a column for each mode, so the rows line
 * up. However many modes show, the columns wrap onto new lines rather than run on. Each preview has a header above it,
 * never over it: its mode, and only what the preview sets differently. Click a preview or its header to select it,
 * Shift+click to add another, or click a story's name to select its row. The last one picked holds the settings of
 * them all in its header, with the inspector's own fields: their zoom, whose glyph scrubs it and whose chevron offers
 * Fit and 100, 75, 50 and 25%, and a button that opens their width and an option for each of the project's mode
 * variables, above what they change. A value they don't share shows Mixed. Drag a header, or press Left or Right on it,
 * to move its mode's column; drag a story's name, or press Up or Down on it, to move its row; drag the handle in the
 * gutter beside a preview to resize it, snapping to the app's breakpoints, which show under a page while it's resized.
 * A value changed since the last save has the change mark and a reset; Save, or Ctrl+S, keeps it, and the reset goes.
 * The stories and modes menus switch each on and off, any of them while another shows, and drag them into order; the
 * modes menu's Edit modes opens the Modes tab, whose changes the canvas draws.
 *
 * The pictures are the example app and its stories, taken in light and dark and, for its pages, right to left. The
 * project's Locale lists 28 languages, as a widely translated app's would; the example isn't translated, so a page
 * only changes with a right-to-left one.
 */
const meta = {
  title: "Parity/Explorations/Canvas container",
  component: ContainerWorkspace,
  parameters: { layout: "fullscreen" },
  loaders: [
    async () => {
      await openInspector("design")
      const { store } = example()
      store.setModes(withManyLocales(store.getModes()))
    }
  ]
} satisfies Meta<typeof ContainerWorkspace>

export default meta

type Story = StoryObj<typeof meta>

/**
 * TanStack Router's pages, Dashboard selected. It's behind a sign-in check, so it lands on `/login`, which shows in
 * amber under it. Project detail's `$projectId` is a field in its path. Settings only redirects, so it's a group round
 * its pages.
 */
export const Routes: Story = { args: { show: "routes", zoom: 0.4, selected: { board: "dashboard" } } }

/**
 * Project detail in Desktop Light and Mobile Light, Desktop Light selected: drag the handle beside either preview to
 * watch the page respond, snapping at each breakpoint, or set its width in the settings its header opens.
 */
export const Responsive: Story = {
  args: {
    show: "routes",
    zoom: 0.35,
    selected: { board: "detail", previews: ["page/desktop-light"] },
    modes: { detail: ["desktop-light", "mobile-light"] }
  }
}

/**
 * Changed and not saved: Billing's Desktop Light is in Arabic and 1100 pixels wide, each marked with a reset. Save to
 * keep them: the marks and resets go, and the header still says what the preview sets differently from its mode.
 */
export const UnsavedChanges: Story = {
  args: {
    show: "routes",
    zoom: 0.35,
    selected: { board: "billing", previews: ["page/desktop-light"] },
    modes: { billing: ["desktop-light", "desktop-dark"] },
    unsaved: { billing: { "page/desktop-light": { width: 1100, options: { locale: "ar" } } } }
  }
}

/**
 * A Storybook file's stories, a row each under the story's name, with a column for each mode. The stories menu in the
 * title lists them all: switch one on or off, and drag a row, or a story's name on the canvas, to put it in order.
 */
export const Stories: Story = {
  args: {
    show: "stories",
    zoom: 0.6,
    selected: { board: "plan-card" },
    states: { "plan-card": ["default", "popular"] },
    modes: { "plan-card": ["desktop-light", "desktop-dark"] }
  }
}

/**
 * Plan card with every story in every mode, Default and Popular selected in Desktop Dark: the header of the one picked
 * last holds the settings of both. The columns wrap onto a second line rather than run on, every row at the same
 * column, so the rows line up.
 */
export const ManyStoriesAndModes: Story = {
  args: {
    show: "stories",
    zoom: 0.3,
    selected: { board: "plan-card", previews: ["default/desktop-dark", "popular/desktop-dark"] },
    states: { "plan-card": ["default", "popular", "team-business"] },
    modes: { "plan-card": ["desktop-light", "desktop-dark", "tablet-light", "mobile-light"] }
  }
}

/** Both adapters' designs zoomed far out: names stay while there's room, and preview headers have faded. */
export const ZoomedOut: Story = { args: { show: "both", zoom: 0.1 } }
