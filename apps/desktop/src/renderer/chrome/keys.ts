/** Matching key events to shortcuts written as on Windows (`Ctrl Shift Z`), and showing them as each platform does. */

export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent)
}

/** Punctuation and the rest, by the physical key, so the layout's Shift and Alt characters don't change them. */
const codes = new Map([
  ["+", ["Equal", "NumpadAdd"]],
  ["-", ["Minus", "NumpadSubtract"]],
  ["/", ["Slash", "NumpadDivide"]],
  ["?", ["Slash"]],
  ["\\", ["Backslash", "IntlBackslash"]],
  [",", ["Comma"]],
  [".", ["Period"]],
  ["[", ["BracketLeft"]],
  ["]", ["BracketRight"]],
  ["'", ["Quote"]]
])

const named = new Map([
  ["Del", ["Delete"]],
  ["Backspace", ["Backspace"]],
  ["Esc", ["Escape"]],
  ["Enter", ["Enter"]],
  ["Tab", ["Tab"]],
  ["Space", [" "]],
  ["←", ["ArrowLeft"]],
  ["→", ["ArrowRight"]],
  ["↑", ["ArrowUp"]],
  ["↓", ["ArrowDown"]]
])

interface Parsed {
  ctrl: boolean
  shift: boolean
  alt: boolean
  key: string
}

function parse(keys: string): Parsed {
  const parts = keys.split(" ")
  const key = parts.at(-1)!

  return { ctrl: parts.includes("Ctrl"), shift: parts.includes("Shift"), alt: parts.includes("Alt"), key }
}

/** Whether a key event is the keys written, as `Ctrl Shift Z`. Ctrl takes Cmd too, so the keys work on a Mac. */
export function matches(event: KeyboardEvent, keys: string): boolean {
  const { ctrl, shift, alt, key } = parse(keys)

  if ((event.ctrlKey || event.metaKey) !== ctrl || event.altKey !== alt) {
    return false
  }

  // Plus and minus are Shift's characters on some keyboards, so Shift doesn't change them.
  if (event.shiftKey !== shift && key !== "+" && key !== "-") {
    return false
  }

  if (/^[A-Z]$/.test(key)) {
    // The letter typed, where the layout types one; otherwise the key's place, as when Alt types another character on a
    // Mac or the layout isn't Latin.
    const typed = /^[a-z]$/i.test(event.key) ? event.key.toUpperCase() : undefined

    return typed ? typed === key : event.code === `Key${key}`
  }

  if (/^[0-9]$/.test(key)) {
    return event.code === `Digit${key}` || event.code === `Numpad${key}`
  }

  if (/^F[0-9]{1,2}$/.test(key)) {
    return event.key === key
  }

  const physical = codes.get(key)

  if (physical) {
    return physical.includes(event.code)
  }

  return named.get(key)?.includes(event.key) ?? event.key === key
}

/**
 * Whether the modifiers written, as `Alt Shift`, are all held during a pointer event, others or not. Ctrl takes Cmd
 * too, as `matches` does.
 */
export function holds(
  event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
  keys: string
): boolean {
  const parts = keys.split(" ")

  return (
    (!parts.includes("Ctrl") || event.ctrlKey || event.metaKey) &&
    (!parts.includes("Shift") || event.shiftKey) &&
    (!parts.includes("Alt") || event.altKey)
  )
}

const macSymbols = new Map([
  ["Ctrl", "⌘"],
  ["Alt", "⌥"],
  ["Shift", "⇧"],
  ["Del", "⌫"],
  ["Backspace", "⌫"],
  ["Enter", "↩"],
  ["Tab", "⇥"],
  ["Esc", "⎋"]
])

/**
 * Keys as the platform shows them: joined by `+` on Windows and Linux (`Ctrl+Shift+Z`), with a `+` or `-` key named
 * when it's joined (`Ctrl+Plus`), as Windows's own apps write them; and with the Mac's symbols, modifiers first in the
 * Mac's order, on a Mac (`⇧⌘Z`). Text that isn't keys is left alone.
 */
export function formatKeys(keys: string, mac = isMac()): string {
  const parts = keys.split(" ")

  if (!parts.every(isKeyName)) {
    return keys
  }

  if (!mac) {
    return parts.length === 1 ? keys : parts.map((part) => joinedNames.get(part) ?? part).join("+")
  }

  const held = ["Alt", "Shift", "Ctrl"].flatMap((modifier) => {
    const symbol = macSymbols.get(modifier)

    return symbol && parts.includes(modifier) ? [symbol] : []
  })

  const rest = parts.flatMap((part) => (modifierNames.includes(part) ? [] : [macSymbols.get(part) ?? part]))

  return [...held, ...rest].join("")
}

/** Keys that would read as the separator once keys are joined by `+`. */
const joinedNames = new Map([
  ["+", "Plus"],
  ["-", "Minus"]
])

const modifierNames = ["Ctrl", "Alt", "Shift"]
const keyNames = ["Space", "Home", "End", "PageUp", "PageDown"]

function isKeyName(part: string): boolean {
  return part.length === 1 || macSymbols.has(part) || keyNames.includes(part) || /^F[0-9]{1,2}$/.test(part)
}
