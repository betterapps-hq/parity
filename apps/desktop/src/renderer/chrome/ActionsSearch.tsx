import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  Kbd
} from "@buildkitgg/shadcn-baseui-kit"
import { designOwner, locateNode, type NodeRef } from "@parity-app/core"
import { type FindItem, findAnything, layersSelection, rememberPick } from "@parity-app/editor"
import { FolderOpen, Palette } from "lucide-react"
import { type ReactNode, useLayoutEffect, useRef, useState } from "react"
import { z } from "zod"
import { DesignIcon, designColor, layerLabel, nodeColor, NodeIcon } from "../canvas/kinds.tsx"
import { projectNodes } from "../project-nodes.ts"
import { resetWithWindow } from "../store.ts"
import {
  type ProjectSession,
  useActiveTabId,
  useHomeActive,
  useKnownProjects,
  useTabs,
  workspace
} from "../workspace.ts"
import { type ActionResult, actions, commandsFor } from "./actions.ts"
import { runAction, selectionComponent } from "./adapter-actions.ts"
import { AdapterLogo } from "./AdapterLogo.tsx"
import { closeDialog, openDialog, useOpenDialog } from "./app-dialogs.ts"
import { activeSession, clearBitmapCache, exportAllImages, selectedDesign } from "./commands.ts"
import { type Command as KeyCommand, type Group, groups, keymap, shortcutOf } from "./keymap.ts"
import { setLayout } from "./layout.ts"
import { Name } from "./Name.tsx"
import { getPreferences, setPreferences } from "./preferences.ts"
import { insertOption, offerOf } from "./QuickInsert.tsx"
import { rememberAction } from "./repeat.ts"
import { findRepeatedParts } from "./repeated-parts.ts"
import { revealSelection } from "./reveal.ts"
import { showToken } from "./shown-token.ts"

type Heading = Group | "Designs" | "Layers" | "Components" | "Tokens" | "Projects"

interface Item extends FindItem<Heading> {
  run(): ActionResult
  available?(): boolean
  /** Shown at the end of the row: an action's keys, a layer's design, a component's source. */
  detail?: string
  /** An action's keys, as `shortcutOf` writes them. */
  keys?: string
  icon?: ReactNode
}

/** The groups whose rows are names, which show in the letters names take everywhere (`<Name>`). */
const named = new Set<Heading>(["Designs", "Layers", "Components", "Projects"])

/** At most this many of each of these while searching, as there can be thousands. */
const limits = { Layers: 8, Components: 6, Tokens: 6, Designs: 6 }

/** What the menus and panels offer that has no shortcut, so the search finds those too. */
const extras: Item[] = [
  { id: "action:exportAll", group: "File", label: "Export all", run: () => exportAllImages() },
  {
    id: "action:snapping",
    group: "View",
    label: "Snap to screens and components",
    run: () => setPreferences({ snapping: !getPreferences().snapping })
  },
  {
    id: "action:performanceStats",
    group: "View",
    label: "Performance stats",
    run: () => setPreferences({ performanceStats: !getPreferences().performanceStats })
  },
  {
    id: "action:clearBitmapCache",
    group: "View",
    label: "Clear bitmap cache",
    run: () => void clearBitmapCache()
  },
  ...(["icons", "media", "tokens"] as const).map((tab): Item => ({
    id: `action:show-${tab}`,
    group: "View",
    label: `Show ${tab[0]!.toUpperCase()}${tab.slice(1)}`,
    run: () => setLayout({ left: true, leftTab: tab })
  })),
  {
    id: "action:findRepeatedParts",
    group: "Object",
    label: "Find repeated parts",
    available: () => selectedScreen() !== undefined,
    run: () => {
      rememberAction({
        label: "Find repeated parts",
        run: findInSelectedScreen,
        available: () => !!selectedScreen()
      })
      findInSelectedScreen()
    }
  },
  { id: "action:about", group: "Help", label: "About Parity", run: () => openDialog("about") }
]

/** The selected screen, on its own, which Find repeated parts looks in. */
const selectedScreen = () => {
  const entry = selectedDesign()
  // Components and frames have no Repeated parts section; a design with no kind is a screen.
  const screen = entry && (entry.container.kind ?? "screen") === "screen"

  return screen && !activeSession()?.selection.get().node ? entry : undefined
}

/** Inserts a component again in the active tab's project, through its offer as it stands now. */
function repeatInsert(key: string): void {
  const session = activeSession()

  if (session) {
    insertOption(session, offerOf(session.info, session.store.getEntries()), key)
  }
}

/** Finds the repeated parts in the selected screen and shows them in the inspector. */
function findInSelectedScreen(): void {
  const entry = selectedScreen()
  const session = activeSession()

  if (!entry || !session) {
    return
  }

  setLayout({ right: true, rightTab: "design" })
  findRepeatedParts(session.info.root, entry)
}

/** Whether there's more of the list above and below what shows. */
interface Edges {
  top: boolean
  bottom: boolean
}

function scrolledEdges(list: HTMLElement): Edges {
  return { top: list.scrollTop > 0, bottom: list.scrollTop + list.clientHeight < list.scrollHeight - 1 }
}

/**
 * Rows fade out at an edge with more beyond it, so a highlighted row scrolled half out of view doesn't look cut off by,
 * or tucked under, the search field.
 */
function edgeFade({ top, bottom }: Edges): string | undefined {
  if (!top && !bottom) {
    return undefined
  }

  return `linear-gradient(to bottom, ${top ? "transparent, black 1.5rem" : "black"}, ${bottom ? "black calc(100% - 1.5rem), transparent" : "black"})`
}

const recentKey = "parity.recentSearches"

/** What's saved as recent: a list of IDs, where anything that isn't one is skipped rather than losing the rest. */
const recentPicks = z.array(z.string().nullable().catch(null)).catch([])

function readRecent(): string[] {
  try {
    const saved = recentPicks.parse(JSON.parse(localStorage.getItem(recentKey) ?? "[]"))

    return saved.filter((id) => id !== null)
  } catch {
    // Storage can be unavailable, or hold something else; nothing's recent then.
    return []
  }
}

// Nothing picked yet, as a first run starts, so each story starts from nothing picked.
resetWithWindow(() => saveRecent([]))

function saveRecent(recent: readonly string[]): void {
  try {
    localStorage.setItem(recentKey, JSON.stringify(recent))
  } catch {
    // Storage can be unavailable; the picks are then forgotten.
  }
}

/**
 * Every action in the keymap that the search can run, with its first keys, named and available as the menus have them
 * now. The keymap's name finds it too, so Hide or show is found as Show.
 */
function commandItems(): Item[] {
  const states = commandsFor()

  // SAFETY: the keymap has an entry for every command, so its own keys are the commands.
  return (Object.keys(keymap) as KeyCommand[])
    .filter((id) => id !== "actions" && !actions[id].byKey)
    .map((id) => ({
      id: `action:${id}`,
      group: keymap[id].group,
      label: states[id].label,
      keywords: `${keymap[id].group} ${keymap[id].label}`,
      keys: shortcutOf(id),
      run: () => actions[id].run("search"),
      available: () => states[id].enabled
    }))
}

/** The open project's designs, their layers, the components it can insert and its tokens. */
function projectItems(session: ProjectSession): Item[] {
  const entries = session.store.getEntries()
  const library = session.store.getComponentLibrary()
  const items: Item[] = []

  for (const entry of entries) {
    items.push({
      id: `design:${entry.key}`,
      group: "Designs",
      label: entry.container.name,
      keywords: entry.container.kind ?? "screen",
      icon: <DesignIcon kind={entry.container.kind} style={{ color: designColor(entry.container.kind) }} />,
      run: () => {
        session.selection.set({ design: entry.key })
        void actions.zoomToSelection.run("search")
      }
    })
  }

  // Every design's layers, from the project's nodes, depth first under each design's root.
  const nodes = projectNodes(session, { fresh: true })

  for (const design of nodes.ofType("design", { owner: designOwner })) {
    const entry = session.store.getEntry(design.ref.key)

    if (!entry) {
      continue
    }

    const visit = (ref: NodeRef) => {
      for (const child of nodes.children(ref)) {
        const id = child.ref.key.slice(entry.key.length + 1)
        const node = locateNode(entry.container.root, id)?.node

        if (node) {
          items.push({
            id: `layer:${entry.key}/${node.id}`,
            group: "Layers",
            label: layerLabel(node, entries, library, session.info.libraries),
            keywords: entry.container.name,
            detail: entry.container.name,
            searchOnly: true,
            // The search is drawn outside the project's tab, so its icons are told which libraries are icon sets.
            icon: <NodeIcon node={node} libraries={session.info.libraries} style={{ color: nodeColor(node) }} />,
            run: () => {
              session.selection.set(layersSelection(entry.key, [node.id]))
              // The layer's frame lays out first, then it's scrolled into view.
              requestAnimationFrame(() => revealSelection(session))
            }
          })
        }

        visit(child.ref)
      }
    }

    // The root is the design itself, so its layers start below it.
    for (const root of nodes.children(design.ref)) {
      visit(root.ref)
    }
  }

  const offer = offerOf(session.info, entries)

  for (const option of offer.options) {
    if (option.origin === "basic" || option.hidden) {
      continue
    }

    items.push({
      id: `component:${option.key}`,
      group: "Components",
      label: option.name,
      keywords: `${option.sourceName} ${option.description ?? ""}`,
      detail: option.sourceName,
      searchOnly: true,
      run: () => {
        rememberAction({
          label: `Insert ${option.name}`,
          run: () => repeatInsert(option.key),
          // Only in this project's tab: another project has its own selection, and may not have the component.
          available: () => activeSession()?.info.root === session.info.root
        })
        insertOption(session, offer, option.key)
      }
    })
  }

  for (const token of session.tokens.inOrder()) {
    items.push({
      id: `token:${token.name}`,
      group: "Tokens",
      label: `--${token.name}`,
      keywords: token.category,
      detail: token.values.default,
      searchOnly: true,
      icon: <Palette className="text-muted-foreground" />,
      run: () => showToken(session.info.root, token.name)
    })
  }

  return items
}

/**
 * What the project's adapters can do, under Object: each for the selected component when it's offered for it, as Open
 * in Storybook on a component with stories, with the component's name beside it; greyed with why on a selected
 * component it isn't for, as No story found; and for the whole project with no component selected, as opening
 * Storybook's home.
 */
function adapterItems(session: Pick<ProjectSession, "id" | "info" | "selection" | "store">): Item[] {
  const component = selectionComponent(session)

  return session.info.actions.map((action) => {
    const offered = component !== undefined && action.components?.includes(component) ? component : undefined
    const unavailable = component !== undefined && !offered && action.components ? action.unavailable : undefined

    return {
      id: `adapter:${action.adapter}:${action.id}`,
      group: "Object",
      label: action.name,
      detail: unavailable ?? offered,
      icon: <AdapterLogo logo={action.icon} />,
      available: () => unavailable === undefined,
      run: () => void runAction(session.id, action, offered)
    }
  })
}

/** Everything the search can find now: the actions, the active project's contents and the remembered projects. */
function gatherItems(session: ProjectSession | undefined, projects: readonly { root: string; name: string }[]): Item[] {
  return [
    ...commandItems(),
    ...extras,
    ...(session ? [...adapterItems(session), ...projectItems(session)] : []),
    ...projects.map((project): Item => ({
      id: `project:${project.root}`,
      group: "Projects",
      label: project.name,
      keywords: project.root,
      detail: project.root,
      icon: <FolderOpen className="text-muted-foreground" />,
      run: () => void workspace.open(project.root)
    }))
  ]
}

/**
 * Finds anything from one search (PAR-180): Ctrl+K or Ctrl+/, or Help > Search actions. It lists every action by name,
 * as Figma's actions menu, and the projects the window remembers; with a project open, its designs, and once something's
 * typed, their layers, the components it can insert and its tokens. What was picked lately comes first. What's typed
 * matches the start of words (`matchWords`); `findAnything` ranks and groups the matches. Projects come first on Home
 * and in a new tab, where opening one is what you're there for, and last in a project.
 */
export function ActionsSearch() {
  const open = useOpenDialog() === "actions"
  const projects = useKnownProjects()
  const tabs = useTabs()
  const activeId = useActiveTabId()
  const starting = useHomeActive() || !!tabs.find((tab) => tab.id === activeId)?.blank
  const [query, setQuery] = useState("")
  const [recent, setRecent] = useState(readRecent)
  const [scrolled, setScrolled] = useState<Edges>({ top: false, bottom: false })
  // Each time it opens it starts empty, even if keys reached the search while it was closing.
  const [wasOpen, setWasOpen] = useState(open)
  // Gathered once each time it opens, as what's in the project can't change while it's open, and kept while it closes
  // so its rows stay put as it fades.
  const [items, setItems] = useState(() => (open ? gatherItems(activeSession(), projects) : []))

  if (open !== wasOpen) {
    setWasOpen(open)

    if (open) {
      setQuery("")
      setRecent(readRecent())
      setItems(gatherItems(activeSession(), projects))
    }
  }

  const order: Heading[] = starting
    ? ["Projects", "Designs", "Layers", ...groups, "Components", "Tokens"]
    : ["Designs", "Layers", ...groups, "Components", "Tokens", "Projects"]

  const found = findAnything(items, query, { recent, groups: order, limits })
  // A new search lists other rows from the top, so the edges are measured again once they're drawn.
  const list = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (list.current) {
      setScrolled(scrolledEdges(list.current))
    }
  }, [query, items])

  const run = (item: Item) => {
    closeDialog()
    const next = rememberPick(recent, item.id)
    setRecent(next)
    saveRecent(next)
    void item.run()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => !next && closeDialog()}
      title="Search"
      description="Find an action to run, or a project, design, layer, component or token."
      className="sm:max-w-lg"
    >
      <Command shouldFilter={false}>
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search actions, layers, components…" />
        <CommandList
          className="mt-1 max-h-96"
          style={{ maskImage: edgeFade(scrolled) }}
          ref={list}
          onScroll={(event) => setScrolled(scrolledEdges(event.currentTarget))}
        >
          <CommandEmpty>Nothing matches.</CommandEmpty>
          {found.map(({ group, items: listed }) => (
            <CommandGroup key={group} heading={group}>
              {listed.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  disabled={item.available?.() === false}
                  onSelect={() => run(item)}
                >
                  {item.icon}
                  {/* By the item's own group, so a name under Recent shows in a name's letters too. */}
                  {named.has(item.group) ? <Name>{item.label}</Name> : <span className="truncate">{item.label}</span>}
                  {item.keys ? (
                    <CommandShortcut>
                      <Kbd>{item.keys}</Kbd>
                    </CommandShortcut>
                  ) : (
                    item.detail && (
                      // The kit's slot for what ends a row, which also keeps its check mark from taking the space.
                      <CommandShortcut data-words className="max-w-1/2 truncate">
                        {item.detail}
                      </CommandShortcut>
                    )
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
