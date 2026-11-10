import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { typeInto } from "../../stories/fixtures.tsx"
import { found, opening, workspace } from "./story-kit.tsx"
import { live } from "./workspace.tsx"

/**
 * Stock photos from Unsplash (docs/proposals/references.md), kept for turning on later: Pixabay is the stock library
 * the Media tab adds from. It's the library browser Mobbin's and Pixabay's stories use, on Unsplash's connector, which
 * asks for a description and has two filters, orientation and color, each open until chosen.
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

// Finding

/**
 * Find photos, just opened: the last few searches to run again, one for each description with the orientation and
 * color it last had, beside searches Unsplash's connector suggests. Tips, in the search field, has its tips.
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

/** Another description typed over the first, and Enter: the results change to match. */
export const SearchAgain: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "unsplash", query: "nature" } }),
  play: async () => {
    const field = await body().findByRole("textbox", { name: "Describe a photo" })

    if (!(field instanceof HTMLInputElement)) {
      throw new Error("The browser's search isn't a text field")
    }

    await userEvent.clear(field)
    await typeInto(field, "desk")
    await userEvent.keyboard("{Enter}")
    await expect(await body().findByRole("button", { name: /^A tidy desk from above/ })).toBeInTheDocument()
    await expect(body().queryByRole("button", { name: /^Rolling green hills/ })).toBeNull()
  }
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
 * Picks two photos and adds them. They show in the Media tab from then on, and they land on a new screen, as image
 * files dropped on the empty canvas do.
 */
export const AddPhotos: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "unsplash", query: "nature" } }),
  play: async ({ canvasElement }) => {
    await userEvent.click(await body().findByRole("button", { name: /^Rolling green hills/ }))
    await userEvent.click(body().getByRole("button", { name: /^Waves on a rocky coast/ }))
    await userEvent.click(body().getByRole("button", { name: "Add 2 photos" }))
    const panel = within(canvasElement).getByRole("list", { name: "Media in this project" })
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
 * The hour's searches are used up: 50 an hour until Unsplash approves an app for production, then 5,000. This is the
 * only time the browser mentions the limit. Unsplash doesn't say how long is left, so it doesn't count down.
 */
export const LimitReached: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "unsplash", query: "nature", status: "limited", wait: 0 } })
}

// Live

/**
 * Unsplash for real, through the connector. It needs `PARITY_UNSPLASH_ACCESS_KEY` in `apps/desktop/.env.local` and
 * Storybook run from the repository, whose dev server runs the connector so the key never reaches the page. Without
 * them, as in a built Storybook, it says Unsplash isn't available. A search that works joins Recent, which the
 * host keeps as the app's main process does.
 */
export const Live: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ source: live, browser: { library: "unsplash", query: "mountain lake" } })
}
