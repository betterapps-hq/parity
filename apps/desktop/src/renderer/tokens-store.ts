import type { Token } from "@parity/core"
import { useSyncExternalStore } from "react"
import type { TokenChange } from "../shared/protocol.ts"
import { previewToken } from "./guest.ts"

/**
 * A project's tokens, editable. A change shows in every frame at once (the shared stylesheet is edited in place) and is
 * written to the project's stylesheet, so the project's own build picks it up too.
 */
export class TokenStore {
  private readonly listeners = new Set<() => void>()

  constructor(
    private tokens: Token[],
    private readonly sheet: CSSStyleSheet,
    private readonly save: (changes: TokenChange[]) => Promise<unknown>
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get = () => this.tokens

  async set(changes: TokenChange[]): Promise<void> {
    if (changes.length === 0) return
    for (const change of changes) previewToken(this.sheet, change.name, change.theme, change.value)
    this.tokens = this.tokens.map((token) => {
      const mine = changes.filter((change) => change.name === token.name)
      if (mine.length === 0) return token
      const values = { ...token.values }
      for (const change of mine) values[change.theme] = change.value
      return { ...token, values }
    })
    for (const listener of this.listeners) listener()
    await this.save(changes)
  }
}

export function useTokenList(store: TokenStore): Token[] {
  return useSyncExternalStore(store.subscribe, store.get)
}

/** A token's value in a theme, following `var(--x)` references so swatches show the real color. */
export function resolveTokenValue(tokens: readonly Token[], name: string, theme = "default", depth = 0): string {
  const token = tokens.find((candidate) => candidate.name === name)
  const value = token?.values[theme] ?? token?.values.default ?? ""
  const reference = /^var\(--([\w-]+)\)$/.exec(value.trim())
  return reference && depth < 6 ? resolveTokenValue(tokens, reference[1]!, theme, depth + 1) || value : value
}

/** The pixel size of one spacing step (`--spacing`), assuming a 16px root. */
export function spacingUnit(tokens: readonly Token[]): number {
  const value = tokens.find((token) => token.name === "spacing")?.values.default ?? "0.25rem"
  const match = /^([\d.]+)(rem|px)$/.exec(value.trim())
  if (!match) return 4
  return Number(match[1]) * (match[2] === "rem" ? 16 : 1)
}
