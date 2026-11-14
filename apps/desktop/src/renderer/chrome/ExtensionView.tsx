import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Label,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@buildkitgg/shadcn-baseui-kit"
import type {
  CommandContribution,
  CommandTarget,
  ComponentTarget,
  FormField,
  Tone,
  ViewData,
  ViewItem
} from "@parity-app/extension-api"
import { ChevronRight, Inbox, RotateCw, TriangleAlert } from "lucide-react"
import { DynamicIcon } from "lucide-react/dynamic"
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react"
import type { ExtensionStatus } from "../../shared/protocol.ts"
import {
  actionsFor,
  changeField,
  isField,
  type PlacedView,
  shownItems,
  treeRows,
  viewOpened
} from "../extension-views.ts"
import { restartExtension, runCommand } from "../extensions.ts"
import type { ProjectSession } from "../workspace.ts"
import { AppSelect } from "./AppSelect.tsx"
import { ContributionIcon, isIconName } from "./ExtensionIcons.tsx"
import { IconButton } from "./IconButton.tsx"

/*
 * An extension's declarative view (PAR-1094), drawn with the kit: a table, a tree, a list, key-value pairs or a form,
 * with its toolbar above and each item's actions. The extension sends only data, so every view has the editor's
 * spacing, keyboard use, themes and accessible names. Until its code fills it, it says the extension is starting.
 */

type Session = Pick<ProjectSession, "id" | "untilClosed">

/** Where a view is drawn: a panel's tab or a Design tab section at the panels' size, or a page at a page's. */
export type ViewSize = "panel" | "page"

interface ExtensionViewProps {
  session: Session
  view: PlacedView
  size: ViewSize
  /** In a Design tab section, what's selected: only items about it, or about nothing, show. */
  selected?: ComponentTarget
}

/** A view, or what stands in for it until its extension's code fills it. */
export function ExtensionView({ session, view, size, selected }: ExtensionViewProps) {
  const opened = view.place !== "section"

  // A tab or page that opens can start its extension (`onView:id`).
  useEffect(() => {
    if (opened) {
      viewOpened(session, view.id)
    }
  }, [session, view.id, opened])

  if (!view.data) {
    return <NotFilled session={session} extension={view.extension} size={size} />
  }

  return <Filled session={session} view={view} data={view.data} size={size} selected={selected} />
}

/** What a view shows before its code fills it: that its extension is starting, or why it stopped, with Restart. */
function NotFilled({ session, extension, size }: { session: Session; extension: ExtensionStatus; size: ViewSize }) {
  const trouble = extension.state === "crashed" || extension.state === "stuck"

  if (trouble) {
    return (
      <Empty className={`border-0 ${size === "page" ? "py-16" : "py-8"}`}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle className="text-sm">
            {extension.state === "crashed"
              ? `${extension.displayName} stopped`
              : `${extension.displayName} isn't answering`}
          </EmptyTitle>
          {extension.reason && <EmptyDescription className="text-xs">{extension.reason}</EmptyDescription>}
        </EmptyHeader>
        <Button variant="outline" size="sm" onClick={() => restartExtension(session, extension.id)}>
          <RotateCw /> Restart
        </Button>
      </Empty>
    )
  }

  if (extension.state === "running") {
    return <NothingShown size={size} title="Nothing to show yet" />
  }

  return (
    <output
      className={`type-empty flex items-center justify-center gap-2 px-6 text-center text-muted-foreground ${
        size === "page" ? "py-16" : "py-8"
      }`}
    >
      <Spinner /> Starting {extension.displayName}…
    </output>
  )
}

function NothingShown({ size, title, detail }: { size: ViewSize; title: string; detail?: string }) {
  return (
    <Empty className={`border-0 ${size === "page" ? "py-16" : "py-8"}`}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox />
        </EmptyMedia>
        <EmptyTitle className="text-sm">{title}</EmptyTitle>
        {detail && <EmptyDescription className="text-xs">{detail}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  )
}

interface FilledProps {
  session: Session
  view: PlacedView
  data: ViewData
  size: ViewSize
  selected?: ComponentTarget
}

/** A view its code has filled: its description, toolbar and items. */
function Filled({ session, view, data, size, selected }: FilledProps) {
  const { extension } = view
  const toolbar = actionsFor(extension, data.options.toolbar)
  const items = shownItems(data, selected)
  const page = size === "page"

  return (
    <div className={`flex flex-col ${page ? "gap-4" : "gap-3"}`}>
      {data.options.description && (
        <p className={page ? "type-body text-muted-foreground" : "type-description text-muted-foreground"}>
          {data.options.description}
        </p>
      )}
      {toolbar.length > 0 && (
        <div className="flex flex-wrap gap-2" role="toolbar" aria-label={`${view.title} actions`}>
          {toolbar.map((command) => (
            <Button
              key={command.id}
              variant="outline"
              size={page ? "default" : "sm"}
              onClick={() => void runCommand(session, { extension, command })}
            >
              <ContributionIcon name={command.icon} logo={extension.icon} className="size-4" />
              {command.title}
            </Button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <NothingShown
          size={size}
          title={data.options.empty?.title ?? "Nothing to show"}
          detail={data.options.empty?.detail}
        />
      ) : (
        <Items session={session} view={view} data={data} items={items} size={size} />
      )}
    </div>
  )
}

interface ItemsProps {
  session: Session
  view: PlacedView
  data: ViewData
  items: (ViewItem | FormField)[]
  size: ViewSize
}

function Items({ session, view, data, items, size }: ItemsProps) {
  if (data.kind === "form") {
    return <Form session={session} view={view} fields={items.filter(isField)} size={size} />
  }

  const plain = items.filter((item): item is ViewItem => !isField(item))
  const actions = { session, view, offered: data.options.itemActions ?? [] }

  switch (data.kind) {
    case "table":
      return <ItemTable actions={actions} title={view.title} columns={data.options.columns ?? []} items={plain} />
    case "tree":
      return <Tree actions={actions} title={view.title} items={plain} />
    case "list":
      return <List actions={actions} title={view.title} items={plain} size={size} />
    case "keyValue":
      return <KeyValues title={view.title} items={plain} />
  }
}

/** What an item's actions need: the session, the view, and the actions it offers on each item. */
interface ItemActionsContext {
  session: Session
  view: PlacedView
  offered: NonNullable<ViewData["options"]["itemActions"]>
}

/** What an item's actions run for: its own target, or the item itself. */
function targetOf(view: PlacedView, item: ViewItem): CommandTarget {
  return item.target ?? { type: "item", view: view.id, key: item.key }
}

/** The commands an item offers, with a way to run each for it. */
function itemCommands({ session, view, offered }: ItemActionsContext, item: ViewItem) {
  const target = targetOf(view, item)

  return actionsFor(view.extension, offered, target).map((command) => ({
    command,
    run: () => void runCommand(session, { extension: view.extension, command }, target)
  }))
}

const toneColor: Record<Tone, string> = {
  info: "text-muted-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  error: "text-destructive"
}

const toneWords: Record<Tone, string> = { info: "", success: "Done", warning: "Needs attention", error: "Failed" }

/** An item's icon, in its tone's color, with the tone in words for screen readers. */
function ItemIcon({ item }: { item: ViewItem }) {
  if (!item.icon || !isIconName(item.icon)) {
    return null
  }

  const words = item.tone ? toneWords[item.tone] : ""

  return (
    <span className={`mt-0.5 shrink-0 ${toneColor[item.tone ?? "info"]}`}>
      <DynamicIcon name={item.icon} className="size-4" aria-hidden />
      {words && <span className="sr-only">{words}</span>}
    </span>
  )
}

/** Buttons for an item's actions, each named with the item, as "Open in Storybook, Button". */
function ActionButtons({
  commands,
  item,
  labelled,
  logo,
  focusable = true
}: {
  commands: { command: CommandContribution; run: () => void }[]
  item: ViewItem
  labelled: boolean
  logo: ExtensionStatus["icon"]
  focusable?: boolean
}) {
  if (labelled) {
    return commands.map(({ command, run }) => (
      <Button key={command.id} variant="outline" size="sm" onClick={run} aria-label={`${command.title}, ${item.label}`}>
        <ContributionIcon name={command.icon} logo={logo} className="size-3.5" />
        {command.title}
      </Button>
    ))
  }

  return commands.map(({ command, run }) =>
    focusable ? (
      <IconButton key={command.id} label={`${command.title}, ${item.label}`} onClick={run}>
        <ContributionIcon name={command.icon} logo={logo} className="size-3.5" />
      </IconButton>
    ) : (
      <button
        key={command.id}
        type="button"
        tabIndex={-1}
        aria-hidden
        title={command.title}
        onClick={(event) => {
          event.stopPropagation()
          run()
        }}
        className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ContributionIcon name={command.icon} logo={logo} className="size-3.5" />
      </button>
    )
  )
}

/** A table: the first column shows each row's label, the rest its cells, and the last its actions. */
function ItemTable({
  actions,
  title,
  columns,
  items
}: {
  actions: ItemActionsContext
  title: string
  columns: string[]
  items: ViewItem[]
}) {
  const withActions = actions.offered.length > 0

  return (
    <Table aria-label={title} className="text-xs">
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column} className="h-8 text-xs">
              {column}
            </TableHead>
          ))}
          {withActions && (
            <TableHead className="h-8 w-0">
              <span className="sr-only">Actions</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.key}>
            <TableCell className="py-1.5">
              <span className="flex items-start gap-2">
                <ItemIcon item={item} />
                <span className="min-w-0 truncate select-text">{item.label}</span>
              </span>
            </TableCell>
            {columns.slice(1).map((column, index) => (
              <TableCell key={column} className="py-1.5 tabular-nums select-text">
                {item.cells?.[index]}
              </TableCell>
            ))}
            {withActions && (
              <TableCell className="py-1 text-right">
                <span className="inline-flex gap-0.5">
                  <ActionButtons
                    commands={itemCommands(actions, item)}
                    item={item}
                    labelled={false}
                    logo={actions.view.extension.icon}
                  />
                </span>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * A tree, as Layers is one: arrow keys move between rows and open and close them, Enter and a double-click run the first
 * action, and the menu key or a right-click lists every action.
 */
function Tree({ actions, title, items }: { actions: ItemActionsContext; title: string; items: ViewItem[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [focus, setFocus] = useState<string | undefined>()
  const rows = treeRows(items, open)
  const list = useRef<HTMLDivElement>(null)
  const current = rows.find((row) => row.item.key === focus) ?? rows[0]

  const toggle = (key: string, to?: boolean) =>
    setOpen((now) => {
      const next = new Set(now)
      const opening = to ?? !next.has(key)

      if (opening) {
        next.add(key)
      } else {
        next.delete(key)
      }

      return next
    })

  const move = (key: string | undefined) => {
    if (key === undefined) {
      return
    }

    setFocus(key)
    list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!current) {
      return
    }

    const index = rows.indexOf(current)
    const { item, parent } = current
    const expanded = open.has(item.key)

    switch (event.key) {
      case "ArrowDown":
        move(rows[index + 1]?.item.key)
        break
      case "ArrowUp":
        move(rows[index - 1]?.item.key)
        break
      case "Home":
        move(rows[0]?.item.key)
        break
      case "End":
        move(rows.at(-1)?.item.key)
        break
      case "ArrowRight":
        if (parent && !expanded) {
          toggle(item.key, true)
        } else if (parent) {
          move(rows[index + 1]?.item.key)
        }

        break
      case "ArrowLeft":
        if (parent && expanded) {
          toggle(item.key, false)
        } else {
          move(rows.find((row) => row.item.key === item.parent)?.item.key)
        }

        break
      case "Enter":
        itemCommands(actions, item)[0]?.run()
        break
      default:
        return
    }

    event.preventDefault()
  }

  return (
    <div ref={list} role="tree" tabIndex={-1} aria-label={title} onKeyDown={onKeyDown} className="-mx-2 flex flex-col">
      {rows.map(({ item, depth, parent }) => {
        const commands = itemCommands(actions, item)
        const expanded = open.has(item.key)

        const row = (
          <div
            data-key={item.key}
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={parent ? expanded : undefined}
            aria-selected={item.key === current?.item.key}
            tabIndex={item.key === current?.item.key ? 0 : -1}
            onFocus={() => setFocus(item.key)}
            onDoubleClick={() => commands[0]?.run()}
            className="group flex h-7 items-center gap-1.5 rounded-md pr-1 text-sm outline-none select-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50 aria-selected:bg-accent/40"
            style={{ paddingLeft: 4 + depth * 16 }}
          >
            {parent ? (
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                onClick={() => toggle(item.key)}
                className="grid size-4 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
              </button>
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <ItemIcon item={item} />
            <span className="min-w-0 flex-1 truncate">
              {item.label}
              {item.detail && <span className="ml-2 text-xs text-muted-foreground">{item.detail}</span>}
            </span>
            <span className="hidden shrink-0 gap-0.5 group-hover:flex group-focus-visible:flex">
              <ActionButtons
                commands={commands}
                item={item}
                labelled={false}
                logo={actions.view.extension.icon}
                focusable={false}
              />
            </span>
          </div>
        )

        if (commands.length === 0) {
          return <div key={item.key}>{row}</div>
        }

        return (
          <ContextMenu key={item.key}>
            <ContextMenuTrigger render={row} />
            <ContextMenuContent>
              {commands.map(({ command, run }) => (
                <ContextMenuItem key={command.id} onClick={run}>
                  <ContributionIcon name={command.icon} logo={actions.view.extension.icon} />
                  {command.title}
                </ContextMenuItem>
              ))}
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
    </div>
  )
}

/** A list: each item with its icon, label, detail and actions, as a setup guide's steps. */
function List({
  actions,
  title,
  items,
  size
}: {
  actions: ItemActionsContext
  title: string
  items: ViewItem[]
  size: ViewSize
}) {
  const page = size === "page"

  return (
    <ul aria-label={title} className={`flex flex-col ${page ? "gap-2" : "-mx-1"}`}>
      {items.map((item) => (
        <li
          key={item.key}
          className={`flex gap-3 ${page ? "items-start rounded-lg border px-4 py-3" : "items-center rounded-md px-1 py-0.5"}`}
        >
          <ItemIcon item={item} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={page ? "text-sm font-medium" : "text-sm"}>{item.label}</span>
            {item.detail && (
              <span className={page ? "type-description text-muted-foreground" : "text-xs text-muted-foreground"}>
                {item.detail}
              </span>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <ActionButtons
              commands={itemCommands(actions, item)}
              item={item}
              labelled={page}
              logo={actions.view.extension.icon}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Key-value pairs: each item's label beside its value. */
function KeyValues({ title, items }: { title: string; items: ViewItem[] }) {
  return (
    <dl aria-label={title} className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
      {items.map((item) => (
        <div key={item.key} className="contents">
          <dt className="truncate text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 break-words select-text">{item.value ?? item.detail}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A form: each field with the kit's own control, sending each change to the extension. */
function Form({
  session,
  view,
  fields,
  size
}: {
  session: Session
  view: PlacedView
  fields: FormField[]
  size: ViewSize
}) {
  const change = (key: string, value: string | number | boolean) =>
    changeField(session, view.extension, view.id, key, value)

  return (
    <fieldset className="flex min-w-0 flex-col gap-4">
      <legend className="sr-only">{view.title}</legend>
      {fields.map((field) => (
        <FormRow key={field.key} field={field} size={size} onChange={(value) => change(field.key, value)} />
      ))}
    </fieldset>
  )
}

function FormRow({
  field,
  size,
  onChange
}: {
  field: FormField
  size: ViewSize
  onChange: (value: string | number | boolean) => void
}) {
  const id = useId()
  const labelClass = size === "page" ? undefined : "text-xs"

  if (field.type === "boolean") {
    return (
      <Field orientation="horizontal">
        <Switch id={id} checked={field.value} onCheckedChange={(checked: boolean) => onChange(checked)} />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor={id} className={labelClass}>
            {field.label}
          </Label>
          {field.detail && <FieldDescription className="text-xs">{field.detail}</FieldDescription>}
        </div>
      </Field>
    )
  }

  return (
    <Field>
      <FieldLabel htmlFor={id} className={labelClass}>
        {field.label}
      </FieldLabel>
      {field.type === "select" ? (
        <AppSelect
          id={id}
          variant={size === "page" ? "dialog" : "panel"}
          items={field.options}
          value={field.value}
          onValueChange={(value) => value !== null && onChange(value)}
        />
      ) : (
        // A value the extension sends replaces what's typed.
        <TextField key={String(field.value)} field={field} id={id} onChange={onChange} />
      )}
      {field.detail && <FieldDescription className="text-xs">{field.detail}</FieldDescription>}
    </Field>
  )
}

/** A text or number field, which sends its value when the person presses Enter or leaves it. */
function TextField({
  field,
  id,
  onChange
}: {
  field: Extract<FormField, { type: "text" | "number" }>
  id: string
  onChange: (value: string | number) => void
}) {
  const [draft, setDraft] = useState(String(field.value))

  const commit = () => {
    if (field.type === "number") {
      const number = Number(draft)

      if (draft.trim() === "" || !Number.isFinite(number)) {
        setDraft(String(field.value))
      } else if (number !== field.value) {
        onChange(number)
      }
    } else if (draft !== field.value) {
      onChange(draft)
    }
  }

  return (
    <Input
      id={id}
      type={field.type === "number" ? "number" : "text"}
      value={draft}
      placeholder={field.type === "text" ? field.placeholder : undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit()
        }
      }}
    />
  )
}
