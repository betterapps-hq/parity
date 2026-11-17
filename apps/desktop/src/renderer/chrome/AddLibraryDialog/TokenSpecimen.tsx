import { useState } from "react"
import { moving, type PreviewToken, TokenTile, useHoverPlay, valueLabel } from "../token-previews.tsx"
import { themeOf } from "./libraryLook.ts"

/**
 * A token as the Tokens panel's tile draws it: its preview, with its name and value under it. Motion plays while the
 * pointer or keyboard is on it, as there, and pressing it keeps it playing.
 */
export function TokenSpecimen({ token, theme }: { token: PreviewToken; theme: string }) {
  const [held, setHeld] = useState(false)
  const { playing, handlers } = useHoverPlay(token.kind, held)
  const value = valueLabel(token)
  const tile = "flex w-full min-w-0 flex-col gap-1 rounded-md p-1 text-left hover:bg-accent/50"

  const content = (
    <>
      <TokenTile token={token} width={144} height={58} playing={playing} theme={themeOf(token, theme)} />
      <span className="flex min-w-0 items-baseline gap-1 px-0.5">
        <span className="min-w-0 flex-1 truncate font-mono text-2xs">{token.name}</span>
        {value && <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">{value}</span>}
      </span>
    </>
  )

  return (
    <li {...handlers} title={token.name} className="flex min-w-0">
      {moving.has(token.kind) ? (
        <button
          type="button"
          aria-pressed={held}
          onClick={() => setHeld(!held)}
          className={`${tile} outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:bg-accent`}
        >
          {content}
        </button>
      ) : (
        <div className={tile}>{content}</div>
      )}
    </li>
  )
}
