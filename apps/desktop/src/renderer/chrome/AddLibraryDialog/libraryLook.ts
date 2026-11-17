import type { CSSProperties } from "react"
import type { LibraryLook } from "../../../shared/protocol.ts"
import type { PreviewToken } from "../token-previews.tsx"

/** The name a theme context goes by, the default being the light one. */
export function themeLabel(theme: string): string {
  if (theme === "default") {
    return "Light"
  }

  const words = theme.split("-").join(" ")

  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** What each part of a look comes to in `theme`, from the tokens it names. */
export function lookIn(look: LibraryLook, tokens: readonly PreviewToken[], theme: string) {
  const byName = new Map(tokens.map((token) => [token.name, token]))

  const value = (name: string | undefined) => {
    const token = name === undefined ? undefined : byName.get(name)

    return token && (token.values[theme] ?? token.values.default)
  }

  return {
    primary: value(look.primary),
    onPrimary: value(look.onPrimary),
    surface: value(look.surface),
    text: value(look.text),
    muted: value(look.muted),
    border: value(look.border),
    radius: value(look.radius),
    font: value(look.font),
    shadow: value(look.shadow)
  }
}

/** A font token's value as style: a shorthand, as `400 1rem/1.5 "Roboto"`, sets `font`; anything else the family. */
export function fontStyle(font: string | undefined): CSSProperties {
  if (!font) {
    return {}
  }

  return /^\d{3}\s/.test(font) ? { font } : { fontFamily: font }
}

/** The theme a token is drawn in: the one chosen when it has a value there, else its default, which others inherit. */
export function themeOf(token: PreviewToken, theme: string): string {
  return theme in token.values ? theme : "default"
}
