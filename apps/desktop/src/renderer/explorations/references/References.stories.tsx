import type { Found } from "@parity-app/connectors"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { setLayout } from "../../chrome/layout.ts"
import { design, example, openProjects, typeInto } from "../../stories/fixtures.tsx"
import type { Placed } from "./canvas.tsx"
import { sampleFound, samples } from "./data.ts"
import { Explainer, live, ReferencesWorkspace, type Start } from "./workspace.tsx"

/**
 * Searching a library outside the project (docs/proposals/references.md): Mobbin's screens to place beside a design,
 * and Unsplash's photos to add to one. Both use one browser over the canvas, where pictures are big enough to judge.
 * It asks for a description and whatever the library's connector says it filters by: Mobbin's platform, Unsplash's
 * orientation and color. Find references is on the toolbar and R; Find photos is in the Images tab, which lists the
 * project's own images.
 *
 * Every story is the same window, started in a different place, and all of it works: describe something and press
 * Enter, change a filter, click results to pick them, double-click one to see it larger, and place what you picked.
 * On the canvas, wheel to pan, Ctrl and wheel to zoom, drag a reference to move it, Delete to remove it, and select
 * one to see it in the inspector.
 *
 * Most stories search made-up samples, drawn where the browser would show the source's pictures, so they look the
 * same everywhere. The two under Live search the real Mobbin and Unsplash through the connectors, which Storybook's
 * dev server runs with the keys in `apps/desktop/.env.local`; in a built Storybook they say there's no key.
 */
const meta = {
  title: "Parity/Explorations/References",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Opens the example with Pricing selected, or with nothing selected, on a tab of the left panel. */
const opening =
  (selected: boolean, leftTab = "layers") =>
  async () => {
    await openProjects("example")
    example().selection.set(selected ? { design: design("Pricing") } : {})
    setLayout({ leftTab })
  }

function workspace(start: Start = {}) {
  return () => <ReferencesWorkspace start={start} />
}

const body = () => within(document.body)

/** Samples as a search would return them, leaving out any id that isn't one. */
const found = (...ids: string[]): Found[] => ids.flatMap((id) => sampleFound(id) ?? [])

// Finding references

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
 * Opened with nothing selected: the last few searches to run again, and how Mobbin's search likes a screen described,
 * from Mobbin's own guidance.
 */
export const NothingSelected: Story = {
  loaders: [opening(false)],
  render: workspace({ browser: { library: "mobbin" } })
}

/** iOS, the other value of Mobbin's platform filter: phones are tall, so six fit across. */
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
 * The same description at Mobbin's deep depth: only the screens that fit all of it, so fewer than a full page. It
 * takes a few seconds, which is why it's asked for rather than the default.
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
 * The source turned the search away: Mobbin gives a key 60 requests a minute, shared by everyone searching through
 * it. The button waits out the time the answer gives.
 */
export const LimitReached: Story = {
  loaders: [opening(true)],
  render: workspace({ browser: { library: "mobbin", query: "pricing page", status: "limited" } })
}

/** The source, or the way to it, is down. */
export const CouldNotReachMobbin: Story = {
  loaders: [opening(true)],
  render: workspace({ browser: { library: "mobbin", query: "pricing page", status: "failed" } })
}

/** No key for the connector, as before one is added in Settings. The connector's own words say what to do. */
export const NotSetUp: Story = {
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
    selected: "ledgerly-pricing-tiers",
    note: (
      <Explainer title="For looking at, not building with">
        References aren&apos;t designs: they never go into one, into the project&apos;s files or into code, and exports
        leave them out.
      </Explainer>
    )
  })
}

const notes = [
  "Yearly is picked by default, and the saving sits on the toggle itself.",
  "Two plans only, the free one first. Questions sit straight under the plans.",
  "On a phone the trial is part of the yearly option, not a step of its own."
]

/**
 * What an agent leaves after it's asked to rework Pricing: the screens it looked at, each with a note on what it took
 * from it, so you can see what the change is based on. Agents search through the same connectors.
 */
export const PlacedByAnAgent: Story = {
  loaders: [opening(false)],
  render: workspace({
    placed: placed.map((each, index) => ({ ...each, by: "Claude", note: notes[index] })),
    selected: "quill-pricing-two"
  })
}

// Photos

/**
 * The Images tab as the project's own images: what's in its images folder, however it got there. A photo from
 * Unsplash keeps its photographer's name. Find photos opens the browser on Unsplash.
 */
export const ImagesTab: Story = {
  loaders: [opening(false, "images")],
  render: workspace()
}

/** Searching the project's images for something it doesn't have offers to look for it on Unsplash. */
export const ImageNotInTheProject: Story = {
  loaders: [opening(false, "images")],
  render: workspace(),
  play: async ({ canvasElement }) => {
    const field = await within(canvasElement).findByRole("textbox", { name: "Search images" })

    if (!(field instanceof HTMLInputElement)) {
      throw new Error("The Images tab's search isn't a text field")
    }

    await typeInto(field, "coast")
    await expect(await body().findByRole("button", { name: "Find “coast” on Unsplash" })).toBeInTheDocument()
  }
}

/**
 * Find photos: the same browser on Unsplash. Photos come in every shape, so they pack into columns, each with its
 * photographer's name. The filters are Unsplash's own, orientation and color, each open until you choose.
 */
export const FindPhotos: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "unsplash", query: "nature" } })
}

/** Orientation and color chosen: the same words, narrowed. Clearing either searches again. */
export const PhotoFilters: Story = {
  loaders: [opening(false, "images")],
  render: workspace({
    browser: { library: "unsplash", query: "nature", filters: { orientation: "landscape", color: "orange" } }
  })
}

/** A photo shown larger, with what it shows beside its photographer's name, and the strip of every result. */
export const PhotoLarger: Story = {
  loaders: [opening(false, "images")],
  render: workspace({
    browser: { library: "unsplash", query: "nature", viewing: "rocky-coast", picked: found("lake-at-sunrise") }
  })
}

/**
 * Picks two photos and adds them. They're saved into the project, so they show in the Images tab, and they land on a
 * new screen, as image files dropped on the empty canvas do.
 */
export const AddPhotos: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "unsplash", query: "nature" } }),
  play: async ({ canvasElement }) => {
    await userEvent.click(await body().findByRole("button", { name: /^Rolling green hills/ }))
    await userEvent.click(body().getByRole("button", { name: /^Waves on a rocky coast/ }))
    await userEvent.click(body().getByRole("button", { name: "Add 2 photos" }))
    const panel = within(canvasElement).getByRole("list", { name: "Images in this project" })
    await waitFor(() => expect(within(panel).getByText("rocky-coast.jpg")).toBeInTheDocument())
  }
}

/**
 * Unsplash says how many searches are left with every answer, 50 an hour until it approves an app. Under ten, the
 * browser says so beside its credit.
 */
export const FewSearchesLeft: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ source: samples({ searchesLeft: 4 }), browser: { library: "unsplash", query: "nature" } })
}

// Live

/**
 * Mobbin for real, through the connector, for the selected design. It needs `PARITY_MOBBIN_API_KEY` in
 * `apps/desktop/.env.local` and Storybook run from the repository; without them it says the connector isn't set up.
 */
export const LiveMobbin: Story = {
  loaders: [opening(true)],
  render: workspace({ source: live, browser: { library: "mobbin" } })
}

/** Unsplash for real, through the connector. It needs `PARITY_UNSPLASH_ACCESS_KEY`, as Mobbin's story needs its key. */
export const LiveUnsplash: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ source: live, browser: { library: "unsplash", query: "mountain lake" } })
}
