import {
  Button,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@buildkitgg/shadcn-baseui-kit"
import { ArrowUpToLine, Diamond, Replace, RotateCcw, Unlink } from "lucide-react"
import { type ReactNode, useId, useRef, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { PanelSelectContent } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection, PanelSectionTitle } from "../../chrome/PanelSection.tsx"
import { type PropValue, readValue, textValue } from "../../chrome/prop-values.ts"
import { formatNumber, stepCount } from "./css-values.ts"
import { type LiveEdits, LiveEditsContext, MessageLine, ValueField, wrappingText } from "./field-parts.tsx"
import { Field, FieldGrid, SwitchRow, TitleMenu } from "./field-row.tsx"
import { readNumber } from "./typing.ts"

/** A prop's name as its row shows it, with a capital first letter: `showRising` is ShowRising. */
const shownName = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

/** A variant's options with its default first, as State lists its first state first: what unset comes to. */
const defaultFirst = <O extends { id: string }>(options: readonly O[], first: string | undefined) => [
  ...options.filter((option) => option.id === first),
  ...options.filter((option) => option.id !== first)
]

/** Shows a number on the canvas while it's typed or scrubbed, before it's made, and takes it back. */
export interface PropPreview {
  onPreview: (value: number | undefined) => void
  onCancel: () => void
}

/**
 * What one prop's row edits: the value the layer gives it, unset where it gives none, and the default, which an unset field shows
 * faintly. `shown` is a value that isn't edited here, as one a library makes or layers in a slot. `hint` says more about
 * it on hover, `changed` puts the reset arrow by its name, and `action` is a button at the end of its name's row.
 */
export type PropValueRow =
  | { type: "text"; value?: string; default?: string; placeholder?: string }
  | { type: "number"; value?: number; default?: number; preview?: PropPreview }
  | { type: "boolean"; value: boolean }
  /** Anything else a prop takes, as an object or a list, typed as JSON, or as any value where it's `loose`. */
  | { type: "value"; value?: PropValue; default?: PropValue; loose?: boolean }
  | { type: "variant"; value?: string; default?: string; options: readonly { id: string; name: string }[] }
  | { type: "shown"; shown: ReactNode }

/** A prop's row: its value, and its name, hint, reset and action. */
export type PropRow = PropValueRow & {
  name: string
  hint?: string
  changed?: boolean
  onReset?: () => void
  action?: ReactNode
}

/** A component instance's prop, as its section and its stories give it. */
export type InstanceProp = PropRow

/** Sets a prop: undefined unsets it, so its default shows. A run of Up and Down presses shares `gesture`. */
type PropChange = (name: string, value: PropValue | undefined, gesture?: string) => void

/**
 * Props' rows, drawn as the style sections draw theirs: the name above the control, a switch row for one that's on or
 * off, a field's box for text and numbers, JSON for objects and lists, and Tag's select for options.
 */
export function PropRows({ rows, onChange }: { rows: readonly PropRow[]; onChange: PropChange }) {
  return rows.map((row) => {
    const label = shownName(row.name)

    if (row.type === "boolean") {
      return (
        <SwitchRow
          key={row.name}
          label={label}
          detail={row.hint}
          changed={row.changed}
          onReset={row.onReset}
          checked={row.value}
          onCheckedChange={(next) => onChange(row.name, next)}
        />
      )
    }

    let control: ReactNode

    if (row.type === "shown") {
      control = <div className="flex h-7 items-center text-xs text-muted-foreground">{row.shown}</div>
    } else if (row.type === "variant") {
      control = (
        <Choice
          label={label}
          value={row.value}
          placeholder={row.options.find((option) => option.id === row.default)?.name}
          options={defaultFirst(row.options, row.default)}
          onChange={(next) => onChange(row.name, next === row.default ? undefined : next)}
        />
      )
    } else if (row.type === "number") {
      control = (
        <NumberProp
          label={label}
          value={row.value}
          placeholder={row.default}
          preview={row.preview}
          onChange={(next, gesture) => onChange(row.name, next, gesture)}
        />
      )
    } else if (row.type === "value") {
      control = (
        <JsonProp
          label={label}
          value={row.value}
          placeholder={row.default}
          loose={row.loose}
          onChange={(next) => onChange(row.name, next)}
        />
      )
    } else {
      control = (
        <TextProp
          label={label}
          value={row.value ?? ""}
          placeholder={row.placeholder ?? row.default}
          onCommit={(text) => onChange(row.name, text === "" ? undefined : text)}
        />
      )
    }

    return (
      <Field
        key={row.name}
        label={label}
        hint={row.hint}
        changed={row.changed}
        onReset={row.onReset}
        action={row.action}
      >
        {control}
      </Field>
    )
  })
}

export interface InstanceSectionProps {
  /** The component's name, in the title row. */
  component: string
  /** Goes to the component, from its name; without it, the component is a library's, and its name says so on hover. */
  onGoTo?: () => void
  /** Where a library's component comes from, for its name's hint. */
  linked?: string
  /** The component's states, its first the one shown while none is set, and the one the instance shows. */
  states: readonly { id: string; name: string }[]
  state: string | undefined
  props: readonly PropRow[]
  /** Changed in the state being edited, with the reset arrow by its name, for a row that doesn't say so itself. */
  changed?: (name: string) => boolean
  onResetProp?: (name: string) => void
  onState: (state: string | undefined) => void
  onChange: PropChange
  /**
   * The menu beside the component's name, for one of the design's own instances: how many layers inside it differ from
   * the component, the components it could become, and Push to main where the component is the project's.
   */
  menu?: {
    overrides: number
    swappable: readonly { id: string; name: string }[]
    onSwap: (id: string) => void
    onResetOverrides: () => void
    onPush?: () => void
    onDetach: () => void
  }
  /** What leads the section, as a note that its edits change the design itself. */
  note?: ReactNode
  /** What follows the props, as the instance's slots. */
  children?: ReactNode
}

/**
 * A component instance: the state it shows, which isn't a prop, then its props under their own heading. Going to the
 * component is its name in the title row, and swapping, resetting overrides, pushing them to the component and
 * detaching are in the menu beside it, as Penpot's and Figma's instance menus hold them.
 */
export function InstanceSection(props: InstanceSectionProps) {
  const { component, onGoTo, linked, states, state, menu, changed = () => false, onResetProp } = props
  const first = states[0]

  const rows = props.props.map((row) => ({
    ...row,
    changed: row.changed ?? changed(row.name),
    onReset: row.onReset ?? (onResetProp && (() => onResetProp(row.name)))
  }))

  const name = (
    <>
      <Diamond className="size-3.5 shrink-0" style={{ color: kindColors.component }} />
      <span className="truncate">{component}</span>
    </>
  )

  return (
    <PanelSection
      title="Component instance"
      action={
        // The title keeps its one line: a long component name is cut short, and its hint says it whole.
        <span className="flex max-w-32 min-w-0 items-center gap-0.5">
          {onGoTo ? (
            <Hint label={`Go to ${component}`} wait>
              <Button variant="ghost" size="sm" className="h-6 min-w-0 px-2 text-xs" onClick={onGoTo}>
                {name}
              </Button>
            </Hint>
          ) : (
            <Hint label={`Linked to ${component} in ${linked ?? "a library"}, which changes it`} wait>
              <span className="flex h-6 min-w-0 items-center gap-1.5 px-2 text-xs text-muted-foreground">{name}</span>
            </Hint>
          )}
          {menu && <InstanceMenu {...menu} />}
        </span>
      }
    >
      {props.note}
      <FieldGrid>
        {first && (
          <Field label="State">
            <Choice
              label="State"
              value={state ?? first.id}
              options={states}
              onChange={(next) => props.onState(next === first.id ? undefined : next)}
            />
          </Field>
        )}
        {rows.length > 0 && (
          <div className="col-span-2 -mb-1">
            <PanelSectionTitle title="Props" tone="quiet" />
          </div>
        )}
        <PropRows rows={rows} onChange={props.onChange} />
      </FieldGrid>
      {props.children && <div className="mt-2.5">{props.children}</div>}
      {/* Hidden from the eye, so the count is said where the menu is. */}
      {menu && menu.overrides > 0 && <span className="sr-only">{`${menu.overrides} overrides inside`}</span>}
    </PanelSection>
  )
}

/** Swap, Reset overrides, Push to main and Detach, from the title row. */
function InstanceMenu({
  swappable,
  overrides,
  onSwap,
  onResetOverrides,
  onPush,
  onDetach
}: NonNullable<InstanceSectionProps["menu"]>) {
  return (
    <TitleMenu label="More instance options" hinted menuClassName="w-56">
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={swappable.length === 0}>
          <Replace /> Swap component
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-48">
          {swappable.map((candidate) => (
            <DropdownMenuItem key={candidate.id} onClick={() => onSwap(candidate.id)}>
              <Diamond style={{ color: kindColors.component }} /> {candidate.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem disabled={overrides === 0} onClick={onResetOverrides}>
        <RotateCcw /> Reset overrides
        {overrides > 0 && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{overrides}</span>}
      </DropdownMenuItem>
      {onPush && (
        <DropdownMenuItem disabled={overrides === 0} onClick={onPush}>
          <ArrowUpToLine /> Push to main
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onDetach}>
        <Unlink /> Detach
      </DropdownMenuItem>
    </TitleMenu>
  )
}

/** A choice of one, in the select Tag uses. Unset, it's empty, with what it comes to anyway shown faintly. */
function Choice({
  label,
  value,
  placeholder,
  options,
  onChange
}: {
  label: string
  value: string | undefined
  placeholder?: string
  options: readonly { id: string; name: string }[]
  onChange: (value: string) => void
}) {
  const items = options.map((option) => ({ value: option.id, label: option.name }))

  return (
    <Select items={items} value={value ?? null} onValueChange={(next) => next !== null && onChange(next)}>
      <SelectTrigger size="sm" aria-label={label} className="h-7 w-full text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <PanelSelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </PanelSelectContent>
    </Select>
  )
}

/** A text box that wraps and grows, with a handle to drag it taller, as Content's Text is drawn. */
const growingBox = `${wrappingText} min-h-7 w-full resize-y rounded-md bg-muted/50 px-2 py-1.5 text-xs leading-snug outline-none ring-inset placeholder:text-muted-foreground dark:bg-input/40`

/** How a box is outlined: faintly on hover, in the ring's color on focus, or in red while what's in it can't be read. */
const boxRing = (error: boolean) =>
  error ? "ring-1 ring-destructive" : "hover:not-focus:ring-1 hover:not-focus:ring-border focus:ring-1 focus:ring-ring"

/**
 * A text prop, in a box that wraps and grows, and its handle drags it taller, as Content's Text does. Enter or leaving
 * keeps what's typed, Shift+Enter starts a line, and Escape puts the value back. Empty, it's unset, and the component's
 * default shows faintly.
 */
function TextProp({
  label,
  value,
  placeholder,
  onCommit
}: {
  label: string
  value: string
  placeholder?: string
  onCommit: (text: string) => void
}) {
  return (
    <textarea
      key={value}
      aria-label={label}
      defaultValue={value}
      placeholder={placeholder}
      rows={1}
      className={`${growingBox} ${boxRing(false)}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.value = value
          event.currentTarget.blur()
        } else if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      onBlur={(event) => event.currentTarget.value !== value && onCommit(event.currentTarget.value)}
    />
  )
}

/**
 * A number prop, in the approved number field: it takes the app's maths (`+2`, `*2`, `(24 - 4) / 2`), steps by 1 on Up
 * and Down, 10 with Shift, and scrubs. What it can't read stays, outlined, with the reason under it, and nothing is
 * changed. Empty, it's unset, and the component's default shows faintly. With `preview`, what's typed or scrubbed shows
 * on the canvas before it's made, maths works from the value as it was before the preview (PAR-203), and a run of Up
 * and Down presses is one undo step.
 */
function NumberProp({
  label,
  value,
  placeholder,
  preview,
  onChange
}: {
  label: string
  value: number | undefined
  placeholder?: number
  preview?: PropPreview
  onChange: (value: number | undefined, gesture?: string) => void
}) {
  const id = useId()
  // The value before a preview began, which maths works from while the canvas shows the preview.
  const before = useRef<{ value: number | undefined }>(undefined)
  const mode = useRef<"make" | "preview" | "step">("make")
  const run = useRef<string>(undefined)
  const runs = useRef(0)
  const current = () => (before.current ? before.current.value : value)
  const from = () => current() ?? placeholder ?? 0

  const live: LiveEdits | undefined = preview && {
    preview: (change) => {
      before.current ??= { value }
      mode.current = "preview"
      change()
      mode.current = "make"
    },
    cancel: () => {
      before.current = undefined
      preview.onCancel()
    },
    step: (change) => {
      run.current ??= `${id}-${(runs.current += 1)}`
      mode.current = "step"
      change()
      mode.current = "make"
    },
    endRun: () => {
      run.current = undefined
    }
  }

  const make = (next: number | undefined) => {
    if (mode.current === "preview" && preview) {
      preview.onPreview(next)

      return
    }

    before.current = undefined
    onChange(next, mode.current === "step" ? run.current : undefined)
  }

  return (
    <LiveEditsContext value={live}>
      <ValueField<number | undefined>
        label={label}
        scrub={{ from, apply: make, by: { step: 1, shiftStep: 10 } }}
        shown={value === undefined ? undefined : formatNumber(value)}
        placeholder={placeholder === undefined ? "" : formatNumber(placeholder)}
        read={(text) => {
          const reading = readNumber(text, current() ?? placeholder, label)

          if ("clear" in reading) {
            return { value: undefined }
          }

          return "value" in reading ? { value: reading.value } : { reason: reading.reason }
        }}
        onCommit={make}
        onStep={(up, keys) => make(from() + stepCount(up, keys.shift))}
      />
    </LiveEditsContext>
  )
}

/**
 * An object or list prop, as JSON in code, a key to a line so it reads, in a box that grows and its handle drags
 * taller. Enter starts a line, since JSON has them; it's read when it's left. JSON that doesn't parse stays, outlined,
 * with the reason under it, and nothing is changed, so an object never turns into text; Escape puts the value back.
 * A `loose` one, whose type isn't known, takes JSON where what's typed reads as JSON, and text otherwise. Empty, it's
 * unset, and the default shows faintly.
 */
function JsonProp({
  label,
  value,
  placeholder,
  loose = false,
  onChange
}: {
  label: string
  value: PropValue | undefined
  placeholder?: PropValue
  loose?: boolean
  onChange: (value: PropValue | undefined) => void
}) {
  // A loose prop's text shows as it is, without JSON's quotes, as it's read back.
  const text = loose ? textValue.safeParse(value).data : undefined
  const shown = text ?? (value === undefined ? "" : JSON.stringify(value, null, 2))

  const [reason, setReason] = useState<string>()
  const id = useId()

  return (
    <div className="flex min-w-0 flex-col">
      <textarea
        key={shown}
        aria-label={label}
        aria-invalid={reason ? true : undefined}
        aria-describedby={reason ? id : undefined}
        defaultValue={shown}
        placeholder={placeholder === undefined ? undefined : JSON.stringify(placeholder)}
        rows={1}
        spellCheck={false}
        className={`${growingBox} font-mono ${boxRing(reason !== undefined)}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.value = shown
            setReason(undefined)
            event.currentTarget.blur()
          }
        }}
        onBlur={(event) => {
          const text = event.currentTarget.value

          if (text === shown) {
            return
          }

          const read = readValue(text, loose ? "any" : "json")

          if ("error" in read) {
            setReason(read.error)
          } else {
            setReason(undefined)
            onChange(read.value)
          }
        }}
      />
      <MessageLine id={id} message={reason ? { tone: "error", text: reason } : undefined} />
    </div>
  )
}
