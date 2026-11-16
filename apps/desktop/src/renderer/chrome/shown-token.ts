import { setLayout } from "./layout.ts"

// A token picked in Search actions (PAR-180): the Tokens tab opens searched for its name, in that token's project only.
// Every open project keeps its panels mounted, so each request names the project, by its folder, whose panel takes it.

const pending = new Map<string, string>()
const listeners = new Map<string, (name: string) => void>()

/** Opens the Tokens tab searched for a token's name, in the project at `root`. */
export function showToken(root: string, name: string): void {
  setLayout({ left: true, leftTab: "tokens" })
  const listener = listeners.get(root)

  if (listener) {
    listener(name)
  } else {
    pending.set(root, name)
  }
}

/** The token waiting for the project at `root`'s Tokens panel, which is just opening, taken so it's shown once. */
export function takeShownToken(root: string): string | undefined {
  const name = pending.get(root)
  pending.delete(root)

  return name
}

/** Calls `listener` with each token shown in the project at `root` while its Tokens panel is open. */
export function onShowToken(root: string, listener: (name: string) => void): () => void {
  listeners.set(root, listener)

  return () => {
    if (listeners.get(root) === listener) {
      listeners.delete(root)
    }
  }
}
