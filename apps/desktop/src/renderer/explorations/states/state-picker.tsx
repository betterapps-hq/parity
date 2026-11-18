import { Badge, Button, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator } from "@buildkitgg/shadcn"
import { Check, ChevronDown, Plus, Star } from "lucide-react"
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react"
import { iconFor } from "../../chrome/command-icons.ts"
import { Hint } from "../../chrome/Hint.tsx"
import { shortcutFor } from "../../chrome/keymap.ts"
import { formatKeys } from "../../chrome/keys.ts"
import { comboboxProps } from "../../inspector/controls/field-parts.tsx"
import { Field, TitleMenu } from "../../inspector/controls/field-row.tsx"
import { baseId } from "./states-model.ts"

/** A state as the picker lists it. */
export interface PickerState {
  id: string
  name: string
  /** The values it sets, in a line under its name, as a preset's list says what each comes to. */
  summary: string
  /** Its props have changes it hasn't saved, or the instance's differ from it. */
  changed: boolean
  isDefault: boolean
}

export interface StatePickerProps {
  states: readonly PickerState[]
  /** The state the props showing are in; none where they're in no saved state. */
  current?: string
  /** What a state's dot says to a screen reader: "unsaved changes", or "changed" on an instance. */
  changedLabel: string
  /** The state whose name is being typed. */
  renaming?: string
  /** Why the name typed can't be had, under the field. */
  nameError?: string
  onPick: (id: string) => void
  /** Saves the props showing as a new state, with the name typed in the search, or one of its own to type over. */
  onSaveAsNew: (name?: string) => void
  onRenaming: (id: string | undefined) => void
  /** Renames a state, or says why it can't be: then its name stays open to type. */
  onRename: (id: string, name: string) => boolean
  onDuplicate: (id: string) => void
  onDefault: (id: string) => void
  onDelete: (id: string) => void
}

/**
 * A component's states, at the top of its props wherever they're edited: on the component, or on an instance of it.
 * However many there are, it's one row, as a type preset is: State, the state the props are in, and the list of them
 * all under it, which a click on the field, its chevron or Alt+Down opens and typing searches. Each is listed with what
 * it sets and a check by the one the props are in, and picking one puts its props in. The list's foot saves the props
 * showing as a new state, under the name typed where no state has it. ⋯ at the end of State's name does too, and
 * renames, duplicates, makes the default or deletes the state the props are in. A dot says a state's props have
 * changed since it was saved.
 */
export function StatePicker(props: StatePickerProps) {
  const { states, renaming, nameError } = props
  const current = states.find((state) => state.id === props.current)

  return (
    <div className="mb-4">
      <Field
        label="State"
        // No + of its own: the Props title's + adds a prop, and two side by side would be mistaken for each other.
        action={<StateMenu {...props} state={current} />}
      >
        {renaming ? <NameField key={renaming} {...props} id={renaming} /> : <Search {...props} current={current} />}
        {nameError && (
          <p id="state-name-error" role="alert" className="type-message text-destructive">
            {nameError}
          </p>
        )}
      </Field>
    </div>
  )
}

const box =
  "flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-muted/50 pr-0.5 pl-2 text-xs ring-inset dark:bg-input/40"

function Dot({ label }: { label: string }) {
  return (
    <span className="size-1.5 shrink-0 rounded-full bg-current opacity-80">
      <span className="sr-only">, {label}</span>
    </span>
  )
}

function DefaultTag() {
  return (
    <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-2xs">
      Default
    </Badge>
  )
}

/** The field: the state the props are in, which typing searches the states from, over the list of them. */
function Search({
  states,
  current,
  changedLabel,
  ...props
}: Omit<StatePickerProps, "current"> & { current?: PickerState }) {
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState<string>()
  const [highlight, setHighlight] = useState(0)

  const typed = (query ?? "").trim()
  const searched = typed.toLowerCase()
  const matches = searched === "" ? states : states.filter((state) => state.name.toLowerCase().includes(searched))
  // What's typed, where it finds no state: the name the list's foot saves the props as.
  const newName = typed !== "" && matches.length === 0 ? typed : undefined

  const close = () => {
    setOpen(false)
    setQuery(undefined)
  }

  // The highlighted state stays in view as Up and Down move through a long list, and when it opens on the current one.
  useEffect(() => {
    if (open) {
      input.current?.ownerDocument.getElementById(`${listId}-${highlight}`)?.scrollIntoView({ block: "nearest" })
    }
  }, [open, highlight, listId])

  const show = () => {
    setHighlight(
      Math.max(
        0,
        states.findIndex((state) => state.id === current?.id)
      )
    )
    setOpen(true)
  }

  const pick = (index: number) => {
    const state = matches[index]

    if (state) {
      props.onPick(state.id)
    }

    close()
    requestAnimationFrame(() => input.current?.select())
  }

  const saveAsNew = () => {
    props.onSaveAsNew(newName)
    close()
  }

  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    const command = shortcutFor(event.nativeEvent, ["rename", "duplicate"])

    if (command && current && current.id !== baseId) {
      event.preventDefault()
      close()

      if (command === "duplicate") {
        props.onDuplicate(current.id)
      } else {
        props.onRenaming(current.id)
      }

      return
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()

      if (!open) {
        show()
      } else if (matches.length > 0) {
        const by = event.key === "ArrowDown" ? 1 : -1
        setHighlight((at) => (at + by + matches.length) % matches.length)
      }
    } else if (event.key === "Enter") {
      event.preventDefault()

      if (open && matches.length > 0) {
        pick(highlight)
      } else if (newName) {
        saveAsNew()
      }
    } else if (event.key === "Escape" && (open || query !== undefined)) {
      event.preventDefault()
      close()
    }
  }

  const searching = query !== undefined

  return (
    <div className="relative">
      <div
        onPointerDown={(event) => {
          if (event.target !== input.current) {
            event.preventDefault()
            input.current?.focus()
            show()
          }
        }}
        className={`${box} ${open ? "ring-1 ring-ring" : "hover:ring-1 hover:ring-border focus-within:ring-1 focus-within:ring-ring"}`}
      >
        <input
          ref={input}
          {...comboboxProps({ listId, open, highlight: matches.length > 0 ? highlight : undefined })}
          aria-label="State"
          value={query ?? current?.name ?? ""}
          placeholder="None"
          onFocus={(event) => event.currentTarget.select()}
          onClick={() => !open && show()}
          onChange={(event) => {
            setQuery(event.currentTarget.value)
            setHighlight(0)
            setOpen(true)
          }}
          onKeyDown={keys}
          onBlur={close}
          className="max-w-full min-w-6 bg-transparent font-medium outline-none field-sizing-content placeholder:font-normal placeholder:text-muted-foreground"
        />
        {!searching && current?.isDefault && <DefaultTag />}
        {!searching && current?.changed && <Dot label={changedLabel} />}
        <span className="flex-1" />
        <Hint label="States" detail={formatKeys("Alt Down")}>
          <button
            type="button"
            tabIndex={-1}
            aria-label="States"
            className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </Hint>
      </div>
      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 flex animate-in flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md duration-100 fade-in-0 zoom-in-95">
          {matches.length > 0 ? (
            <div
              id={listId}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a combobox's listbox, each state drawn with what it sets
              role="listbox"
              aria-label="States"
              className="flex max-h-72 flex-col overflow-y-auto p-1"
            >
              {matches.map((state, index) => (
                <div
                  key={state.id}
                  id={`${listId}-${index}`}
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the listbox above
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === highlight}
                  aria-current={state.id === current?.id || undefined}
                  onPointerEnter={() => setHighlight(index)}
                  onPointerDown={(event) => {
                    // The field keeps focus, so the pick is read as a choice, not as leaving it.
                    event.preventDefault()
                    pick(index)
                  }}
                  className={`flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs ${index === highlight ? "bg-accent" : ""}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{state.name}</span>
                      {state.isDefault && <DefaultTag />}
                      {state.changed && <Dot label={changedLabel} />}
                    </span>
                    {state.summary && <span className="truncate text-muted-foreground">{state.summary}</span>}
                  </span>
                  {state.id === current?.id && <Check aria-hidden className="size-3.5 shrink-0" />}
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 py-2.5 text-xs text-muted-foreground" aria-live="polite">
              No state called {typed}
            </p>
          )}
          <div className="border-t p-1">
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={(event) => {
                event.preventDefault()
                saveAsNew()
              }}
              className="flex w-full min-w-0 cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
            >
              <Plus aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{newName ? `Save as ${newName}` : "Save as new state"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The field while a state's name is typed: Enter keeps it, Escape keeps the old one. */
function NameField({ id, states, nameError, onRename, onRenaming }: StatePickerProps & { id: string }) {
  const state = states.find((each) => each.id === id)

  return (
    <div className={`${box} ring-1 ${nameError ? "ring-destructive" : "ring-ring"}`}>
      <input
        aria-label="State name"
        aria-invalid={nameError !== undefined}
        aria-describedby={nameError ? "state-name-error" : undefined}
        defaultValue={state?.name}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- a state's name is typed as soon as it's asked for
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => {
          // Leaving a name that's taken keeps the old one rather than holding focus.
          if (!onRename(id, event.currentTarget.value)) {
            onRenaming(undefined)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onRename(id, event.currentTarget.value)
          } else if (event.key === "Escape") {
            onRenaming(undefined)
          }
        }}
        className="min-w-0 flex-1 bg-transparent font-medium outline-none"
      />
    </div>
  )
}

/**
 * ⋯ at the end of State's name: saving the props showing as a new state, then what can be done to the state they're in,
 * where they're in one.
 */
function StateMenu({
  state,
  onSaveAsNew,
  onRenaming,
  onDuplicate,
  onDefault,
  onDelete
}: StatePickerProps & { state: PickerState | undefined }) {
  const base = state?.id === baseId

  return (
    <TitleMenu
      label={state ? `More options for ${state.name}` : "More state options"}
      className="size-5"
      menuClassName="w-48"
    >
      <DropdownMenuItem onClick={() => onSaveAsNew()}>
        <Plus /> Save as new state
      </DropdownMenuItem>
      {state && (
        <>
          <DropdownMenuSeparator />
          {!base && (
            <>
              <DropdownMenuItem onClick={() => onRenaming(state.id)}>{iconFor("rename")} Rename</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(state.id)}>
                {iconFor("duplicate")} Duplicate
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuCheckboxItem
            checked={state.isDefault}
            disabled={base && state.isDefault}
            // Unticked, Default goes back to Base.
            onCheckedChange={() => onDefault(state.isDefault ? baseId : state.id)}
          >
            <Star /> Default
          </DropdownMenuCheckboxItem>
          {!base && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(state.id)}>
                {iconFor("delete")} Delete
              </DropdownMenuItem>
            </>
          )}
        </>
      )}
    </TitleMenu>
  )
}

/**
 * Under the props while they differ from the state they're in, as Settings' bar is while the project has changes it
 * hasn't saved: what's changed, taking the changes back, and saving them to the state. It stays in view at the bottom of
 * the panel while the props scroll under it.
 */
export function ChangesBar({
  status,
  revert,
  save,
  revertHint,
  saveHint,
  onRevert,
  onSave
}: {
  status: string
  revert: string
  save: string
  /** What Revert and Save name on hover: the state they act on. */
  revertHint: string
  saveHint: string
  onRevert: () => void
  onSave: () => void
}) {
  return (
    <section
      aria-label={status}
      className="sticky bottom-3 mt-4 flex animate-in items-center gap-1 rounded-lg border bg-popover py-1 pr-1 pl-2.5 duration-200 fade-in slide-in-from-bottom-2"
    >
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{status}</span>
      <Hint label={revertHint}>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onRevert}>
          {revert}
        </Button>
      </Hint>
      <Hint label={saveHint}>
        <Button size="sm" className="h-6 px-2.5 text-xs" onClick={onSave}>
          {save}
        </Button>
      </Hint>
    </section>
  )
}
