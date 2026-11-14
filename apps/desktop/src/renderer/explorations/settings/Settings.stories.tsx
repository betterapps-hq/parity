import {
  Button,
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Settings } from "lucide-react"
import { useState } from "react"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import { extensions, manyExtensions } from "./data.ts"
import { SettingsModal, type SettingsModalProps } from "./modal.tsx"
import { type Hit, placeOf, search } from "./search.ts"

/**
 * One Settings view for every setting, Parity's own and each extension's (PAR-1081). The person's settings are on
 * Parity's pages and apply and save as they change. Kestrel's page holds what's saved in the project's file: the
 * person's settings it changes for itself, beside every project's values, and its extensions' settings. Those changes
 * are undo steps in its window, so a bar offers Save. Main owns the view and it loads no project code, so it's the only
 * place app settings and permission grants change. Not in the app yet.
 */
const meta = {
  title: "Parity/Explorations/Settings/Settings",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Demo(props: SettingsModalProps) {
  const [open, setOpen] = useState(true)
  const [key, setKey] = useState(0)

  return (
    <div className="min-h-screen bg-[#0c0c0f] p-6">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          setKey(key + 1)
          setOpen(true)
        }}
      >
        <Settings aria-hidden /> Settings
      </Button>
      <SettingsModal key={key} open={open} onOpenChange={setOpen} {...props} />
    </div>
  )
}

async function dialog() {
  return within(await screen.findByRole("dialog", { name: "Settings" }))
}

/** Parity's own settings for every project, in their groups, with dropdowns for every choice. */
export const General: Story = {
  render: () => <Demo initialPage="general" initialValues={{ autosave: true }} />
}

/**
 * Kestrel turns snapping off for itself. The row keeps the person's value, with Kestrel's beside it, which goes to it on
 * Kestrel's page.
 */
export const Canvas: Story = {
  render: () => <Demo initialPage="canvas" initialValues={{ layoutGrid: true }} initialProject={{ snapping: false }} />,
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
  render: () => <Demo initialPage="project" initialProject={{ snapping: false }} />,
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
  render: () => <Demo initialPage="project" initialProject={{ autosave: true, snapping: false }} />
}

/** One setting for export sizes, which Export images and each new layer's Export section both use. */
export const Export: Story = {
  render: () => <Demo initialPage="export" />
}

/** Feature flags, to try what isn't finished yet. */
export const Experiments: Story = {
  render: () => <Demo initialPage="experiments" />
}

/** Sharing diagnostics, as the dialog in the app has it, and the install ID, as text to copy. */
export const Diagnostics: Story = {
  render: () => <Demo initialPage="diagnostics" />
}

/** Diagnostics when `PARITY_TELEMETRY` decides it, which wins over the setting for the run. */
export const DiagnosticsSetByEnvironment: Story = {
  render: () => (
    <Demo initialPage="diagnostics" initialValues={{ telemetry: false }} locked={{ telemetry: "PARITY_TELEMETRY" }} />
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
    await expect(view.getByRole("alert")).toHaveTextContent("Couldn't save this setting. Try again.")
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

/**
 * An extension's page: what detection found, whether it runs in Kestrel, its settings, Kestrel's tagged, what it may
 * do, what it adds and what it costs. There's no switch: built-in extensions run whenever their tool is found.
 */
export const ExtensionPage: Story = {
  render: () => <Demo initialPage="ext:storybook" initialProject={{ "storybook.configDir": "storybook" }} />,
  play: async () => {
    const view = await dialog()

    await expect(view.getByRole("switch", { name: "Change designs, for Storybook" })).toBeChecked()
    await expect(view.getByRole("textbox", { name: "Config folder" })).toHaveValue("storybook")
  }
}

/** A value in settings.json that isn't one of a setting's choices: the setting uses its default, and says so. */
export const AValueParityCantUse: Story = {
  render: () => <Demo initialPage="ext:storybook" invalid={{ "storybook.openIn": "tab" }} />
}

/** The Extensions page with the five Parity has today. */
export const Extensions: Story = {
  render: () => <Demo initialPage="extensions" />
}

/**
 * Forty extensions installed. The sidebar keeps one Extensions page however many there are, and the page lists those
 * running in Kestrel first. Search finds one by name.
 */
export const FortyExtensions: Story = {
  render: () => <Demo initialPage="extensions" extensions={manyExtensions} />
}

/** With forty installed, searching finds an extension by name, and the settings of those that have any. */
export const FindAnExtension: Story = {
  render: () => <Demo initialQuery="pre" extensions={manyExtensions} />,
  play: async () => {
    const view = await dialog()

    await expect(view.getByRole("button", { name: /Prettier/ })).toBeInTheDocument()
  }
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

/** Where picking a hit in Search actions opens Settings: a page, and a setting on it to mark. */
interface Picked {
  page: string
  setting?: string
}

function pickOf(hit: Hit): Picked {
  if (hit.kind === "setting") {
    return { page: hit.setting.page, setting: hit.setting.id }
  }

  if (hit.kind === "shortcut") {
    return { page: "shortcuts", setting: `key:${hit.command}` }
  }

  return { page: hit.kind === "page" ? hit.page.id : `ext:${hit.extension.id}` }
}

function HitItem({ hit, onPick }: { hit: Hit; onPick: () => void }) {
  if (hit.kind === "setting") {
    return (
      <CommandItem value={hit.setting.id} onSelect={onPick}>
        <Settings className="text-muted-foreground" aria-hidden />
        <span className="truncate">{hit.setting.label}</span>
        <CommandShortcut>{placeOf(hit.setting, extensions).label}</CommandShortcut>
      </CommandItem>
    )
  }

  if (hit.kind === "shortcut") {
    return null
  }

  const { label, icon: Icon } = hit.kind === "page" ? hit.page : { label: hit.extension.name, icon: hit.extension.icon }

  return (
    <CommandItem value={label} onSelect={onPick}>
      <Icon className="text-muted-foreground" />
      <span className="truncate">{label}</span>
      <CommandShortcut>{hit.kind === "page" ? "Settings" : "Extensions"}</CommandShortcut>
    </CommandItem>
  )
}

function SearchActionsDemo() {
  const [query, setQuery] = useState("story")
  const [picked, setPicked] = useState<Picked>()

  return (
    <div className="min-h-screen bg-[#0c0c0f]">
      <CommandDialog open={!picked} onOpenChange={() => undefined} title="Search actions" className="sm:max-w-lg">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search actions, layers, components…" />
          <CommandList className="mt-1 max-h-96">
            <CommandGroup heading="Settings">
              {search(query, extensions).map((hit, index) => (
                <HitItem key={index} hit={hit} onPick={() => setPicked(pickOf(hit))} />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
      {picked && (
        <SettingsModal
          initialPage={picked.page}
          initialSetting={picked.setting}
          onOpenChange={() => setPicked(undefined)}
        />
      )}
    </div>
  )
}

/** Search actions with Settings pages, extensions and settings among its results. */
export const SearchActions: Story = {
  render: () => <SearchActionsDemo />
}

/**
 * Picking a setting in Search actions opens Settings on its page with the setting marked and its control focused.
 * Closing Settings comes back to the search.
 */
export const FromSearchActions: Story = {
  render: () => <SearchActionsDemo />,
  play: async () => {
    await userEvent.click(await screen.findByRole("option", { name: /Config folder/ }))
    const view = await dialog()

    await expect(view.getByRole("heading", { name: "Storybook" })).toBeInTheDocument()
  }
}
