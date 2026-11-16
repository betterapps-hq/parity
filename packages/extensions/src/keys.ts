import type { Keybinding } from "@parity-app/extension-api"

/*
 * Extensions' keys (PAR-1092). A manifest writes keys as VS Code does, `mod+shift+t`; Parity's keymap writes them as on
 * Windows, a space between each, `Ctrl Shift T`, with Ctrl meaning Cmd on a Mac. Parity's own keys win a clash with an
 * extension's, and when two extensions claim one key, neither gets it and both are named.
 */

const modifiers = new Map([
  ["mod", "Ctrl"],
  ["ctrl", "Ctrl"],
  ["cmd", "Ctrl"],
  ["meta", "Ctrl"],
  ["alt", "Alt"],
  ["option", "Alt"],
  ["shift", "Shift"]
])

/** The order the keymap writes modifiers in. */
const modifierOrder = ["Ctrl", "Alt", "Shift"]

const named = new Map([
  ["enter", "Enter"],
  ["return", "Enter"],
  ["tab", "Tab"],
  ["space", "Space"],
  ["esc", "Esc"],
  ["escape", "Esc"],
  ["backspace", "Backspace"],
  ["delete", "Del"],
  ["del", "Del"],
  ["up", "↑"],
  ["down", "↓"],
  ["left", "←"],
  ["right", "→"],
  ["home", "Home"],
  ["end", "End"],
  ["pageup", "PageUp"],
  ["pagedown", "PageDown"]
])

/** Turns keys as a manifest writes them into the keymap's form: `mod+shift+t` into `Ctrl Shift T`. */
export function keymapKeys(manifestKeys: string): string {
  const parts = manifestKeys
    .trim()
    .split(/\+(?!$)/)
    .map((part) => part.trim().toLowerCase())

  const key = parts.at(-1)

  if (!key || parts.some((part) => part === "")) {
    throw new Error(`expected keys as mod+shift+t, not "${manifestKeys}"`)
  }

  const held = new Set<string>()

  for (const part of parts.slice(0, -1)) {
    const modifier = modifiers.get(part)

    if (!modifier) {
      throw new Error(`${part} isn't a modifier; use mod, ctrl, alt or shift`)
    }

    held.add(modifier)
  }

  if (modifiers.has(key)) {
    throw new Error(`"${manifestKeys}" is only modifiers; add the key they're held with`)
  }

  return [...modifierOrder.filter((modifier) => held.has(modifier)), keyName(key)].join(" ")
}

function keyName(key: string): string {
  const name = named.get(key)

  if (name) {
    return name
  }

  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(key)) {
    return key.toUpperCase()
  }

  if (key.length === 1) {
    return key.toUpperCase()
  }

  throw new Error(`${key} isn't a key Parity knows`)
}

/** Keys written in the keymap's form, with their modifiers in its order, so two ways of writing one key compare equal. */
export function sameKeys(keys: string): string {
  const parts = keys.split(" ")
  const key = parts.at(-1) ?? ""

  return [...modifierOrder.filter((modifier) => parts.slice(0, -1).includes(modifier)), key].join(" ")
}

/** An extension's key that works, in the keymap's form. */
export interface ExtensionKey {
  extension: string
  command: string
  keys: string
  when?: string
}

/** A key an extension asked for and didn't get, and who has it. */
export interface KeyClash {
  extension: string
  command: string
  keys: string
  /** `parity` when one of Parity's own commands has the key, or the other extensions that asked for it. */
  with: "parity" | string[]
}

/** Extensions' keys that work, and those that clash. */
export interface ResolvedKeys {
  keys: ExtensionKey[]
  clashes: KeyClash[]
}

/**
 * Which of extensions' keys work: each that no command of Parity's has and no other extension asks for. The rest are
 * named, with who has the key.
 */
export function resolveKeys(
  parityKeys: Iterable<string>,
  extensions: readonly { id: string; keybindings?: readonly Keybinding[] }[]
): ResolvedKeys {
  const taken = new Set([...parityKeys].map(sameKeys))
  const asked = new Map<string, ExtensionKey[]>()

  for (const extension of extensions) {
    for (const binding of extension.keybindings ?? []) {
      let keys: string

      try {
        keys = keymapKeys(binding.key)
      } catch {
        continue
      }

      const key: ExtensionKey = { extension: extension.id, command: binding.command, keys }

      if (binding.when !== undefined) {
        key.when = binding.when
      }

      asked.set(keys, [...(asked.get(keys) ?? []), key])
    }
  }

  const keys: ExtensionKey[] = []
  const clashes: KeyClash[] = []

  for (const [written, claims] of asked) {
    const owners = [...new Set(claims.map((claim) => claim.extension))]

    if (taken.has(written)) {
      clashes.push(...claims.map((claim) => ({ ...clash(claim), with: "parity" as const })))
    } else if (owners.length > 1) {
      clashes.push(
        ...claims.map((claim) => ({ ...clash(claim), with: owners.filter((owner) => owner !== claim.extension) }))
      )
    } else {
      keys.push(...claims)
    }
  }

  return { keys, clashes }
}

function clash({ extension, command, keys }: ExtensionKey): Omit<KeyClash, "with"> {
  return { extension, command, keys }
}
