import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "@buildkitgg/shadcn-baseui-kit"
import { useState } from "react"
import { useHomeActive, useKnownProjects, useTabs, useActiveTabId, workspace } from "../workspace.ts"
import { type Action, actions } from "./actions.ts"
import { closeDialog, openDialog, useOpenDialog } from "./app-dialogs.ts"
import { clearBitmapCache, exportImages } from "./commands.ts"
import { type Command as KeyCommand, type Group, groups, keymap } from "./keymap.ts"
import { formatKeys } from "./keys.ts"
import { getPreferences, setPreferences } from "./preferences.ts"
import { matchWords } from "./word-match.ts"

interface Item extends Action {
  id: string
  label: string
  group: Group
  keys?: string
}

/** What the menus offer that has no shortcut, so the search finds those too. */
const extras: Item[] = [
  { id: "exportAll", group: "File", label: "Export all", run: () => exportImages("all") },
  {
    id: "snapping",
    group: "View",
    label: "Snap to screens and components",
    run: () => setPreferences({ snapping: !getPreferences().snapping })
  },
  {
    id: "performanceStats",
    group: "View",
    label: "Performance stats",
    run: () => setPreferences({ performanceStats: !getPreferences().performanceStats })
  },
  { id: "clearBitmapCache", group: "View", label: "Clear bitmap cache", run: () => void clearBitmapCache() },
  { id: "about", group: "Help", label: "About Parity", run: () => openDialog("about") }
]

/**
 * Every action by name, as Figma's actions menu, and the projects the window remembers: Ctrl+K or Ctrl+/, or Help >
 * Search actions. What's typed matches the start of words in a name or its group (`matchWords`). Projects come first
 * on Home and in a new tab, where opening one is what you're there for, and last in a project.
 */
export function ActionsSearch() {
  const open = useOpenDialog() === "actions"
  const projects = useKnownProjects()
  const tabs = useTabs()
  const activeId = useActiveTabId()
  const starting = useHomeActive() || !!tabs.find((tab) => tab.id === activeId)?.blank
  const [query, setQuery] = useState("")
  // Each time it opens it starts empty, even if keys reached the search while it was closing.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setQuery("")
  }
  const items: Item[] = [
    ...(Object.keys(keymap) as KeyCommand[])
      .filter((id) => id !== "actions" && !actions[id].byKey)
      .map((id) => ({ id, ...keymap[id], keys: keymap[id].keys[0], ...actions[id] })),
    ...extras
  ]
  const run = (item: Item) => {
    closeDialog()
    void item.run()
  }
  const projectGroup = projects.length > 0 && (
    <CommandGroup heading="Projects">
      {projects.map((project) => (
        <CommandItem
          key={project.root}
          value={`${project.name} Projects ${project.root}`}
          onSelect={() => {
            closeDialog()
            void workspace.open(project.root)
          }}
        >
          <span className="truncate">{project.name}</span>
          <span className="ml-auto max-w-1/2 truncate text-xs text-muted-foreground">{project.root}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  )
  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => !next && closeDialog()}
      title="Search"
      description="Find a project to open or an action to run."
    >
      <Command filter={matchWords}>
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search projects and actions" />
        <CommandList className="max-h-96">
          <CommandEmpty>Nothing matches.</CommandEmpty>
          {starting && projectGroup}
          {groups.map((group) => (
            <CommandGroup key={group} heading={group}>
              {items
                .filter((item) => item.group === group)
                .map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.label} ${item.group} ${item.id}`}
                    disabled={item.available?.() === false}
                    onSelect={() => run(item)}
                  >
                    {item.label}
                    {item.keys && <CommandShortcut>{formatKeys(item.keys)}</CommandShortcut>}
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
          {!starting && projectGroup}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
