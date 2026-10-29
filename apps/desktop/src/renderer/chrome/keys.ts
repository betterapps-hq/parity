/** Matching key events to shortcuts written as on Windows (`Ctrl Shift Z`), and showing them as each platform does. */

export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent)
}

/** Punctuation and the rest, by the physical key, so the layout's Shift and Alt characters don't change them. */
const codes: Record<string, readonly string[]> = {
  "+": ["Equal", "NumpadAdd"],
  "-": ["Minus", "NumpadSubtract"],
  "/": ["Slash", "NumpadDivide"],
  "?": ["Slash"],
  "\\": ["Backslash", "IntlBackslash"],
  ",": ["Comma"],
  ".": ["Period"],
  "[": ["BracketLeft"],
  "]": ["BracketRight"],
  "'": ["Quote"]
}

const named: Record<string, readonly string[]> = {
  Del: ["Delete"],
  Backspace: ["Backspace"],
  Esc: ["Escape"],
  Enter: ["Enter"],
  Tab: ["Tab"],
  Space: [" "]
}

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
  if ((event.ctrlKey || event.metaKey) !== ctrl || event.altKey !== alt) return false
  // Plus and minus are Shift's characters on some keyboards, so Shift doesn't change them.
  if (event.shiftKey !== shift && key !== "+" && key !== "-") return false
  if (/^[A-Z]$/.test(key)) {
    // The letter typed, where the layout types one; otherwise the key's place, as when Alt types another character on a
    // Mac or the layout isn't Latin.
    const typed = /^[a-z]$/i.test(event.key) ? event.key.toUpperCase() : undefined
    return typed ? typed === key : event.code === `Key${key}`
  }
  if (/^[0-9]$/.test(key)) return event.code === `Digit${key}` || event.code === `Numpad${key}`
  if (/^F[0-9]{1,2}$/.test(key)) return event.key === key
  const physical = codes[key]
  if (physical) return physical.includes(event.code)
  return named[key]?.includes(event.key) ?? event.key === key
}

const macSymbols: Record<string, string> = {
  Ctrl: "⌘",
  Alt: "⌥",
  Shift: "⇧",
  Del: "⌫",
  Backspace: "⌫",
  Enter: "↩",
  Tab: "⇥",
  Esc: "⎋"
}

/**
 * Keys as the platform shows them: as written on Windows and Linux, and with the Mac's symbols, modifiers first in the
 * Mac's order, on a Mac (`Ctrl Shift Z` is `⇧⌘Z`). Text that isn't keys is left alone.
 */
export function formatKeys(keys: string, mac = isMac()): string {
  if (!mac) return keys
  const parts = keys.split(" ")
  if (!parts.every(isKeyName)) return keys
  const held = ["Alt", "Shift", "Ctrl"].filter((modifier) => parts.includes(modifier)).map((part) => macSymbols[part])
  const rest = parts.filter((part) => !modifierNames.includes(part)).map((part) => macSymbols[part] ?? part)
  return [...held, ...rest].join("")
}

const modifierNames = ["Ctrl", "Alt", "Shift"]
const keyNames = ["Space", "Home", "End", "PageUp", "PageDown"]

function isKeyName(part: string): boolean {
  return part.length === 1 || part in macSymbols || keyNames.includes(part) || /^F[0-9]{1,2}$/.test(part)
}
