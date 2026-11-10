import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import type { Placed } from "./canvas.tsx"
import { found, opening, workspace } from "./story-kit.tsx"
import { live } from "./workspace.tsx"

/**
 * References from Mobbin (docs/proposals/references.md): screens from real apps, placed beside a design to look at,
 * never in it. Find references, on the toolbar and R, opens the library browser on Mobbin's connector. It asks for a
 * description and the one filter the connector shows, the platform, and offers the connector's deep search as Search
 * deeper. The browser is the one Unsplash's stories use; only what the connector says differs.
 *
 * Every story is the same window, started in a different place, and all of it works: describe a screen and press
 * Enter, switch between Web and iOS, Search deeper, click results to pick them, double-click one to see it larger, and
 * place what you picked. On the canvas, wheel to pan, Ctrl and wheel to zoom, drag a reference to move it, Delete to
 * remove it, and select one to see it in the inspector.
 *
 * All but Live search made-up samples, drawn where the browser would show Mobbin's screenshots. Live searches the
 * real Mobbin through the connector.
 */
const meta = {
  title: "Parity/Explorations/References/Mobbin",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** The whole page, since the browser opens over the window rather than inside the story's own element. */
const body = () => within(document.body)

// Finding

/**
 * Find references with Pricing selected: the browser opens on "pricing page" for the web, because that's the design's
 * name and its main preview is a desktop one. Nine screens to a search, three across, each with its app's name.
 */
export const ForADesign: Story = {
  loaders: [opening(true)],
  render: workspace({ browser: { library: "mobbin" } })
}

/** The toolbar's Find references, or R, with Pricing selected: the search runs as the browser opens. */
export const FromTheToolbar: Story = {
  loaders: [opening(true)],
  render: workspace(),
  play: async () => {
    await userEvent.click(await body().findByRole("button", { name: "Find references" }))
    await expect(await body().findByRole("list", { name: "Results" }, { timeout: 3000 })).toBeInTheDocument()
    await expect(body().getByRole("textbox", { name: "Describe a screen" })).toHaveValue("pricing page")
  }
}

/**
 * Opened with nothing selected: the last few searches to run again, one for each description with its platform,
 * beside searches Mobbin's connector suggests. A click on any runs it. Tips, in the search field, has the connector's
 * tips on searching, in every state.
 */
export const NothingSelected: Story = {
  loaders: [opening(false)],
  render: workspace({ browser: { library: "mobbin" } })
}

/** iOS, the other value of the connector's platform filter: phones are tall, so six fit across. */
export const PhoneScreens: Story = {
  loaders: [opening(true)],
  render: workspace({
    browser: { library: "mobbin", query: "paywall with a free trial", filters: { platform: "ios" } }
  })
}

/**
 * A description with a detail in it, searched quickly: every pricing page comes back, the ones with a yearly toggle
 * first. Search deeper is for when that's too loose.
 */
export const QuickResults: Story = {
  loaders: [opening(true)],
  render: workspace({ browser: { library: "mobbin", query: "pricing page with a yearly toggle" } })
}

/**
 * The same description at the connector's deep depth: only the screens that fit all of it, so fewer than a full page.
 * It takes a few seconds, which is why it's asked for rather than the default.
 */
export const DeepSearch: Story = {
  loaders: [opening(true)],
  render: workspace({ browser: { library: "mobbin", query: "pricing page with a yearly toggle", deep: true } })
}

/** Search deeper, pressed: the wait, then the close matches. */
export const SearchDeeper: Story = {
  loaders: [opening(true)],
  render: workspace({ browser: { library: "mobbin", query: "pricing page with a yearly toggle" } }),
  play: async () => {
    await userEvent.click(await body().findByRole("button", { name: "Search deeper" }))
    await expect(await body().findByText("Checking each screen against your description")).toBeInTheDocument()
    await expect(await body().findByText(/close matches from a deep search/, {}, { timeout: 5000 })).toBeInTheDocument()
  }
}

/** Naming an app keeps the results to that app, as Mobbin's search does: Ledgerly's screens, whatever they show. */
export const OneApp: Story = {
  loaders: [opening(false)],
  render: workspace({ browser: { library: "mobbin", query: "Ledgerly" } })
}

/**
 * More results asks again for the same description, leaving out what's shown, which is how Mobbin gives more. When a
 * pull comes back short, there are no more.
 */
export const MoreResults: Story = {
  loaders: [opening(true)],
  render: workspace({ browser: { library: "mobbin", query: "pricing page", more: 1 } })
}

// Picking

/** Three picked, across the results. The button says how many, and Clear lets them all go. */
export const Picked: Story = {
  loaders: [opening(true)],
  render: workspace({
    browser: {
      library: "mobbin",
      query: "pricing page",
      picked: found("ledgerly-pricing-tiers", "quill-pricing-two", "harbor-pricing-tiers")
    }
  })
}

/**
 * A screen shown larger, from a double-click or its corner button, in place of the search and its results. Its bar
 * names the app and its platform, and the X or Esc closes it. The strip underneath is every result, with the current
 * one outlined and the picked ones checked; a click or the arrow keys moves through them.
 */
export const Larger: Story = {
  loaders: [opening(true)],
  render: workspace({
    browser: {
      library: "mobbin",
      query: "pricing page",
      viewing: "quill-pricing-two",
      picked: found("ledgerly-pricing-tiers", "kite-pricing-usage")
    }
  })
}

/** Picks two screens and places them: they land in a row beside Pricing, and the canvas fits them in. */
export const PlaceReferences: Story = {
  loaders: [opening(true)],
  render: workspace({ browser: { library: "mobbin" } }),
  play: async () => {
    await userEvent.click(await body().findByRole("button", { name: "Ledgerly" }))
    await userEvent.click(body().getByRole("button", { name: "Quill" }))
    await userEvent.click(body().getByRole("button", { name: "Place 2 on canvas" }))
    const canvas = body().getByRole("application", { name: "Canvas" })
    await waitFor(() => expect(within(canvas).getAllByRole("img", { name: /^Reference: / })).toHaveLength(2))
  }
}

// When a search can't answer

/** Waiting on Mobbin. */
export const Searching: Story = {
  loaders: [opening(true)],
  render: workspace({ browser: { library: "mobbin", query: "pricing page", status: "searching" } })
}

/** Nothing fits. Mobbin's guidance is to say it another way or try the other platform. */
export const NoResults: Story = {
  loaders: [opening(false)],
  render: workspace({ browser: { library: "mobbin", query: "spaceship cockpit" } })
}

/**
 * Mobbin turned the search away: it gives a key 60 requests a minute, shared by everyone searching through it. The
 * button waits out the time the answer gives.
 */
export const LimitReached: Story = {
  loaders: [opening(true)],
  render: workspace({ browser: { library: "mobbin", query: "pricing page", status: "limited" } })
}

/** Mobbin, or the way to it, is down. */
export const CouldNotReachMobbin: Story = {
  loaders: [opening(true)],
  render: workspace({ browser: { library: "mobbin", query: "pricing page", status: "failed" } })
}

/**
 * This copy of Parity has no key for the connector. Keys are the app owner's to arrange, so there's nothing for the
 * person to set up: the browser says Mobbin isn't available, in the connector's own words.
 */
export const NotAvailable: Story = {
  loaders: [opening(true)],
  render: workspace({ browser: { library: "mobbin", query: "pricing page", status: "no-key" } })
}

// On the canvas

/** Where references start beside the design: past its phone preview. */
const beside = 1734 + 160

const about = "pricing page with a yearly toggle"

const placed: Placed[] = found("ledgerly-pricing-tiers", "quill-pricing-two", "budgetbird-paywall-plans").map(
  (each, index) => ({ key: each.id, found: each, x: beside + index * 1328, y: 0, query: about })
)

/**
 * References beside Pricing, one selected. Each is its picture at its own size, with its app and Mobbin under it. The
 * inspector's Design tab shows where the selected one is from and the description that found it, with a note to say
 * why it's here. More from Ledgerly searches for that app's other screens.
 */
export const OnTheCanvas: Story = {
  loaders: [opening(false)],
  render: workspace({
    placed,
    selected: "ledgerly-pricing-tiers"
  })
}

const notes = [
  "Yearly is picked by default, and the saving sits on the toggle itself.",
  "Two plans only, the free one first. Questions sit straight under the plans.",
  "On a phone the trial is part of the yearly option, not a step of its own."
]

/**
 * What an agent leaves after it's asked to rework Pricing: the screens it looked at, each with a note on what it took
 * from it, so you can see what the change is based on. Agents search through the same connector.
 */
export const PlacedByAnAgent: Story = {
  loaders: [opening(false)],
  render: workspace({
    placed: placed.map((each, index) => ({ ...each, by: "Claude", note: notes[index] })),
    selected: "quill-pricing-two"
  })
}

// Live

/**
 * Mobbin for real, through the connector, for the selected design. It needs `PARITY_MOBBIN_API_KEY` in
 * `apps/desktop/.env.local` and Storybook run from the repository, whose dev server runs the connector so the key
 * never reaches the page. Without them, as in a built Storybook, it says Mobbin isn't available. A search that works
 * joins Recent, which the host keeps as the app's main process does: close the browser and open it with nothing
 * selected to see it.
 */
export const Live: Story = {
  loaders: [opening(true)],
  render: workspace({ source: live, browser: { library: "mobbin" } })
}
