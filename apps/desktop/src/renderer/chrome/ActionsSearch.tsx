import { useState } from "react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "@/components/ui/command"
import { type Action, actions } from "./actions.ts"
import { closeDialog, openDialog, useOpenDialog } from "./app-dialogs.ts"
import { exportImages } from "./commands.ts"
import { type Command as KeyCommand, type Group, groups, keymap } from "./keymap.ts"
import { getPreferences, setPreferences } from "./preferences.ts"

interface Item extends Action {
  id: string
  label: string
  group: Group
  keys?: string
}

/** What the menus offer that has no shortcut, so the search finds those too. */
const extras: Item[] = [
  { id: "exportAll", group: "File", label: "Export all designs", run: () => exportImages("all") },
  {
    id: "snapping",
    group: "View",
    label: "Snap to designs",
    run: () => setPreferences({ snapping: !getPreferences().snapping })
  },
  {
    id: "performanceStats",
    group: "View",
    label: "Performance stats",
    run: () => setPreferences({ performanceStats: !getPreferences().performanceStats })
  },
  { id: "about", group: "Help", label: "About Parity", run: () => openDialog("about") }
]

/** Every action by name, as Figma's actions menu: Ctrl+K or Ctrl+/, or Help > Search actions. */
export function ActionsSearch() {
  const open = useOpenDialog() === "actions"
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
  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => !next && closeDialog()}
      title="Search actions"
      description="Search for an action to run"
    >
      <Command>
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search actions" />
        <CommandList className="max-h-96">
          <CommandEmpty>No action matches.</CommandEmpty>
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
                    {item.keys && <CommandShortcut>{item.keys}</CommandShortcut>}
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
