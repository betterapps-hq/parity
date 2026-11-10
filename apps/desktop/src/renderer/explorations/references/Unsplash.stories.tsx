import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { typeInto } from "../../stories/fixtures.tsx"
import { samples } from "./data.ts"
import { found, opening, workspace } from "./story-kit.tsx"
import { live } from "./workspace.tsx"

/**
 * Stock photos from Unsplash (docs/proposals/references.md): photos added to the project, to use in designs. Find
 * photos, in the Images tab, opens the library browser on Unsplash's connector. It asks for a description and the
 * connector's two filters, orientation and color, each open until chosen. The browser is the one Mobbin's stories use;
 * only what the connector says differs. The Images tab itself lists the project's own images.
 *
 * Every story is the same window, started in a different place, and all of it works: describe a photo and press
 * Enter, choose an orientation or a color, click results to pick them, double-click one to see it larger, and add
 * what you picked.
 *
 * All but Live search made-up samples, drawn where the browser would show Unsplash's photos. Live searches the real
 * Unsplash through the connector.
 */
const meta = {
  title: "Parity/Explorations/References/Unsplash",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** The whole page, since the browser opens over the window rather than inside the story's own element. */
const body = () => within(document.body)

// The Images tab

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

// Finding

/**
 * Find photos, just opened: the last few searches to run again, one for each description with the filters it last
 * had, beside searches Unsplash's connector suggests, with its tips underneath.
 */
export const JustOpened: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "unsplash" } })
}

/**
 * A search's results. Photos come in every shape, so they pack into columns, each with its photographer's name. The
 * filters are the connector's own, orientation and color, each on Any until you choose.
 */
export const FindPhotos: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "unsplash", query: "nature" } })
}

/**
 * Orientation and color chosen: the same words, narrowed. The colors are Unsplash's fixed list of eleven, with the
 * swatches its connector gives them. Setting either back to Any searches again.
 */
export const PhotoFilters: Story = {
  loaders: [opening(false, "images")],
  render: workspace({
    browser: { library: "unsplash", query: "nature", filters: { orientation: "landscape", color: "orange" } }
  })
}

/** A photo shown larger, with what it shows beside its photographer's name, and the strip of every result. */
export const Larger: Story = {
  loaders: [opening(false, "images")],
  render: workspace({
    browser: { library: "unsplash", query: "nature", viewing: "rocky-coast", picked: found("lake-at-sunrise") }
  })
}

/**
 * Picks two photos and adds them. They show in the Images tab from then on, and they land on a new screen, as image
 * files dropped on the empty canvas do.
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

// When a search can't answer

/** Nothing fits with these filters. Clear filters searches the same words without them. */
export const NoResults: Story = {
  loaders: [opening(false, "images")],
  render: workspace({
    browser: { library: "unsplash", query: "nature", filters: { orientation: "squarish", color: "red" } }
  })
}

/**
 * Unsplash sends how many searches are left this hour with every answer, in its rate limit headers: 50 an hour until
 * it approves an app for production, then 5,000. Under ten, the browser says so beside its credit.
 */
export const FewSearchesLeft: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ source: samples({ searchesLeft: 4 }), browser: { library: "unsplash", query: "nature" } })
}

/** The hour's searches are used up. Unsplash doesn't say how long is left, so the browser doesn't count down. */
export const LimitReached: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "unsplash", query: "nature", status: "limited", wait: 0 } })
}

// Live

/**
 * Unsplash for real, through the connector. It needs `PARITY_UNSPLASH_ACCESS_KEY` in `apps/desktop/.env.local` and
 * Storybook run from the repository, whose dev server runs the connector so the key never reaches the page. Without
 * them, as in a built Storybook, it says the connector isn't set up.
 */
export const Live: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ source: live, browser: { library: "unsplash", query: "mountain lake" } })
}
