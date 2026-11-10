import { unsplash } from "@parity-app/connectors"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { browserStage, body, opening } from "./browser-stories.tsx"
import { LibraryBrowserHost } from "./LibraryBrowser.tsx"

/**
 * The library browser on Unsplash, which Parity keeps but doesn't offer: the same browser, from what its connector
 * says, with no change in the window.
 */
const meta = {
  title: "Parity/Library browser/Unsplash",
  component: LibraryBrowserHost,
  parameters: { layout: "fullscreen" },
  decorators: [browserStage]
} satisfies Meta<typeof LibraryBrowserHost>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Unsplash, which Parity keeps but doesn't offer: the same browser, from what its connector says, with no change in
 * the window.
 */
export const Photos: Story = {
  loaders: [opening(unsplash, { query: "nature", filters: {} })],
  play: async () => {
    await body().findByRole("combobox", { name: "Orientation" })
  }
}
