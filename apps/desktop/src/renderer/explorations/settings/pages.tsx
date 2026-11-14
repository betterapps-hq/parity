import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
  Switch
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronRight, Plus } from "lucide-react"
import type { KeyboardEvent, ReactNode } from "react"
import { type Extension, pages, project, type Setting, settings, version } from "./data.ts"
import { Group, Row, SettingRow } from "./rows.tsx"
import { type Hit, type Place, placeOf, search } from "./search.ts"
import { ShortcutRow } from "./shortcuts.tsx"
import { type Store, valueText } from "./store.ts"

/** Up and down move between the items a selector finds, as in a list; Tab leaves the list. */
export function arrows(event: KeyboardEvent<HTMLElement>, selector: string) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return
  }

  const items = [...document.querySelectorAll<HTMLElement>(selector)]
  const at = items.indexOf(event.currentTarget)

  event.preventDefault()
  items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus()
}

/** Settings in their groups, in the order each group first comes. */
function grouped(list: readonly Setting[]): { title?: string; items: Setting[] }[] {
  const titles = [...new Set(list.map((setting) => setting.group))]

  return titles.map((title) => ({ title, items: list.filter((setting) => setting.group === title) }))
}

/** One of Parity's own pages: its settings in their groups, each group a panel. */
export function SettingsPage({ page, store }: { page: string; store: Store }) {
  const onPage = settings.filter((setting) => setting.page === page && setting.scope !== "project")
  const sections = grouped(onPage)
  const titled = sections.length > 1

  return sections.map((section, index) => (
    <Group key={section.title ?? index} title={titled ? section.title : undefined}>
      {page === "updates" && index === 0 && (
        <Row label="Version" detail={`Parity ${version}`}>
          <Button variant="outline" size="sm">
            Check for updates
          </Button>
        </Row>
      )}
      {section.items.map((setting) => (
        <SettingRow key={setting.id} setting={setting} store={store} />
      ))}
    </Group>
  ))
}

/**
 * The project's page: everything saved in its file. First, the person's settings it changes for itself, each with every
 * project's value under it, and a menu to change another; then each extension's settings for the project.
 */
export function ProjectPage({ store }: { store: Store }) {
  const changed = store.overrides.flatMap((id) => settings.filter((setting) => setting.id === id))
  const addable = settings.filter((setting) => setting.scope === "either" && !store.overrides.includes(setting.id))

  const owned = store.extensions.flatMap((extension) => {
    const own = settings.filter((setting) => setting.page === `ext:${extension.id}` && setting.scope === "project")

    return extension.running && own.length > 0 ? [{ extension, own }] : []
  })

  return (
    <>
      <Group title={`Changed for ${project.name}`}>
        {changed.map((setting) => (
          <SettingRow key={setting.id} setting={setting} store={store} forProject />
        ))}
        {addable.length > 0 && <AddChange addable={addable} store={store} />}
      </Group>
      {owned.map(({ extension, own }) => (
        <Group key={extension.id} title={extension.name} icon={<extension.icon className="size-3.5" />}>
          {own.map((setting) => (
            <SettingRow key={setting.id} setting={setting} store={store} />
          ))}
        </Group>
      ))}
    </>
  )
}

/**
 * Starts the project changing one of the person's settings for itself. A switch starts at the other value, since that's
 * the only change there is; anything else starts at every project's, focused to pick another.
 */
function AddChange({ addable, store }: { addable: Setting[]; store: Store }) {
  return (
    <div className="px-2 py-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" />}
        >
          <Plus aria-hidden /> Change a setting for {project.name}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuGroup>
            {addable.map((setting) => {
              const mine = store.mine(setting)

              return (
                <DropdownMenuItem
                  key={setting.id}
                  onClick={() => {
                    store.setTheirs(setting, setting.control.kind === "switch" ? mine !== true : mine)
                    store.go("project", setting.id)
                  }}
                >
                  <span className="flex-1 truncate">{setting.label}</span>
                  <span className="text-muted-foreground">{valueText(setting, mine)}</span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Every extension installed, those running in the project first. Search finds one by name when there are many. */
export function ExtensionsPage({ store }: { store: Store }) {
  const running = store.extensions.filter((extension) => extension.running)
  const idle = store.extensions.filter((extension) => !extension.running)

  return (
    <>
      {running.length > 0 && (
        <Group title={`Running in ${project.name}`}>
          {running.map((extension) => (
            <ExtensionRow key={extension.id} extension={extension} store={store} />
          ))}
        </Group>
      )}
      {idle.length > 0 && (
        <Group title="Not running">
          {idle.map((extension) => (
            <ExtensionRow key={extension.id} extension={extension} store={store} />
          ))}
        </Group>
      )}
    </>
  )
}

/** An extension in a list, which opens its page: its logo, its name and what detection found. */
function ExtensionRow({ extension, store, result = false }: { extension: Extension; store: Store; result?: boolean }) {
  const selector = result ? "[data-result]" : "[data-extension]"

  return (
    <button
      type="button"
      data-extension={result ? undefined : ""}
      data-result={result ? "" : undefined}
      onClick={() => store.go(`ext:${extension.id}`)}
      onKeyDown={(event) => arrows(event, selector)}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
    >
      <Logo extension={extension} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{extension.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{extension.found}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}

function Logo({ extension, large = false }: { extension: Extension; large?: boolean }) {
  const Icon = extension.icon

  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center border bg-background/60 ${large ? "size-12 rounded-xl" : "size-8 rounded-lg"} ${
        extension.running ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      <Icon className={large ? "size-6" : "size-4"} />
    </span>
  )
}

/**
 * An extension's page: what detection found and whether it runs in the project, then its settings (the project's
 * tagged), what it may do, with a switch for each permission Parity's API grants, what it adds, and what it costs.
 * There's no on and off: built-in extensions run whenever their tool is found.
 */
export function ExtensionPage({
  extension,
  grants,
  setGrants,
  store
}: {
  extension: Extension
  grants: Record<string, boolean>
  setGrants: (grants: Record<string, boolean>) => void
  store: Store
}) {
  const own = settings.filter((setting) => setting.page === `ext:${extension.id}`)

  return (
    <>
      <div className="flex items-center gap-4 pb-2">
        <Logo extension={extension} large />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{extension.found}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${extension.running ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
            />
            {extension.running ? `Running in ${project.name}` : "Not running"}
          </p>
        </div>
      </div>
      {own.length > 0 && (
        <Group title="Settings">
          {own.map((setting) => (
            <SettingRow key={setting.id} setting={setting} store={store} tagged />
          ))}
        </Group>
      )}
      <Group title="Permissions">
        {extension.permissions.map((permission) => {
          const key = `${extension.id}:${permission.label}`

          return permission.grant ? (
            <Row key={permission.label} label={permission.label} detail={permission.detail}>
              <Switch
                checked={grants[key] ?? true}
                onCheckedChange={(granted) => setGrants({ ...grants, [key]: granted })}
                aria-label={`${permission.label}, for ${extension.name}`}
              />
            </Row>
          ) : (
            <Row key={permission.label} label={permission.label} wide>
              <code className="truncate font-mono text-xs text-muted-foreground">{permission.detail}</code>
            </Row>
          )
        })}
      </Group>
      {extension.adds.length > 0 && (
        <Group title="Adds">
          {extension.adds.map((item) => (
            <div key={item} className="px-4 py-2.5 text-sm font-medium">
              {item}
            </div>
          ))}
        </Group>
      )}
      {extension.activation && (
        <Group title="Performance">
          <Fact label="Started">{extension.activation.event}</Fact>
          <Fact label="Activation time">{extension.activation.ms} ms</Fact>
          <Fact label="Memory">{extension.memoryMb} MB</Fact>
        </Group>
      )}
    </>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Row label={label}>
      <span className="text-sm text-muted-foreground tabular-nums">{children}</span>
    </Row>
  )
}

type SettingHit = Extract<Hit, { kind: "setting" }>

/**
 * Search results: pages and extensions by name, to go to; then settings, in a group for each place they're in, each
 * with its control, to change it here; then shortcuts, to change their keys here. A result's name goes to it.
 */
export function Results({ query, store, onClear }: { query: string; store: Store; onClear: () => void }) {
  const hits = search(query, store.extensions)

  if (hits.length === 0) {
    return (
      <Empty className="mt-16">
        <EmptyHeader>
          <EmptyTitle>No settings match “{query.trim()}”</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear search
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const pageHits = hits.flatMap((hit) => (hit.kind === "page" ? [hit.page] : []))
  const extensionHits = hits.flatMap((hit) => (hit.kind === "extension" ? [hit.extension] : []))
  const shortcutHits = hits.flatMap((hit) => (hit.kind === "shortcut" ? [hit.command] : []))
  const places = new Map<string, { place: Place; hits: SettingHit[] }>()

  for (const hit of hits) {
    if (hit.kind !== "setting") {
      continue
    }

    const place = placeOf(hit.setting, store.extensions)
    const entry = places.get(place.id) ?? { place, hits: [] }

    entry.hits.push(hit)
    places.set(place.id, entry)
  }

  return (
    <>
      {pageHits.length > 0 && (
        <Group title="Pages">
          {pageHits.map((page) => (
            <button
              key={page.id}
              type="button"
              data-result
              onClick={() => store.go(page.id)}
              onKeyDown={(event) => arrows(event, "[data-result]")}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
            >
              <page.icon className="size-4 text-muted-foreground" />
              <span className="flex-1 truncate">{page.label}</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </Group>
      )}
      {extensionHits.length > 0 && (
        <Group title="Extensions">
          {extensionHits.map((extension) => (
            <ExtensionRow key={extension.id} extension={extension} store={store} result />
          ))}
        </Group>
      )}
      {[...places.values()].map(({ place, hits: found }) => (
        <Group key={place.id} title={place.label} icon={<place.icon className="size-3.5" />}>
          {found.map((hit) => (
            <SettingRow
              key={hit.setting.id}
              setting={hit.setting}
              store={store}
              found={{ query, keyword: hit.keyword }}
              tagged
            />
          ))}
        </Group>
      ))}
      {shortcutHits.length > 0 && <ShortcutResults commands={shortcutHits} query={query} store={store} />}
    </>
  )
}

/** Shortcuts a search found, in the Keyboard shortcuts page's group, to change their keys where they're found. */
function ShortcutResults({ commands, query, store }: { commands: string[]; query: string; store: Store }) {
  const page = pages.find((entry) => entry.id === "shortcuts")!

  return (
    <Group title={page.label} icon={<page.icon className="size-3.5" />}>
      {commands.map((command) => (
        <ShortcutRow key={command} command={command} store={store} found={{ query }} />
      ))}
    </Group>
  )
}
