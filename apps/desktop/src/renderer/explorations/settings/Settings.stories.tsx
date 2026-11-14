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
import { expect, screen, userEvent, within } from "storybook/test"
import { extensions, manyExtensions, shownIn, type View } from "./data.ts"
import { SettingsModal, type SettingsModalProps } from "./modal.tsx"
import { type Hit, placeOf, search } from "./search.ts"

/**
 * One Settings view for every setting, Parity's own and each extension's (PAR-1081). The switch beside the title picks
 * whose settings it shows: yours, for every project, or Kestrel's only. Some settings are only yours (the theme), some
 * only the project's (Storybook's config folder), and some are yours with a value Kestrel can change for itself (snap,
 * export sizes): those show in both, and Kestrel's value wins in Kestrel. Main owns the view and it loads no project
 * code, so it's the only place app settings and permission grants change. Not in the app yet.
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

/** Your settings for every project. Kestrel turns snapping off for itself, which the row says. */
export const EveryProject: Story = {
  render: () => <Demo initialPage="canvas" initialValues={{ layoutGrid: true }} initialProject={{ snapping: false }} />,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Settings" })

    await expect(within(dialog).getByRole("switch", { name: "Snap to screens and components" })).toBeChecked()
    await expect(within(dialog).getByRole("button", { name: "Different in Kestrel" })).toBeInTheDocument()
  }
}

/**
 * Kestrel's settings: only those a project can have. Snapping is off here though it's on for every project; its reset
 * goes back to every project's value. Pages with nothing a project can change aren't listed.
 */
export const ProjectOnly: Story = {
  render: () => <Demo initialView="project" initialPage="canvas" initialProject={{ snapping: false }} />,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Settings" })

    await expect(within(dialog).getByRole("switch", { name: "Snap to screens and components" })).not.toBeChecked()
    await expect(
      within(dialog).getByRole("button", { name: "Use every project's snap to screens and components" })
    ).toBeInTheDocument()
    await expect(within(dialog).queryByRole("button", { name: "Diagnostics" })).not.toBeInTheDocument()
  }
}

/** Parity's own settings for every project, with dropdowns for every choice. */
export const General: Story = {
  render: () => <Demo initialPage="general" initialValues={{ autosave: true }} />
}

/** One setting for export sizes, which Export images and each new layer's Export section both use. */
export const Export: Story = {
  render: () => <Demo initialPage="export" />
}

/** Feature flags, to try what isn't finished yet. */
export const Experiments: Story = {
  render: () => <Demo initialPage="experiments" />
}

/** The install ID is Parity's, so it shows as text to copy. */
export const Diagnostics: Story = {
  render: () => <Demo initialPage="diagnostics" />
}

/** Diagnostics when `PARITY_TELEMETRY` decides it, which wins over the setting. */
export const DiagnosticsSetByEnvironment: Story = {
  render: () => (
    <Demo initialPage="diagnostics" initialValues={{ telemetry: "off" }} locked={{ telemetry: "PARITY_TELEMETRY" }} />
  )
}

/** Shortcuts, with the file that changes them until they can be changed here. */
export const KeyboardShortcuts: Story = {
  render: () => <Demo initialPage="shortcuts" />
}

/**
 * An extension's page, in Extensions: what detection found, whether it's running, when it started, what it costs, its
 * settings, what it adds and what it may do. There's no switch: built-in extensions run whenever their tool is found.
 */
export const ExtensionPage: Story = {
  render: () => <Demo initialPage="ext:storybook" />,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Settings" })

    await expect(within(dialog).getByRole("switch", { name: "Change designs, for Storybook" })).toBeChecked()
  }
}

/** The same extension's page for Kestrel: its project settings, and none of the person's. */
export const ExtensionInProject: Story = {
  render: () => <Demo initialView="project" initialPage="ext:storybook" initialProject={{ "storybook.port": 6007 }} />
}

/** An extension whose tool isn't in the project. */
export const ExtensionNotRunning: Story = {
  render: () => <Demo initialPage="ext:next" />
}

/** The Extensions page with the six Parity has today. */
export const Extensions: Story = {
  render: () => <Demo initialPage="extensions" />
}

/**
 * Forty extensions installed. The sidebar keeps one Extensions page however many there are; the page lists those
 * running in Kestrel first, and the filter finds the rest.
 */
export const FortyExtensions: Story = {
  render: () => <Demo initialPage="extensions" extensions={manyExtensions} />,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Settings" })
    const filter = within(dialog).getByRole("textbox", { name: "Filter extensions" })

    await userEvent.type(filter, "pre")
    await expect(within(dialog).getByRole("button", { name: /Prettier/ })).toBeInTheDocument()
    await userEvent.clear(filter)
  }
}

/**
 * Search results: pages and extensions by name as links, then each matching setting with where it is, whose value it
 * changes and its control. A setting found by another word for it says which. Down from the search moves through the
 * results; Enter goes to the first in its page. Escape clears the search before it closes Settings.
 */
export const SearchResults: Story = {
  render: () => <Demo initialQuery="story" />,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Settings" })

    await expect(within(dialog).getByRole("heading", { name: "Results for “story”" })).toBeInTheDocument()
    await expect(within(dialog).getByRole("textbox", { name: "Config folder" })).toHaveValue(".storybook")
  }
}

/** A search that finds a setting by another word for it: "dark" finds Theme. */
export const SearchByKeyword: Story = {
  render: () => <Demo initialQuery="dark" />
}

interface Picked {
  page: string
  setting?: string
  view?: View
}

/** Where picking a hit in Search actions opens Settings. */
function pickOf(hit: Hit): Picked {
  if (hit.kind === "setting") {
    return { page: hit.setting.page, setting: hit.setting.id, view: shownIn(hit.setting, "app") ? "app" : "project" }
  }

  return { page: hit.kind === "page" ? hit.page.id : `ext:${hit.extension.id}` }
}

function HitItem({ hit, onPick }: { hit: Hit; onPick: () => void }) {
  if (hit.kind === "setting") {
    return (
      <CommandItem value={hit.setting.id} onSelect={onPick}>
        <Settings className="text-muted-foreground" aria-hidden />
        <span className="truncate">{hit.setting.label}</span>
        <CommandShortcut>{placeOf(hit.setting, extensions).join(" › ")}</CommandShortcut>
      </CommandItem>
    )
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
          initialView={picked.view}
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
 * Picking a setting in Search actions opens Settings on its page, in whichever view has it, with the setting marked and
 * its control focused. Closing Settings comes back to the search.
 */
export const FromSearchActions: Story = {
  render: () => <SearchActionsDemo />,
  play: async () => {
    await userEvent.click(await screen.findByRole("option", { name: /Config folder/ }))
    const dialog = await screen.findByRole("dialog", { name: "Settings" })

    await expect(within(dialog).getByRole("heading", { name: "Storybook" })).toBeInTheDocument()
  }
}
