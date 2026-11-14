import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Kbd,
  KbdGroup,
  Switch,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronRight, FileJson, Folder, Globe, RotateCcw, Search, X } from "lucide-react"
import { Fragment, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { AppSelect } from "../../chrome/AppSelect.tsx"
import { groups, keymap } from "../../chrome/keymap.ts"
import { formatKeys } from "../../chrome/keys.ts"
import {
  defaults,
  type Extension,
  extensionOf,
  extensions,
  type Page,
  pageOf,
  pages,
  project,
  projectSettings,
  type Scope,
  type Setting,
  settings,
  settingsOn,
  type Value
} from "./data.ts"
import { search } from "./search.ts"

export interface SettingsModalProps {
  /** The page it opens on, as Search actions or a menu asks. */
  initialPage?: string
  /** What's typed in its search as it opens. */
  initialQuery?: string
  /** A setting to scroll to and mark as it opens, as picking one in Search actions does. */
  initialSetting?: string
  /** Values that differ from the defaults. */
  initialValues?: Record<string, Value>
  /** Settings something outside Settings decides, by setting id, naming what decides it. */
  locked?: Record<string, string>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** A project setting changed, which the editor window makes an undo step. */
  onProjectChange?: (setting: Setting, value: Value) => void
}

/**
 * The Settings view: every setting, Parity's own and each extension's, the person's for every project and this
 * project's, on pages in a sidebar. Main owns it and it loads no project code, so it's the one place app settings and
 * permission grants change. A change to a project setting goes to the editor window as an undo step.
 */
export function SettingsModal({
  initialPage = "general",
  initialQuery = "",
  initialSetting,
  initialValues = {},
  locked = {},
  open = true,
  onOpenChange,
  onProjectChange
}: SettingsModalProps) {
  const [page, setPage] = useState(initialPage)
  const [query, setQuery] = useState(initialQuery)
  const [values, setValues] = useState<Record<string, Value>>(() => ({ ...defaults(), ...initialValues }))
  const [grants, setGrants] = useState<Record<string, boolean>>({})
  const [marked, setMarked] = useState(initialSetting)
  const pane = useRef<HTMLDivElement>(null)

  const change = (setting: Setting, value: Value) => {
    setValues((current) => ({ ...current, [setting.id]: value }))

    if (setting.scope === "project") {
      onProjectChange?.(setting, value)
    }
  }

  const go = (to: string, setting?: string) => {
    setQuery("")
    setPage(to)
    setMarked(setting)

    if (!setting) {
      pane.current?.scrollTo({ top: 0 })
    }
  }

  useEffect(() => {
    if (!marked) {
      return
    }

    const row = pane.current?.querySelector<HTMLElement>(`[data-setting="${marked}"]`)
    row?.scrollIntoView({ block: "center" })
    row?.querySelector<HTMLElement>("button, input, [role=switch], [role=combobox]")?.focus({ preventScroll: true })
  }, [marked, page])

  const rowProps = { values, change, locked, marked, go }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape clears the search first, then closes.
        if (!next && query) {
          return setQuery("")
        }

        onOpenChange?.(next)
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(825px,calc(100dvh-2rem))] w-[min(1045px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <div className="flex h-12 shrink-0 items-center justify-between pr-2 pl-4">
          <DialogTitle className="text-sm font-semibold">Settings</DialogTitle>
          <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
            <X />
          </DialogClose>
        </div>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <Sidebar page={query ? undefined : page} query={query} setQuery={setQuery} go={go} />
          <div ref={pane} className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 sm:px-8">
            {query ? (
              <Results query={query} {...rowProps} />
            ) : (
              <PageView page={pageOf(page)} grants={grants} setGrants={setGrants} {...rowProps} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface RowContext {
  values: Record<string, Value>
  change: (setting: Setting, value: Value) => void
  locked: Record<string, string>
  marked?: string
  go: (page: string, setting?: string) => void
}

function Sidebar({
  page,
  query,
  setQuery,
  go
}: {
  page?: string
  query: string
  setQuery: (query: string) => void
  go: (page: string, setting?: string) => void
}) {
  const nav = useRef<HTMLElement>(null)

  const sections = [
    pages.filter((entry) => entry.group === "app"),
    pages.filter((entry) => entry.group === "system"),
    pages.filter((entry) => entry.group === "project"),
    pages.filter((entry) => entry.group === "extensions")
  ]

  // Up and down move between pages, as in a list; Tab leaves the list.
  const arrows = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return
    }

    const items = [...(nav.current?.querySelectorAll<HTMLElement>("[data-page]") ?? [])]
    const at = items.indexOf(event.currentTarget)
    const next = items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]
    event.preventDefault()
    next?.focus()
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b px-3 pb-3 sm:w-[210px] sm:border-r-0 sm:border-b-0">
      <InputGroup className="h-8">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              const first = search(query)[0]

              if (first) {
                go(first.page, first.setting)
              }
            }

            if (event.key === "ArrowDown") {
              event.preventDefault()
              nav.current?.querySelector<HTMLElement>("[data-page]")?.focus()
            }
          }}
          placeholder="Search"
          aria-label="Search settings"
        />
      </InputGroup>
      <nav
        ref={nav}
        aria-label="Settings pages"
        className="flex min-h-0 flex-1 gap-1 overflow-x-auto sm:flex-col sm:overflow-x-visible sm:overflow-y-auto"
      >
        {sections.map((section, index) => (
          <Fragment key={index}>
            {index > 0 && <hr className="my-1 hidden border-border sm:block" />}
            {section.map((entry) => (
              <NavItem
                key={entry.id}
                entry={entry}
                current={entry.id === page}
                onClick={() => go(entry.id)}
                onKeyDown={arrows}
              />
            ))}
          </Fragment>
        ))}
      </nav>
      <Button variant="ghost" size="sm" className="hidden justify-start gap-2 text-muted-foreground sm:flex">
        <FileJson /> Open settings.json
      </Button>
    </div>
  )
}

function NavItem({
  entry,
  current,
  onClick,
  onKeyDown
}: {
  entry: Page
  current: boolean
  onClick: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const Icon = entry.icon
  const extension = entry.extension ? extensionOf(entry.extension) : undefined
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (current) {
      ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
    }
  }, [current])

  return (
    <button
      ref={ref}
      type="button"
      data-page={entry.id}
      aria-current={current ? "page" : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
        extension ? "sm:ml-3" : ""
      } ${current ? "bg-accent font-medium text-accent-foreground" : "text-foreground/80 hover:bg-accent/50"} ${
        extension && !extension.running && !current ? "text-muted-foreground" : ""
      }`}
    >
      <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
      <span className="truncate">{entry.label}</span>
    </button>
  )
}

function PageView({
  page,
  grants,
  setGrants,
  ...context
}: { page: Page; grants: Record<string, boolean>; setGrants: (grants: Record<string, boolean>) => void } & RowContext) {
  if (page.id === "project") {
    return <ProjectPage {...context} />
  }

  if (page.id === "extensions") {
    return <ExtensionsPage go={context.go} />
  }

  if (page.id === "shortcuts") {
    return <ShortcutsPage />
  }

  if (page.extension) {
    const extension = extensionOf(page.extension)!

    return <ExtensionPage extension={extension} grants={grants} setGrants={setGrants} {...context} />
  }

  return (
    <>
      <PageHeader title={page.label} scope="app" />
      <Rows>
        {settingsOn(page.id).map((setting) => (
          <SettingRow key={setting.id} setting={setting} {...context} />
        ))}
        {page.id === "updates" && (
          <Row label="Version" detail="Parity 0.82.1">
            <Button variant="outline" size="sm">
              Check for updates
            </Button>
          </Row>
        )}
      </Rows>
    </>
  )
}

function PageHeader({
  title,
  scope,
  description,
  children
}: {
  title: string
  scope?: Scope
  description?: string
  children?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 flex min-h-12 items-center gap-3 bg-popover pt-1 pb-3">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          {scope && <ScopeBadge scope={scope} />}
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <span className="flex-1" />
      {children}
    </header>
  )
}

/** Whose a setting is. Every project's settings go with the person; this project's go with its file. */
function ScopeBadge({ scope }: { scope: Scope }) {
  return scope === "app" ? (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Globe aria-hidden /> Every project
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Folder aria-hidden /> {project.name}
    </Badge>
  )
}

function Rows({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="divide-y divide-border/60">
      {children}
    </section>
  )
}

function Row({
  label,
  name,
  detail,
  badge,
  changed,
  onReset,
  marked,
  id,
  children
}: {
  label: ReactNode
  /** The label as text, for the reset button's name. */
  name?: string
  detail?: ReactNode
  badge?: ReactNode
  changed?: boolean
  onReset?: () => void
  marked?: boolean
  id?: string
  children?: ReactNode
}) {
  return (
    <div
      data-setting={id}
      className={`group flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 transition-colors ${
        marked ? "-mx-3 rounded-md bg-accent/40 px-3" : ""
      }`}
    >
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {changed && (
            <span className="size-1.5 rounded-full bg-primary">
              <span className="sr-only">Changed</span>
            </span>
          )}
          {badge}
        </div>
        {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {changed && onReset && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Reset ${name ?? ""}`.trim()}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={onReset}
          >
            <RotateCcw />
          </Button>
        )}
        {children}
      </div>
    </div>
  )
}

function SettingRow({
  setting,
  values,
  change,
  locked,
  marked,
  go,
  showScope,
  highlight
}: { setting: Setting; showScope?: boolean; highlight?: string } & RowContext) {
  const value = values[setting.id]!
  const lockedBy = locked[setting.id]
  const changed = setting.control.kind !== "jump" && !same(value, setting.default)

  return (
    <Row
      id={setting.id}
      label={highlight ? <Highlight text={setting.label} query={highlight} /> : setting.label}
      name={setting.label}
      detail={detailOf(setting, lockedBy, highlight)}
      badge={showScope && <ScopeBadge scope={setting.scope} />}
      changed={changed && !lockedBy}
      onReset={() => change(setting, setting.default)}
      marked={marked === setting.id}
    >
      <SettingControl
        setting={setting}
        value={value}
        disabled={!!lockedBy}
        onChange={(next) => change(setting, next)}
        go={go}
      />
    </Row>
  )
}

/** A setting's line under its label: what decides it, when something outside Settings does, or its description. */
function detailOf(setting: Setting, lockedBy?: string, highlight?: string): ReactNode {
  if (lockedBy) {
    return (
      <>
        Set by <code className="font-mono">{lockedBy}</code>
      </>
    )
  }

  return highlight && setting.detail ? <Highlight text={setting.detail} query={highlight} /> : setting.detail
}

function SettingControl({
  setting,
  value,
  disabled,
  onChange,
  go
}: {
  setting: Setting
  value: Value
  disabled: boolean
  onChange: (value: Value) => void
  go: (page: string) => void
}) {
  const control = setting.control

  switch (control.kind) {
    case "switch":
      return (
        <Switch checked={value === true} disabled={disabled} onCheckedChange={onChange} aria-label={setting.label} />
      )
    case "segmented":
      return (
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[String(value)]}
          disabled={disabled}
          onValueChange={([next]) => next && onChange(next)}
          aria-label={setting.label}
        >
          {control.options.map(({ value: option, label, icon: Icon }) => (
            <ToggleGroupItem
              key={option}
              value={option}
              className="gap-1.5 px-2.5 text-muted-foreground aria-pressed:text-foreground"
            >
              {Icon && <Icon aria-hidden />} {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )
    case "select":
      return (
        <AppSelect
          variant="dialog"
          size="sm"
          className="w-44"
          aria-label={setting.label}
          items={control.options}
          value={String(value)}
          disabled={disabled}
          onValueChange={(next) => next && onChange(next)}
        />
      )
    case "text":
      return (
        <Input
          value={String(value)}
          readOnly={setting.id === "installId"}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          aria-label={setting.label}
          className={`h-8 w-56 ${control.mono ? "font-mono text-xs" : ""}`}
        />
      )
    case "number":
      return (
        <Input
          type="number"
          value={String(value)}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          aria-label={setting.label}
          className="h-8 w-24 font-mono text-xs"
        />
      )
    case "jump":
      return (
        <Button variant="outline" size="sm" className="gap-1" onClick={() => go(control.page)}>
          {control.label} <ChevronRight aria-hidden />
        </Button>
      )
    case "sizes": {
      const sizes = ["PNG 1x", "PNG 2x", "PNG 3x", "JPG 1x", "JPG 2x", "JPG 3x"]

      return (
        <ToggleGroup
          multiple
          variant="outline"
          size="sm"
          spacing={0}
          value={Array.isArray(value) ? value : []}
          disabled={disabled}
          onValueChange={(next) => next.length > 0 && onChange(next)}
          aria-label={setting.label}
        >
          {sizes.map((size) => (
            <ToggleGroupItem
              key={size}
              value={size}
              className="px-2 text-xs text-muted-foreground aria-pressed:text-foreground"
            >
              {size}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )
    }
  }
}

function ProjectPage(context: RowContext) {
  const byExtension = extensions
    .map((extension) => ({ extension, settings: projectSettings().filter((s) => s.extension === extension.id) }))
    .filter((entry) => entry.settings.length > 0)

  return (
    <>
      <PageHeader
        title={project.name}
        description={`Saved in ${project.file}. Each change is an undo step in the project's window.`}
      >
        <Button variant="outline" size="sm">
          Show in folder
        </Button>
      </PageHeader>
      {byExtension.map(({ extension, settings: own }) => (
        <section key={extension.id} aria-labelledby={`project-${extension.id}`} className="pt-4">
          <h3 id={`project-${extension.id}`} className="pb-1">
            <button
              type="button"
              onClick={() => context.go(`ext:${extension.id}`)}
              className="-mx-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <extension.icon className="size-3.5" aria-hidden />
              {extension.name}
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          </h3>
          <Rows>
            {own.map((setting) => (
              <SettingRow key={setting.id} setting={setting} {...context} />
            ))}
          </Rows>
        </section>
      ))}
    </>
  )
}

function ExtensionsPage({ go }: { go: (page: string) => void }) {
  return (
    <>
      <PageHeader title="Extensions" />
      <ul className="divide-y divide-border/60">
        {extensions.map((extension) => (
          <li key={extension.id}>
            <button
              type="button"
              onClick={() => go(`ext:${extension.id}`)}
              className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-3 text-left outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <Logo extension={extension} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{extension.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{extension.found}</span>
              </span>
              <Status running={extension.running} />
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function Logo({ extension, size = "md" }: { extension: Extension; size?: "sm" | "md" }) {
  const Icon = extension.icon

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg bg-muted text-foreground ${
        size === "md" ? "size-11" : "size-8"
      }`}
      aria-hidden
    >
      <Icon className={size === "md" ? "size-5" : "size-4"} />
    </span>
  )
}

function Status({ running }: { running: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`size-1.5 rounded-full ${running ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
      {running ? "Running" : "Not running"}
    </span>
  )
}

function ExtensionPage({
  extension,
  grants,
  setGrants,
  ...context
}: {
  extension: Extension
  grants: Record<string, boolean>
  setGrants: (grants: Record<string, boolean>) => void
} & RowContext) {
  const own = settingsOn(`ext:${extension.id}`)

  return (
    <>
      <header className="flex items-center gap-3 pt-1 pb-4">
        <Logo extension={extension} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-tight font-semibold">{extension.name}</h2>
          <p className="truncate text-xs text-muted-foreground">{extension.found}</p>
        </div>
        <Status running={extension.running} />
      </header>
      {extension.activation && (
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-sm">
          <Stat label="Started">{extension.activation.event}</Stat>
          <Stat label="Activation">{extension.activation.ms} ms</Stat>
          <Stat label="Memory">{extension.memoryMb} MB</Stat>
        </dl>
      )}
      <Heading>Adds</Heading>
      <ul className="flex flex-wrap gap-1.5 pb-2">
        {extension.adds.map((item) => (
          <li key={item}>
            <Badge variant="secondary">{item}</Badge>
          </li>
        ))}
      </ul>
      {own.length > 0 && (
        <>
          <Heading>Settings</Heading>
          <Rows label="Settings">
            {own.map((setting) => (
              <SettingRow key={setting.id} setting={setting} showScope {...context} />
            ))}
          </Rows>
        </>
      )}
      <Heading>Permissions</Heading>
      <Rows label="Permissions">
        {extension.permissions.map((permission) => {
          const key = `${extension.id}:${permission.label}`

          return (
            <Row
              key={permission.label}
              label={permission.label}
              detail={permission.grant ? permission.detail : <code className="font-mono">{permission.detail}</code>}
            >
              {permission.grant && (
                <Switch
                  checked={grants[key] ?? true}
                  disabled={!extension.running}
                  onCheckedChange={(granted) => setGrants({ ...grants, [key]: granted })}
                  aria-label={`${permission.label}, for ${extension.name}`}
                />
              )}
            </Row>
          )
        })}
      </Rows>
    </>
  )
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="pt-6 pb-2 text-xs font-medium text-muted-foreground">{children}</h3>
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-popover px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  )
}

function ShortcutsPage() {
  return (
    <>
      <PageHeader title="Keyboard shortcuts" scope="app">
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileJson aria-hidden /> Open keybindings.json
        </Button>
      </PageHeader>
      {groups.map((group) => (
        <section key={group} aria-labelledby={`keys-${group}`}>
          <h3 id={`keys-${group}`} className="pt-4 pb-1 text-xs font-medium text-muted-foreground">
            {group}
          </h3>
          <Rows>
            {Object.entries(keymap)
              .filter(([, binding]) => binding.group === group)
              .map(([id, binding]) => (
                <div key={id} className="flex items-center justify-between gap-6 py-2">
                  <span className="text-sm">{binding.label}</span>
                  <KbdGroup>
                    {binding.keys.slice(0, 1).map((keys) => (
                      <Kbd key={keys}>{formatKeys(keys, false)}</Kbd>
                    ))}
                  </KbdGroup>
                </div>
              ))}
          </Rows>
        </section>
      ))}
    </>
  )
}

function Results({ query, go, ...context }: { query: string } & RowContext) {
  const hits = search(query)
  const shownPages = [...new Set(hits.map((hit) => hit.page))]

  return (
    <>
      <header className="sticky top-0 z-10 flex min-h-12 items-center bg-popover pt-1 pb-3" aria-live="polite">
        <h2 className="text-lg font-semibold">
          {hits.length === 0 ? `Nothing matches “${query}”` : `Results for “${query}”`}
        </h2>
      </header>
      {shownPages.map((id) => {
        const page = pageOf(id)
        const own = hits.filter((hit) => hit.page === id && hit.setting)

        return (
          <section key={id} aria-labelledby={`result-${id}`} className="pb-4">
            <button
              type="button"
              id={`result-${id}`}
              onClick={() => go(id)}
              className="-mx-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <page.icon className="size-3.5" aria-hidden />
              <Highlight text={page.label} query={query} />
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
            {own.length > 0 && (
              <Rows>
                {own.map((hit) => (
                  <SettingRow
                    key={hit.setting}
                    setting={settings.find((setting) => setting.id === hit.setting)!}
                    showScope
                    highlight={query}
                    go={go}
                    {...context}
                  />
                ))}
              </Rows>
            )}
          </section>
        )
      })}
    </>
  )
}

/** The text with the words that start with what's typed in bold. */
function Highlight({ text, query }: { text: string; query: string }) {
  const typed = query.trim().toLowerCase()

  if (!typed) {
    return <>{text}</>
  }

  const parts = text.split(/(\s+)/)

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase().startsWith(typed) ? (
          <Fragment key={index}>
            <mark className="rounded-sm bg-primary/25 text-inherit">{part.slice(0, typed.length)}</mark>
            {part.slice(typed.length)}
          </Fragment>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  )
}

function same(a: Value, b: Value): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
