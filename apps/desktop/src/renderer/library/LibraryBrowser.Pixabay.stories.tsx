import { pixabay } from "@parity-app/connectors"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { never } from "../stories/fixtures.tsx"
import { answeringSearches, rememberingSearches } from "../stories/host.ts"
import { browserStage, body, opening, results, taken } from "./browser-stories.tsx"
import { LibraryBrowserHost } from "./LibraryBrowser.tsx"

/**
 * The library browser on Pixabay, as the Media tab opens it: one wide dialog over the window, drawn from what
 * Pixabay's connector says about itself. The stories answer searches with pictures drawn for them, except Live, which
 * searches Pixabay with the key in `apps/desktop/.env.local`.
 */
const meta = {
  title: "Parity/Library browser/Pixabay",
  component: LibraryBrowserHost,
  parameters: { layout: "fullscreen" },
  decorators: [browserStage]
} satisfies Meta<typeof LibraryBrowserHost>

export default meta

type Story = StoryObj<typeof meta>

/** Pixabay, just opened: searches it suggests, and nothing searched yet. */
export const JustOpened: Story = {
  loaders: [opening(pixabay)],
  play: async () => {
    await body().findByRole("heading", { name: "Try on Pixabay" })
    await expect(body().getByRole("textbox", { name: "Describe a photo" })).toHaveFocus()
  }
}

/** With recent searches, each saying what it was narrowed by, to run again with a click. */
export const RecentSearches: Story = {
  loaders: [
    async () => {
      await opening(pixabay)()
      rememberingSearches([
        { connector: "pixabay", kind: "photos", query: "mountain lake", filters: { type: "vectors" }, at: 2 },
        { connector: "pixabay", kind: "photos", query: "office desk", filters: {}, at: 1 }
      ])
    }
  ],
  play: async () => {
    const recent = await body().findByRole("region", { name: "Recent" })
    await userEvent.click(await within(recent).findByRole("button", { name: /mountain lake/ }))
    await body().findByRole("textbox", { name: "Describe a vector" })
    await results()
  }
}

/** A search's results, packed into columns at their own proportions, each with who made it. */
export const FindImages: Story = {
  loaders: [opening(pixabay, { query: "nature", filters: {} })],
  play: async () => {
    await within(await results()).findAllByRole("button", { name: "Hills at dusk, by Lena Ray" })
    await body().findByText("12 photos")
  }
}

/** Typing a description and pressing Enter searches. */
export const SearchTyped: Story = {
  loaders: [opening(pixabay)],
  play: async () => {
    await userEvent.type(body().getByRole("textbox", { name: "Describe a photo" }), "lake{Enter}")
    await results()
  }
}

/** Choosing a type searches again with the same words, and the count and field name the type. */
export const ChooseAType: Story = {
  loaders: [opening(pixabay, { query: "logo", filters: {} })],
  play: async () => {
    await results()
    await userEvent.click(body().getByRole("combobox", { name: "Type" }))
    await userEvent.click(await body().findByRole("option", { name: "Vectors" }))
    await body().findByText("12 vectors")
    await expect(body().getByRole("textbox", { name: "Describe a vector" })).toHaveValue("logo")
  }
}

/** Filters past the first three wait behind Filters, which counts the ones set. */
export const MoreFilters: Story = {
  loaders: [opening(pixabay, { query: "nature", filters: { editors: "true" } })],
  play: async () => {
    await results()
    await userEvent.click(body().getByRole("button", { name: /Filters/ }))
    await body().findByRole("switch", { name: "Editor's choice" })
  }
}

/** Two picked: the button counts them, Clear lets them go, and pressing it hands them over. */
export const Picked: Story = {
  loaders: [opening(pixabay, { query: "nature", filters: {} })],
  play: async () => {
    const list = await results()
    await userEvent.click(within(list).getAllByRole("button", { name: "Hills at dusk, by Lena Ray" })[0]!)
    await userEvent.click(within(list).getAllByRole("button", { name: "Potted palm, by Mia Torres" })[0]!)
    await userEvent.click(body().getByRole("button", { name: "Add 2 to project" }))
    await waitFor(() => expect(taken().map(({ title }) => title)).toEqual(["Hills at dusk", "Potted palm"]))
  }
}

/** A picture shown larger, with the strip of every result under it, stepped through with the arrows. */
export const Larger: Story = {
  loaders: [opening(pixabay, { query: "nature", filters: {} })],
  play: async () => {
    const list = await results()
    await userEvent.dblClick(within(list).getAllByRole("button", { name: "Hills at dusk, by Lena Ray" })[0]!)
    await body().findByRole("region", { name: "Lena Ray" })
    await userEvent.keyboard("{ArrowRight}")
    await body().findByRole("region", { name: "Omar Haddad" })
    await expect(body().getByRole("list", { name: "All results" })).toBeVisible()
  }
}

/** More arrive as the view nears the end of the results. */
export const MoreAsYouScroll: Story = {
  loaders: [opening(pixabay, { query: "nature", filters: {} })],
  play: async () => {
    const list = await results()
    list.parentElement?.parentElement?.scrollTo({ top: 100_000 })
    await body().findByText("18 photos")
  }
}

/** Videos show how long they run, and can't be added to the project yet, so pressing one shows it larger. */
export const Videos: Story = {
  loaders: [opening(pixabay, { query: "waves", filters: { type: "videos" } })],
  play: async () => {
    const list = await results()
    const first = within(list).getAllByRole("button", { name: "Hills at dusk, by Lena Ray" })[0]!
    await expect(first).not.toHaveAttribute("aria-pressed")
    await userEvent.click(first)
    await body().findByRole("region", { name: "Lena Ray" })
    await expect(body().queryByRole("button", { name: "Pick" })).toBeNull()
  }
}

/** Nothing matches with a filter on: Clear filters searches the same words without it. */
export const NothingFound: Story = {
  loaders: [opening(pixabay, { query: "qwerty", filters: { orientation: "vertical" } })],
  play: async () => {
    await body().findByText("No photos match “qwerty”")
    await body().findByRole("button", { name: "Clear filters" })
  }
}

/** Too many searches: the browser waits out the time the source asked for. */
export const LimitReached: Story = {
  loaders: [
    async () => {
      await opening(pixabay, { query: "nature", filters: {} })()
      answeringSearches(() => ({ problem: { code: "rate-limited", message: "Too many searches.", retryAfter: 20 } }))
    }
  ],
  play: async () => {
    await body().findByText("Too many searches right now")
    await expect(body().getByRole("button", { name: "Try again" })).toBeDisabled()
  }
}

/** The source didn't answer: Try again. */
export const Unreachable: Story = {
  loaders: [
    async () => {
      await opening(pixabay, { query: "nature", filters: {} })()
      answeringSearches(() => ({ problem: { code: "unavailable", message: "Pixabay didn't answer." } }))
    }
  ],
  play: async () => {
    await body().findByText("Couldn't reach Pixabay")
  }
}

/** This copy of Parity has no key for the library: there's nothing to set up, so it says so. */
export const NoKey: Story = {
  loaders: [
    async () => {
      await opening(pixabay, { query: "nature", filters: {} })()
      answeringSearches(() => ({
        problem: { code: "no-key", message: "This copy of Parity has no Pixabay key, so it can't search Pixabay." }
      }))
    }
  ],
  play: async () => {
    await body().findByText("Pixabay isn't available")
  }
}

/** Waiting on the source, over placeholders in the shape results take. */
export const Searching: Story = {
  loaders: [
    async () => {
      await opening(pixabay, { query: "nature", filters: {} })()
      answeringSearches(() => never())
    }
  ]
}

/** Pixabay itself, searched with the key in `apps/desktop/.env.local`. Without one, it says Pixabay isn't available. */
export const Live: Story = { loaders: [opening(pixabay, { query: "mountain lake", filters: {} }, true)] }
