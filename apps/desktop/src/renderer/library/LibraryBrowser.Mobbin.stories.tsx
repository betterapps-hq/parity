import { mobbin } from "@parity-app/connectors"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { browserStage, body, opening, results } from "./browser-stories.tsx"
import { LibraryBrowserHost } from "./LibraryBrowser.tsx"

/**
 * The library browser on Mobbin: screens in rows of one shape, the other platform when nothing's found, and the deep
 * search. Live searches Mobbin with the key in `apps/desktop/.env.local`.
 */
const meta = {
  title: "Parity/Library browser/Mobbin",
  component: LibraryBrowserHost,
  parameters: { layout: "fullscreen" },
  decorators: [browserStage]
} satisfies Meta<typeof LibraryBrowserHost>

export default meta

type Story = StoryObj<typeof meta>

/** Mobbin's screens sit in rows of one shape, three web pages across. */
export const Screens: Story = {
  loaders: [opening(mobbin, { query: "sign in", filters: {} })],
  play: async () => {
    await within(await results()).findAllByRole("button", { name: "Ledgerly" })
    await body().findByText("9 screens")
  }
}

/** Mobbin on iOS: phones are tall, so more fit across. */
export const Phones: Story = {
  loaders: [opening(mobbin, { query: "sign in", filters: { platform: "ios" } })],
  play: async () => {
    await body().findByText("12 screens")
  }
}

/** Nothing on Mobbin: it offers the other platform, since an app can be on one and not the other. */
export const NothingFound: Story = {
  loaders: [opening(mobbin, { query: "nothing like it", filters: {} })],
  play: async () => {
    await userEvent.click(await body().findByRole("button", { name: "Search iOS" }))
    await body().findByText("No screens match “nothing like it”")
  }
}

/** Mobbin's deep search, a step past the quick results, checking each screen against the description. */
export const SearchDeeper: Story = {
  loaders: [opening(mobbin, { query: "sign in", filters: {} })],
  play: async () => {
    await results()
    await userEvent.click(body().getByRole("button", { name: "Search deeper" }))
    await body().findByText("9 close matches from a deep search")
  }
}

/** Mobbin itself, searched with the key in `apps/desktop/.env.local`. */
export const Live: Story = { loaders: [opening(mobbin, { query: "pricing page", filters: {} }, true)] }
