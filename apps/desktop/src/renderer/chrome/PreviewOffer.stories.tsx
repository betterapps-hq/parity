import type { PreviewOffer } from "@parity-app/project"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { clearNotifications, holdToast, openProjects } from "../stories/fixtures.tsx"
import { Window } from "./chrome-fixtures.tsx"
import { offerPreviewFile, PreviewOfferDialog } from "./PreviewOffer.tsx"

/**
 * The offer to write a project's preview file from the providers its entry renders around the app (PAR-104), made as
 * the project opens when it has none. Review shows the file before anything is written; Write file writes it and the
 * frames redraw inside the providers. Closing the toast or pressing Cancel writes nothing.
 */
const meta = {
  title: "Parity/Chrome/Prompts/Preview file",
  component: PreviewOfferDialog,
  render: () => <AppWindow />,
  decorators: [Window],
  loaders: [clearNotifications, async () => openProjects("example")]
} satisfies Meta<typeof PreviewOfferDialog>

export default meta

type Story = StoryObj<typeof meta>

const body = () => within(document.body)

/** App F's offer, as `offerPreviewFile` in `@parity-app/project` reads it from `src/App.jsx`. */
const appF: PreviewOffer = {
  file: ".parity/preview.jsx",
  providers: [{ name: "ThemeProvider", file: "src/App.jsx", themed: true }],
  leftOut: [],
  text: `import { ThemeProvider } from 'styled-components'
import { darkTheme, lightTheme } from '../src/theme'

// The providers src/App.jsx renders around the app, around every frame on the canvas.
const withProviders = (Story, context) => (
  <ThemeProvider theme={context.globals.theme === 'dark' ? darkTheme : lightTheme}>
    <Story />
  </ThemeProvider>
)

export const decorators = [withProviders]

export const globalTypes = {
  theme: { description: 'Theme', defaultValue: 'light' },
}
`
}

/** An app with several providers, one of which needs the signed-in person, which only the running app has. */
const severalProviders: PreviewOffer = {
  file: ".parity/preview.tsx",
  providers: [
    { name: "QueryClientProvider", file: "src/main.tsx", themed: false },
    { name: "IntlProvider", file: "src/main.tsx", themed: false }
  ],
  leftOut: [{ name: "SessionProvider", file: "src/App.tsx", needs: "user" }],
  text: `import type { ComponentType } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { IntlProvider } from "react-intl"
import messages from "../src/messages/en.json"

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

// The providers src/main.tsx renders around the app, around every frame on the canvas.
const withProviders = (Story: ComponentType) => (
  <QueryClientProvider client={queryClient}>
    <IntlProvider locale="en" messages={messages}>
      <Story />
    </IntlProvider>
  </QueryClientProvider>
)

export const decorators = [withProviders]
`
}

const wrote = () => new Promise<void>((resolve) => setTimeout(resolve, 400))
const couldNotWrite = () => Promise.reject(new Error("EACCES: permission denied, open '.parity/preview.jsx'"))

/** Made as app F opens: the toast stays until it's closed or Review is pressed. */
export const Offered: Story = {
  play: async () => {
    offerPreviewFile(appF, wrote, () => undefined)
    await holdToast("Wrap frames in your providers?")
  }
}

/** Review: the file as it would be written, with where it goes. */
export const Reviewing: Story = {
  play: async () => {
    offerPreviewFile(appF, wrote, () => undefined)
    await userEvent.click(await body().findByRole("button", { name: "Review" }))
    await expect(await body().findByRole("dialog", { name: "Write a preview file?" })).toBeVisible()
  }
}

/** Several providers nest outermost first, and one that needs the running app is left out, saying what it needs. */
export const LeavesOneOut: Story = {
  play: async () => {
    offerPreviewFile(severalProviders, wrote, () => undefined)
    await userEvent.click(await body().findByRole("button", { name: "Review" }))
    await expect(await body().findByText(/SessionProvider is left out/)).toBeVisible()
  }
}

/** Write file: the file is written and the frames redraw inside the providers. */
export const Written: Story = {
  play: async () => {
    offerPreviewFile(appF, wrote, () => undefined)
    await userEvent.click(await body().findByRole("button", { name: "Review" }))
    await userEvent.click(await body().findByRole("button", { name: "Write file" }))
    await holdToast("Wrote the preview file")
  }
}

/** The file couldn't be written: why, and the dialog stays open to try again. */
export const CouldntWrite: Story = {
  name: "Couldn't write",
  play: async () => {
    offerPreviewFile(appF, couldNotWrite, () => undefined)
    await userEvent.click(await body().findByRole("button", { name: "Review" }))
    await userEvent.click(await body().findByRole("button", { name: "Write file" }))
    await holdToast("Couldn't write the preview file")
  }
}
