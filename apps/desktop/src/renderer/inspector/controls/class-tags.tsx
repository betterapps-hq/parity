import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput } from "@buildkitgg/shadcn-baseui-kit"
import { type ClipboardEvent, type KeyboardEvent, useState } from "react"
import { ChangeMark, useChanged } from "./field-parts.tsx"

/** A class split into its variants (`sm:`, `hover:`), drawn faintly, and the utility after them. */
function splitClass(name: string): { variants: string; utility: string } {
  const at = name.lastIndexOf(":")

  return at < 0 ? { variants: "", utility: name } : { variants: name.slice(0, at + 1), utility: name.slice(at + 1) }
}

/** Classes as typed or pasted, split on whitespace, without empties. */
export const classesIn = (text: string) => text.split(/\s+/).filter((name) => name !== "")

/**
 * Class names as tags, as a `className` prop is drawn (PAR-1021), on the kit's Combobox chips: each class a chip in
 * code, its variants (`sm:`, `hover:`) faint before the utility, with the chip's × to remove it. Typing after the chips
 * adds one on Space, Enter or Tab, pasting adds each class pasted, and Backspace in the empty input removes the last,
 * as the chips do. A class already there isn't added twice. Leaving keeps what's typed as a chip. The box grows to fit
 * its chips, and draws the change mark where the value's changed (PAR-1020).
 */
export function ClassTagsField({
  label,
  classes,
  onChange
}: {
  label: string
  classes: readonly string[]
  onChange: (classes: string[]) => void
}) {
  const [draft, setDraft] = useState("")
  const changed = useChanged()

  const add = (names: readonly string[]) => {
    const next = [...classes]

    for (const name of names) {
      if (!next.includes(name)) {
        next.push(name)
      }
    }

    if (next.length !== classes.length) {
      onChange(next)
    }

    setDraft("")
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === " " || event.key === "Enter" || event.key === "Tab") && draft.trim() !== "") {
      // Tab adds the class and moves on, as leaving does.
      if (event.key !== "Tab") {
        event.preventDefault()
      }

      add(classesIn(draft))
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = classesIn(event.clipboardData.getData("text"))

    if (pasted.length > 1) {
      event.preventDefault()
      add([...classesIn(draft), ...pasted])
    }
  }

  return (
    <Combobox
      multiple
      value={[...classes]}
      onValueChange={(next: string[]) => onChange(next)}
      inputValue={draft}
      onInputValueChange={setDraft}
    >
      <ComboboxChips className="relative min-h-7 w-full min-w-0 gap-1 rounded-md border-0 bg-muted/50 px-1 py-1 text-xs ring-inset focus-within:ring-1 focus-within:ring-ring hover:not-focus-within:ring-1 hover:not-focus-within:ring-border dark:bg-input/40">
        {classes.map((name) => {
          const { variants, utility } = splitClass(name)

          return (
            <ComboboxChip
              key={name}
              removeLabel={`Remove ${name}`}
              className="h-5 max-w-full min-w-0 bg-accent font-mono text-2xs font-normal"
            >
              <span className="truncate">
                {variants && <span className="text-muted-foreground">{variants}</span>}
                {utility}
              </span>
            </ComboboxChip>
          )
        })}
        <ComboboxChipsInput
          aria-label={label}
          placeholder={classes.length === 0 ? "Add classes" : undefined}
          spellCheck={false}
          className="h-5 bg-transparent px-1 font-mono text-2xs placeholder:font-sans placeholder:text-xs placeholder:text-muted-foreground"
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => draft.trim() !== "" && add(classesIn(draft))}
        />
        {changed && <ChangeMark />}
      </ComboboxChips>
    </Combobox>
  )
}
