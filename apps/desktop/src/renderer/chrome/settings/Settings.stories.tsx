import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import { type FixtureOptions, useFixtureSettings } from "./fixture.ts"
import { SettingsView, type SettingsViewProps } from "./SettingsView.tsx"

/**
 * Settings with its data in the story (PAR-1081): every page and state the app's dialog draws, without a project or
 * main behind it. The person's settings save as they change. Kestrel's page holds what's saved in kestrel.par: the
 * person's settings it changes for itself, beside every project's values, and Storybook's config folder. Those changes
 * are undo steps in its window, so a bar offers Save.
 */
const meta = {
  title: "Parity/Chrome/Settings view",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

type DemoProps = FixtureOptions & Pick<SettingsViewProps, "initialPage" | "initialQuery" | "initialSetting">

function Demo({ initialPage, initialQuery, initialSetting, ...options }: DemoProps) {
  const [open, setOpen] = useState(true)
  const data = useFixtureSettings(options)

  return (
    <div className="min-h-screen bg-background">
      <SettingsView
        data={data}
        open={open}
        onOpenChange={setOpen}
        initialPage={initialPage}
        initialQuery={initialQuery}
        initialSetting={initialSetting}
      />
    </div>
  )
}

async function dialog() {
  return within(await screen.findByRole("dialog", { name: "Settings" }))
}

/** Parity's own settings for every project, in their groups. */
export const General: Story = {
  render: () => <Demo initialPage="general" values={{ autosave: true }} />
}

/** On the start page there's no project, so no project page, and extensions say what they run in. */
export const NoProjectOpen: Story = {
  render: () => <Demo initialPage="extensions" project={null} />,
  play: async () => {
    const view = await dialog()

    await expect(view.queryByRole("button", { name: "Kestrel" })).not.toBeInTheDocument()
    await expect(view.getByText("Runs in projects that use Storybook")).toBeInTheDocument()
  }
}

/**
 * Kestrel turns snapping off for itself. The row keeps the person's value, with Kestrel's beside it, which goes to it on
 * Kestrel's page.
 */
export const Canvas: Story = {
  render: () => <Demo initialPage="canvas" values={{ layoutGrid: true }} projectValues={{ snapping: false }} />,
  play: async () => {
    const view = await dialog()

    await expect(view.getByRole("switch", { name: "Snap to screens and components" })).toBeChecked()
    await userEvent.click(view.getByRole("button", { name: "Kestrel: Off" }))
    await expect(view.getByRole("heading", { name: "Kestrel" })).toBeInTheDocument()
  }
}

/**
 * Everything saved in kestrel.par: snapping, which Kestrel turns off for itself, with every project's value under it,
 * and Storybook's config folder. A change leaves Kestrel unsaved, so the bar offers Save; saving says so and the bar
 * goes.
 */
export const Kestrel: Story = {
  render: () => <Demo initialPage="project" projectValues={{ snapping: false }} />,
  play: async () => {
    const view = await dialog()

    await expect(view.getByRole("switch", { name: "Snap to screens and components" })).not.toBeChecked()
    await expect(view.getByRole("button", { name: "Every project: On" })).toBeInTheDocument()
    await userEvent.click(view.getByRole("switch", { name: "Snap to screens and components" }))
    await userEvent.click(view.getByRole("button", { name: "Save" }))
    await expect(view.queryByRole("button", { name: "Save" })).not.toBeInTheDocument()
    await expect(view.getByText("Saved")).toBeInTheDocument()
  }
}

/** Changing one of the person's settings for Kestrel: a switch starts at the other value, focused. */
export const ChangeASettingForKestrel: Story = {
  render: () => <Demo initialPage="project" />,
  play: async () => {
    const view = await dialog()

    await userEvent.click(view.getByRole("button", { name: "Change a setting for Kestrel" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: /Layout grid/ }))
    await waitFor(() => expect(view.getByRole("switch", { name: "Layout grid" })).toHaveFocus())
    await expect(view.getByRole("switch", { name: "Layout grid" })).toBeChecked()
    await expect(view.getByText("Kestrel has unsaved changes")).toBeInTheDocument()
  }
}

/** Kestrel saves itself, so Settings' changes to it save a moment later, with no bar. */
export const KestrelSavesItself: Story = {
  render: () => <Demo initialPage="project" projectValues={{ autosave: true, snapping: false }} />
}

/** One setting for export sizes, which Export images and each new layer's Export section both use. */
export const Export: Story = {
  render: () => <Demo initialPage="export" />
}

/** Sharing diagnostics and the install ID, as text to copy. */
export const Diagnostics: Story = {
  render: () => <Demo initialPage="diagnostics" values={{ installId: "3f9c2a71-6b0e-4d8a-9e15-c4a7d2b08f63" }} />
}

/** Diagnostics when `PARITY_TELEMETRY` decides it, which wins over the setting for the run. */
export const DiagnosticsSetByEnvironment: Story = {
  render: () => (
    <Demo initialPage="diagnostics" values={{ telemetry: false }} locked={{ telemetry: "PARITY_TELEMETRY" }} />
  )
}

export const Updates: Story = {
  render: () => <Demo initialPage="updates" />
}

/** A change main couldn't write: the switch stays as it was, and the row says so. */
export const CouldntSave: Story = {
  render: () => <Demo initialPage="updates" failing={["betaUpdates"]} />,
  play: async () => {
    const view = await dialog()

    await userEvent.click(view.getByRole("switch", { name: "Get beta updates" }))
    await expect(await view.findByRole("alert")).toHaveTextContent("Couldn't save this setting. Try again.")
    await expect(view.getByRole("switch", { name: "Get beta updates" })).not.toBeChecked()
  }
}

/** Every shortcut, each a button: pick one and press the new keys. */
export const KeyboardShortcuts: Story = {
  render: () => <Demo initialPage="shortcuts" />
}

/**
 * Giving Hand the V that Move and select had: V moves to Hand, and Move and select is left with none and says where its
 * keys went. The change saves as it's made. Escape stops without changing; Backspace removes.
 */
export const RebindAShortcut: Story = {
  render: () => <Demo initialPage="shortcuts" />,
  play: async () => {
    const view = await dialog()

    await userEvent.click(view.getByRole("button", { name: /^Change Hand/ }))
    await userEvent.keyboard("v")
    await expect(view.getByText("Its keys went to Hand.")).toBeInTheDocument()
  }
}

/** Entries keybindings.json has that Parity skipped, listed first, with the file to fix them in. */
export const SkippedShortcuts: Story = {
  render: () => (
    <Demo
      initialPage="shortcuts"
      skipped={[
        { command: "canvas.explode", keys: "Ctrl Alt Q" },
        { command: "hand", keys: "Hyper H" }
      ]}
    />
  )
}

/** An extension's page: what detection found, whether it runs in Kestrel, Kestrel's setting for it and what it adds. */
export const ExtensionPage: Story = {
  render: () => <Demo initialPage="ext:storybook" projectValues={{ "storybook.configDir": "storybook" }} />,
  play: async () => {
    const view = await dialog()

    await expect(view.getByRole("textbox", { name: "Config folder" })).toHaveValue("storybook")
  }
}

/** The built-in extensions, those running in Kestrel first. */
export const Extensions: Story = {
  render: () => <Demo initialPage="extensions" />
}

/**
 * Search results: pages and extensions by name, to go to; then settings, grouped by where they are, each with its
 * control, so it's changed where it's found. Kestrel's own settings carry its tag. Down from the search moves through
 * the results; Enter opens the first. Escape clears the search before it closes Settings.
 */
export const SearchResults: Story = {
  render: () => <Demo initialQuery="story" />,
  play: async () => {
    const view = await dialog()

    await expect(view.getByRole("heading", { name: "Results for “story”" })).toBeInTheDocument()
    await expect(view.getByRole("textbox", { name: "Config folder" })).toHaveValue(".storybook")
  }
}

/** A search that finds a setting by another word for it: "dark" finds Theme. */
export const SearchByKeyword: Story = {
  render: () => <Demo initialQuery="dark" />
}

/** Search finds shortcuts too, so a command's keys change where it's found. */
export const SearchFindsShortcuts: Story = {
  render: () => <Demo initialQuery="grid" />
}

export const NoResults: Story = {
  render: () => <Demo initialQuery="kerning" />
}

/** Opened on a setting, as a link to it does: its page, with the setting marked and its control focused. */
export const OpenedOnASetting: Story = {
  render: () => <Demo initialPage="export" initialSetting="exportSizes" />,
  play: async () => {
    const view = await dialog()

    await waitFor(() => expect(view.getByRole("button", { name: "Export sizes" })).toHaveFocus())
  }
}
