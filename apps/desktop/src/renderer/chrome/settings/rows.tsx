import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
  Input,
  Switch
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, X } from "lucide-react"
import { Fragment, type ReactNode, useEffect, useId, useRef } from "react"
import { AppSelect } from "../AppSelect.tsx"
import { CopyButton } from "../Copy.tsx"
import { Hint } from "../Hint.tsx"
import { DialogGroupTitle } from "../PanelSection.tsx"
import type { Option, Setting, Value } from "./definitions.ts"
import { ProjectBadge } from "./marks.tsx"
import { type Store, valueText } from "./store.ts"

/**
 * A group of rows on a page: its title, then its rows in one panel, split by hairlines. A page with one group leaves
 * the title off, since the page's own says it.
 */
export function Group({ title, icon, children }: { title?: ReactNode; icon?: ReactNode; children: ReactNode }) {
  const heading = useId()

  return (
    <section aria-labelledby={title ? heading : undefined} className="mt-8 first:mt-0">
      {title && (
        <div className="px-1 pb-1">
          <DialogGroupTitle>
            <span id={heading} className="flex items-center gap-1.5">
              {icon}
              {title}
            </span>
          </DialogGroupTitle>
        </div>
      )}
      <div className="@container divide-y overflow-hidden rounded-lg border bg-muted/20">{children}</div>
    </section>
  )
}

interface RowProps {
  /** The setting it shows, which search and links mark it by. */
  id?: string
  /** The control its label clicks and names. */
  controlId?: string
  label: ReactNode
  /** Beside the label: the project's tag, or a link to the project's value. */
  aside?: ReactNode
  detail?: ReactNode
  /** Why its last change couldn't be saved. */
  problem?: string
  /** A wide control, as a select is, goes under the label when the page is narrow; a small one stays beside it. */
  wide?: boolean
  marked?: boolean
  /** The row's one action, after its control, as taking a project's change off is. */
  action?: ReactNode
  children?: ReactNode
}

/**
 * A setting's row: its label and description on the left, its control on the right. Changes save as they're made, so a
 * row marks nothing as changed and has no reset. A row reached from search or a link lights up, then fades back.
 */
export function Row({
  id,
  controlId,
  label,
  aside,
  detail,
  problem,
  wide = false,
  marked = false,
  action,
  children
}: RowProps) {
  const row = useRef<HTMLDivElement>(null)

  // The one moment of motion: the row lights up and fades back, so the eye finds it.
  useEffect(() => {
    if (!marked || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }

    row.current?.animate([{ backgroundColor: "var(--accent)" }, { backgroundColor: "transparent" }], {
      duration: 1600,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)"
    })
  }, [marked])

  const labelClass = "text-sm font-medium"

  return (
    <div
      ref={row}
      data-setting={id}
      className={`flex gap-x-4 gap-y-2.5 px-4 ${detail || problem ? "py-3" : "py-2"} ${
        wide ? "flex-col @lg:flex-row @lg:items-center" : "flex-row items-center"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {controlId ? (
            <label htmlFor={controlId} className={labelClass}>
              {label}
            </label>
          ) : (
            <span className={labelClass}>{label}</span>
          )}
          {aside}
        </div>
        {detail && <div className="mt-0.5 type-description text-muted-foreground">{detail}</div>}
        {problem && (
          <p role="alert" className="mt-1 type-message text-destructive">
            {problem}
          </p>
        )}
      </div>
      <div className={`flex items-center gap-1 ${wide ? "w-full @lg:w-auto" : ""}`}>
        <div data-control className={`flex min-w-0 justify-end ${wide ? "flex-1 @lg:flex-none" : ""}`}>
          {children}
        </div>
        {action}
      </div>
    </div>
  )
}

/** A row's action after its control, named by its tooltip. */
function RowAction({
  hint,
  label,
  icon,
  onClick
}: {
  hint: string
  label: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <Hint label={hint}>
      <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick} className="text-muted-foreground">
        {icon}
      </Button>
    </Hint>
  )
}

/** What's saved in the project's file, tagged with its badge and name where Settings lists it among the person's. */
function ProjectTag({ name }: { name: string }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-md bg-muted px-1.5 text-2xs text-muted-foreground">
      <ProjectBadge name={name} size={12} />
      <span className="sr-only">Saved in </span>
      {name}
    </span>
  )
}

/** The project's own value beside one of the person's that it changes, which goes to it on the project's page. */
function ProjectValue({ name, setting, value, store }: { name: string; setting: Setting; value: Value; store: Store }) {
  return (
    <button
      type="button"
      onClick={() => store.go("project", setting.id)}
      className="inline-flex h-5 items-center gap-1 rounded-md bg-muted px-1.5 text-2xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <ProjectBadge name={name} size={12} />
      {name}: {valueText(setting, value)}
    </button>
  )
}

/** What a search matched in a row, to mark in its label and description. */
export interface Found {
  query: string
  /** The other word for it that matched, when its own text didn't. */
  keyword?: string
}

/**
 * One setting's row. On the person's pages it shows their value for every project, with the project's beside it when
 * the project changes it. On the project's page (`forProject`) it shows the project's value, with every project's under
 * the label and a button that takes the project's change off, the opposite of Change a setting. A project's own setting
 * always shows the project's.
 */
export function SettingRow({
  setting,
  store,
  forProject = false,
  found,
  tagged = false
}: {
  setting: Setting
  store: Store
  forProject?: boolean
  found?: Found
  /** Tags a project's own setting with the project's name, where it's listed among the person's. */
  tagged?: boolean
}) {
  const controlId = useId()
  const theirs = forProject || setting.scope === "project"
  const override = theirs && setting.scope === "either"
  const fallback = override ? store.mine(setting) : setting.default
  const value = theirs ? (store.theirs(setting) ?? fallback) : store.mine(setting)
  const lockedBy = store.locked[setting.id]
  const project = store.project?.name
  const projectValue = theirs || !project ? undefined : store.theirs(setting)
  const change = (next: Value) => (theirs ? store.setTheirs(setting, next) : store.setMine(setting, next))

  return (
    <Row
      id={setting.id}
      controlId={found ? undefined : controlId}
      wide={setting.control.kind !== "switch"}
      label={found ? <ResultLink setting={setting} found={found} store={store} /> : setting.label}
      aside={
        <>
          {tagged && project && setting.scope === "project" && <ProjectTag name={project} />}
          {project && projectValue !== undefined && (
            <ProjectValue name={project} setting={setting} value={projectValue} store={store} />
          )}
        </>
      }
      detail={detailOf(setting, { lockedBy, found, override: override ? fallback : undefined, store })}
      problem={store.failed[setting.id]}
      marked={store.marked === setting.id}
      action={
        override && (
          <RowAction
            hint="Use every project's value"
            label={`Use every project's value for ${setting.label}`}
            icon={<X />}
            onClick={() => store.resetTheirs(setting)}
          />
        )
      }
    >
      <Control
        id={controlId}
        setting={setting}
        value={value}
        disabled={!!lockedBy || !!store.busy?.[setting.id]}
        onChange={change}
      />
    </Row>
  )
}

/** A result's label, which opens the setting on its page. */
function ResultLink({ setting, found, store }: { setting: Setting; found: Found; store: Store }) {
  return (
    <button
      type="button"
      data-result
      onClick={() => store.go(setting.page, setting.id)}
      className="-mx-1 rounded-sm px-1 text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <Highlight text={setting.label} query={found.query} />
    </button>
  )
}

/**
 * A row's line under its label: what decides it when something outside Settings does; every project's value on the
 * project's page; the word a search matched; or its description.
 */
function detailOf(
  setting: Setting,
  { lockedBy, found, override, store }: { lockedBy?: string; found?: Found; override?: Value; store: Store }
): ReactNode {
  if (lockedBy) {
    return (
      <>
        {setting.detail} Set by <code className="font-mono">{lockedBy}</code> for this run.
      </>
    )
  }

  if (override !== undefined) {
    return (
      <button
        type="button"
        onClick={() => store.go(setting.page, setting.id)}
        className="rounded-sm text-left underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        Every project: {valueText(setting, override)}
      </button>
    )
  }

  if (found?.keyword) {
    return (
      <>
        Matches “<Highlight text={found.keyword} query={found.query} />”
      </>
    )
  }

  return found && setting.detail ? <Highlight text={setting.detail} query={found.query} /> : setting.detail
}

function Control({
  id,
  setting,
  value,
  disabled,
  onChange
}: {
  id: string
  setting: Setting
  value: Value
  disabled: boolean
  onChange: (value: Value) => void
}) {
  const control = setting.control
  const wide = "w-full @lg:w-56"

  switch (control.kind) {
    case "switch":
      return (
        <Switch
          id={id}
          checked={value === true}
          disabled={disabled}
          onCheckedChange={onChange}
          aria-label={setting.label}
        />
      )
    case "select":
      return (
        <AppSelect
          id={id}
          variant="dialog"
          size="sm"
          className={wide}
          aria-label={setting.label}
          items={control.options.map((option) => ({ value: option.value, label: <OptionLabel option={option} /> }))}
          value={String(value)}
          disabled={disabled}
          onValueChange={(next) => next && onChange(next)}
        />
      )
    case "text":
    case "number":
      return (
        <Input
          id={id}
          type={control.kind}
          value={String(value)}
          disabled={disabled}
          onChange={(event) =>
            onChange(control.kind === "number" ? Number(event.currentTarget.value) : event.currentTarget.value)
          }
          aria-label={setting.label}
          className={`h-8 font-mono text-xs ${wide}`}
        />
      )
    case "multi":
      return (
        <Multi
          id={id}
          setting={setting}
          options={control.options}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
        />
      )
    case "fixed":
      return (
        <span className="flex min-w-0 items-center gap-1">
          <code className="truncate font-mono text-xs text-muted-foreground select-all">{String(value)}</code>
          <CopyButton text={String(value)} label={`Copy ${setting.label}`} />
        </span>
      )
  }
}

function OptionLabel({ option }: { option: Option }) {
  const Icon = option.icon

  return (
    <span className="flex items-center gap-2">
      {Icon && <Icon className="size-3.5 text-muted-foreground" aria-hidden />}
      {option.label}
    </span>
  )
}

/** Several choices from a list in a dropdown, keeping at least one. */
function Multi({
  id,
  setting,
  options,
  value,
  onChange
}: {
  id: string
  setting: Setting
  options: Option[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  const chosen = options.flatMap((option) => (value.includes(option.value) ? [option.label] : []))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            id={id}
            variant="outline"
            size="sm"
            className="w-full justify-between font-normal @lg:w-56"
            aria-label={setting.label}
          />
        }
      >
        <span className="truncate">{chosen.join(", ")}</span>
        <ChevronDown className="text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={value.includes(option.value)}
              disabled={value.length === 1 && value.includes(option.value)}
              closeOnClick={false}
              onCheckedChange={(on) =>
                onChange(on ? [...value, option.value] : value.filter((entry) => entry !== option.value))
              }
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The text with the start of each word that matches what's typed marked. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const typed = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const parts = text.split(/(\s+)/)

  return parts.map((part, index) => {
    const match = typed.find((word) => part.toLowerCase().startsWith(word))

    return match ? (
      <Fragment key={index}>
        <mark className="rounded-sm bg-primary/20 text-inherit">{part.slice(0, match.length)}</mark>
        {part.slice(match.length)}
      </Fragment>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  })
}
