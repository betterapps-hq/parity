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
import { pageOf, settings } from "./data.ts"
import { SettingsModal, type SettingsModalProps } from "./modal.tsx"
import { search } from "./search.ts"

/**
 * One Settings view for every setting, from the person's own for every project to this project's and each
 * extension's (PAR-1081). Pages sit in a sidebar with a search above them; each setting says whose it is. Main owns the
 * view and it loads no project code, so it's the only place app settings and permission grants change. A change to a
 * project setting goes to the editor window as an undo step. Not in the app yet.
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

/** Parity's own settings for every project: theme, saving and the code editor, with a way to the shortcuts. */
export const AppPage: Story = {
  render: () => <Demo initialPage="general" initialValues={{ autosave: true }} />,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Settings" })
    await expect(within(dialog).getByRole("button", { name: "General" })).toHaveAttribute("aria-current", "page")
    await expect(within(dialog).getByRole("switch", { name: "Save automatically" })).toBeChecked()
  }
}

/** This project's settings in one place, grouped by the extension that declares each. Changes are undo steps. */
export const ProjectPage: Story = {
  render: () => <Demo initialPage="project" initialValues={{ "storybook.port": 6007 }} />,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Settings" })
    await expect(within(dialog).getByRole("textbox", { name: "Routes folder" })).toHaveValue("src/routes")
  }
}

/**
 * An extension's page: what it adds, what detection found, whether it's running, what it may do and what it costs, and
 * its settings, each marked as this project's or every project's. There's no switch: built-in extensions run whenever
 * their tool is found.
 */
export const ExtensionPage: Story = {
  render: () => <Demo initialPage="ext:storybook" />,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Settings" })
    await expect(within(dialog).getByRole("switch", { name: "Change designs, for Storybook" })).toBeChecked()
  }
}

/** An extension whose tool isn't in the project: listed, not running, with nothing to set. */
export const ExtensionNotRunning: Story = {
  render: () => <Demo initialPage="ext:next" />
}

/** Every extension at a glance, from the Extensions page. */
export const Extensions: Story = {
  render: () => <Demo initialPage="extensions" />
}

/**
 * Typing in the sidebar's search shows matching settings from every page, live, with their pages above them. Enter
 * goes to the first; Escape clears the search before it closes Settings.
 */
export const SearchResults: Story = {
  render: () => <Demo initialQuery="theme" />,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Settings" })
    await expect(within(dialog).getByRole("heading", { name: "Results for “theme”" })).toBeInTheDocument()
    await expect(within(dialog).getByRole("textbox", { name: "Theme stylesheet" })).toBeInTheDocument()
  }
}

/** Diagnostics when `PARITY_TELEMETRY` decides it, which wins over the setting. */
export const DiagnosticsSetByEnvironment: Story = {
  render: () => (
    <Demo initialPage="privacy" initialValues={{ telemetry: "off" }} locked={{ telemetry: "PARITY_TELEMETRY" }} />
  )
}

function SearchActionsDemo() {
  const [query, setQuery] = useState("story")
  const [picked, setPicked] = useState<{ page: string; setting?: string }>()
  const hits = search(query)
  const pageHits = hits.filter((hit) => !hit.setting)
  const settingHits = hits.filter((hit) => hit.setting)

  return (
    <div className="min-h-screen bg-[#0c0c0f]">
      <CommandDialog open={!picked} onOpenChange={() => undefined} title="Search actions" className="sm:max-w-lg">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search actions, layers, components…" />
          <CommandList className="mt-1 max-h-96">
            {pageHits.length > 0 && (
              <CommandGroup heading="Settings pages">
                {pageHits.map((hit) => {
                  const page = pageOf(hit.page)

                  return (
                    <CommandItem key={hit.page} value={hit.page} onSelect={() => setPicked(hit)}>
                      <page.icon className="text-muted-foreground" aria-hidden />
                      <span className="truncate">{page.label}</span>
                      <CommandShortcut>Settings</CommandShortcut>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
            {settingHits.length > 0 && (
              <CommandGroup heading="Settings">
                {settingHits.map((hit) => {
                  const setting = settings.find((entry) => entry.id === hit.setting)!
                  const page = pageOf(hit.page)

                  return (
                    <CommandItem key={setting.id} value={setting.id} onSelect={() => setPicked(hit)}>
                      <Settings className="text-muted-foreground" aria-hidden />
                      <span className="truncate">{setting.label}</span>
                      <CommandShortcut>{page.label}</CommandShortcut>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
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

/**
 * Search actions finds Settings pages by name and settings by label. Picking one opens Settings on its page, with the
 * setting marked and its control focused. Closing Settings comes back to the search.
 */
export const FromSearchActions: Story = {
  render: () => <SearchActionsDemo />,
  play: async () => {
    await userEvent.click(await screen.findByRole("option", { name: /Open stories in/ }))
    const dialog = await screen.findByRole("dialog", { name: "Settings" })
    await expect(within(dialog).getByRole("heading", { name: "Storybook" })).toBeInTheDocument()
  }
}

/** Search actions with Settings pages and settings among its results, before one is picked. */
export const SearchActions: Story = {
  render: () => <SearchActionsDemo />
}
