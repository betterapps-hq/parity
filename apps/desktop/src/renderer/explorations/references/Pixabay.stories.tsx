import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { found, opening, workspace } from "./story-kit.tsx"
import { live } from "./workspace.tsx"

/**
 * Stock images and videos from Pixabay (docs/proposals/references.md), the stock source in place of Unsplash: photos,
 * illustrations, vectors and videos added to the project, to use in designs. It's the library browser Mobbin's and
 * Unsplash's stories use, on Pixabay's connector, so everything here comes from what the connector says: its name and
 * mark, its filters, its example searches and its tips.
 *
 * Pixabay has more filters than fit beside the search field, so the first three stay in view and the rest sit behind
 * Filters, in the connector's order. Which three depends on the type: orientation and color are for pictures, and
 * footage is for videos.
 *
 * Every story is the same window, started in a different place, and all of it works: describe something and press
 * Enter, choose a filter, click results to pick them, double-click one to see it larger, and add what you picked.
 * All but Live search made-up samples, drawn where the browser would show Pixabay's own. Live searches the real
 * Pixabay through the connector.
 */
const meta = {
  title: "Parity/Explorations/References/Pixabay",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** The whole page, since the browser opens over the window rather than inside the story's own element. */
const body = () => within(document.body)

// Finding

/**
 * Just opened: searches Pixabay's connector suggests trying, and, once there are some, the last few searches beside
 * them. Tips, in the search field, has the connector's tips.
 */
export const JustOpened: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "pixabay" } })
}

/**
 * A search's results, photos unless another type is chosen, packed into columns, each with its contributor's name.
 * Type, orientation and color are in view; category, editor's choice and order are behind Filters.
 */
export const FindImages: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "pixabay", query: "nature" } })
}

/** Type set to Illustration: the count, the search field and the empty state all say illustrations. */
export const Illustrations: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "pixabay", query: "abstract", filters: { type: "illustrations" } } })
}

/** Vectors, which have nothing behind them, shown on checks so you can see they're see-through. */
export const Vectors: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "pixabay", query: "icon", filters: { type: "vectors" } } })
}

/**
 * Orientation and color chosen. Orientation shows its icon and color its swatch, from the connector, and the colors
 * are Pixabay's fourteen, with Transparent and Grayscale among them.
 */
export const Filtered: Story = {
  loaders: [opening(false, "images")],
  render: workspace({
    browser: {
      library: "pixabay",
      query: "nature",
      filters: { type: "photos", orientation: "horizontal", color: "orange" }
    }
  })
}

/**
 * A filter behind Filters set: the button counts how many of its filters are, so you can tell without opening it.
 */
export const InACategory: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "pixabay", query: "work", filters: { category: "business" } } })
}

/** Choosing a type searches again and keeps the words. */
export const ChooseAType: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "pixabay", query: "nature" } }),
  play: async () => {
    await userEvent.click(await body().findByRole("combobox", { name: "Type" }))
    await userEvent.click(await body().findByRole("option", { name: "Illustrations" }))
    await expect(await body().findByText("3 illustrations", {}, { timeout: 3000 })).toBeInTheDocument()
    await expect(body().getByRole("textbox", { name: "Describe an illustration" })).toHaveValue("nature")
  }
}

// Picking

/** Picked across types: the button counts them without naming a type, since they needn't share one. */
export const Picked: Story = {
  loaders: [opening(false, "images")],
  render: workspace({
    browser: {
      library: "pixabay",
      query: "nature",
      picked: found("pixabay-lake-at-sunrise", "pixabay-leaves-flat", "pixabay-rocket")
    }
  })
}

/** An image shown larger, with what it shows beside its contributor's name, and the strip of every result. */
export const Larger: Story = {
  loaders: [opening(false, "images")],
  render: workspace({
    browser: {
      library: "pixabay",
      query: "nature",
      viewing: "pixabay-hills-flat",
      picked: found("pixabay-rocky-coast")
    }
  })
}

// When a search can't answer

/** Nothing fits with these filters. Clear filters searches the same words without them. */
export const NoResults: Story = {
  loaders: [opening(false, "images")],
  render: workspace({
    browser: { library: "pixabay", query: "nature", filters: { type: "vectors", color: "red" } }
  })
}

/** Pixabay allows a key 100 searches a minute. Past that, the browser waits out the time its answer gives. */
export const LimitReached: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "pixabay", query: "nature", status: "limited" } })
}

// Videos

/**
 * Videos, the fourth type. Each result shows how long it runs and plays, without sound, while you point at it.
 * Orientation and color are for pictures, so Footage and Category take their place beside the search field.
 */
export const Videos: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ browser: { library: "pixabay", query: "nature", filters: { type: "videos" } } })
}

/**
 * A video shown larger plays as it opens, over three controls: play or pause, a scrubber to move through it, and
 * where it is in its length. It's the kit's slider under a plain video, with no player library.
 */
export const VideoLarger: Story = {
  loaders: [opening(false, "images")],
  render: workspace({
    browser: {
      library: "pixabay",
      query: "nature",
      filters: { type: "videos" },
      viewing: "pixabay-waves-at-dusk"
    }
  })
}

// Live

/**
 * Pixabay for real, through the connector. It needs `PARITY_PIXABAY_API_KEY` in `apps/desktop/.env.local` and
 * Storybook run from the repository, whose dev server runs the connector so the key never reaches the page. Without
 * them, as in a built Storybook, it says Pixabay isn't available. Choose Videos to search its footage.
 */
export const Live: Story = {
  loaders: [opening(false, "images")],
  render: workspace({ source: live, browser: { library: "pixabay", query: "mountain lake" } })
}
