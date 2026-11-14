import type { ComponentType } from "react"
import type { Logo } from "./logos.ts"

/** An icon a page or extension shows: a Lucide icon, or an extension's logo drawn as one. */
export type Mark = ComponentType<{ className?: string }>

/** An extension's logo as an icon, filled with the text's color and sized as Lucide's are. */
export function markOf(logo: Logo, name: string): Mark {
  function LogoMark({ className = "size-4" }: { className?: string }) {
    return (
      <svg viewBox={logo.viewBox} className={className} fill="currentColor" aria-hidden>
        <path d={logo.path} fillRule={logo.fillRule} clipRule={logo.fillRule} />
      </svg>
    )
  }

  LogoMark.displayName = `${name}Logo`

  return LogoMark
}
