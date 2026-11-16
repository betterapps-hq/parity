import { Input } from "@buildkitgg/shadcn-baseui-kit"
import { useFieldName, useMixed } from "../inspector/controls/field-row.tsx"
import { NameInput } from "./Name.tsx"
import { swatch } from "./token-previews.tsx"

/**
 * A text input that commits on blur or Enter, so typing doesn't write a file per keystroke. One that edits a name
 * (`name`) shows it in a name's letters, through `NameInput` (docs/typography.md: Names keep their letters).
 */
export function TextInput({
  value,
  label,
  onCommit,
  placeholder,
  multiline = false,
  mono = false,
  name = false
}: {
  value: string
  /** Its accessible name, where its field's label doesn't name it. */
  label?: string
  onCommit: (value: string) => void
  placeholder?: string
  multiline?: boolean
  mono?: boolean
  /** It edits a name, which a single-line field shows in a name's letters. */
  name?: boolean
}) {
  const mixed = useMixed()
  const named = useFieldName(label)
  const className = `h-7 px-2 text-xs ${mono ? "font-mono" : ""}`

  if (multiline) {
    return (
      <textarea
        key={value}
        {...named}
        defaultValue={value}
        placeholder={mixed ? "Mixed" : placeholder}
        rows={1}
        onBlur={(event) => event.currentTarget.value !== value && onCommit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
        className="field-sizing-content max-h-36 w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
      />
    )
  }

  const Control = name ? NameInput : Input

  return (
    <Control
      key={value}
      {...named}
      defaultValue={value}
      placeholder={mixed ? "Mixed" : placeholder}
      className={className}
      onBlur={(event) => event.currentTarget.value !== value && onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function Swatch({ value, className = "size-3.5" }: { value: string; className?: string }) {
  return <span className={`${className} shrink-0 rounded-sm`} style={swatch(value)} />
}
