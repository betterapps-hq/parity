import { setLayout } from "./layout.ts"

// A token picked in Search actions (PAR-180): the Tokens tab opens searched for its name.

let pending: string | undefined
const listeners = new Set<(name: string) => void>()

/** Opens the Tokens tab searched for a token's name. */
export function showToken(name: string): void {
  setLayout({ left: true, leftTab: "tokens" })
  if (listeners.size === 0) pending = name
  else listeners.forEach((listener) => listener(name))
}

/** The token waiting to be shown by a Tokens panel that's just opening, taken so it's shown once. */
export function takeShownToken(): string | undefined {
  const name = pending
  pending = undefined
  return name
}

/** Calls `listener` with each token shown while the Tokens panel is open. */
export function onShowToken(listener: (name: string) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
