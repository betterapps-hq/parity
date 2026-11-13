import { type ClipboardEvent, type KeyboardEvent, useState } from "react"
import { AppChip, AppChips, AppChipsInput } from "../../chrome/AppChips.tsx"

/** A class split into its variants (`sm:`, `hover:`), drawn faintly, and the utility after them. */
function splitClass(name: string): { variants: string; utility: string } {
  const at = name.lastIndexOf(":")

  return at < 0 ? { variants: "", utility: name } : { variants: name.slice(0, at + 1), utility: name.slice(at + 1) }
}

/** Classes as typed or pasted, split on whitespace, without empties. */
export const classesIn = (text: string) => text.split(/\s+/).filter((name) => name !== "")

/**
 * Class names as tags, as a `className` prop is drawn (PAR-1021), on the app's chips (`AppChips`): each class a chip in
 * code, its variants (`sm:`, `hover:`) faint before the utility, with the chip's × to remove it. Typing after the chips
 * adds one on Space, Enter or Tab, pasting adds each class pasted, and Backspace in the empty input removes the last,
 * as the chips do. A class already there isn't added twice. Leaving keeps what's typed as a chip.
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
    <AppChips value={classes} onValueChange={onChange} inputValue={draft} onInputValueChange={setDraft}>
      {classes.map((name) => {
        const { variants, utility } = splitClass(name)

        return (
          <AppChip key={name} removeLabel={`Remove ${name}`} className="font-mono">
            <span className="truncate">
              {variants && <span className="text-muted-foreground">{variants}</span>}
              {utility}
            </span>
          </AppChip>
        )
      })}
      <AppChipsInput
        aria-label={label}
        placeholder={classes.length === 0 ? "Add classes" : undefined}
        spellCheck={false}
        className="font-mono placeholder:font-sans"
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => draft.trim() !== "" && add(classesIn(draft))}
      />
    </AppChips>
  )
}
