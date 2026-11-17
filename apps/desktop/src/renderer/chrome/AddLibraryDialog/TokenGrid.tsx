import { type PreviewToken, TokenTile } from "../token-previews.tsx"
import { themeOf } from "./libraryLook.ts"
import { TokenSpecimen } from "./TokenSpecimen.tsx"

/** Every token of a kind: colors as swatches, named where the pointer rests; others as the Tokens panel's tiles. */
export function TokenGrid({ colors, tokens, theme }: { colors: boolean; tokens: PreviewToken[]; theme: string }) {
  if (colors) {
    return (
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1">
        {tokens.map((token) => (
          <li key={token.name} title={token.name} className="h-8 overflow-hidden rounded-md border">
            <TokenTile token={token} width={40} height={32} theme={themeOf(token, theme)} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,9.5rem)] justify-between gap-2">
      {tokens.map((token) => (
        <TokenSpecimen key={token.name} token={token} theme={theme} />
      ))}
    </ul>
  )
}
