import { Kbd } from "@buildkitgg/shadcn"
import { gestures as held } from "../chrome/keymap.ts"
import { formatKeys } from "../chrome/keys.ts"

/**
 * The keys a handle's hint lists under what it does, one a line, from the keymap's gestures so they're the keys that
 * work: each as `Kbd`, then what holding it does, in a word or two.
 */
export function KeyHints({ rows }: { rows: readonly { keys: string; does: string }[] }) {
  return (
    <span className="grid grid-cols-[auto_1fr] items-center gap-x-1.5 gap-y-1">
      {rows.map(({ keys, does }) => (
        <span key={`${keys}:${does}`} className="contents">
          <Kbd>{formatKeys(keys)}</Kbd>
          <span>{does}</span>
        </span>
      ))}
    </span>
  )
}

/**
 * The keys that spread a side's change, wherever one side of four is changed (a padding handle on the canvas, a side's
 * field, the box model's popover): Alt reaches the opposite side too, Alt+Shift all four.
 */
export function SpreadKeys() {
  return (
    <KeyHints
      rows={[
        { keys: held.oppositePadding.keys, does: "Both sides" },
        { keys: held.everyPadding.keys, does: "All sides" }
      ]}
    />
  )
}
