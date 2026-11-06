import { Kbd } from "@buildkitgg/shadcn-baseui-kit"
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
