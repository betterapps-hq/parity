import type { AdapterIcon } from "@parity-app/core"
import { Blocks } from "lucide-react"
import { brandColor } from "./ExtensionIcons.tsx"

/** An adapter's logo, filled with the text's colour, or a plain block for one that brings none. */
export function AdapterLogo({ logo, className }: { logo: AdapterIcon | undefined; className?: string }) {
  if (!logo) {
    return <Blocks className={className} />
  }

  return (
    <svg viewBox={logo.viewBox} className={className} fill="currentColor" aria-hidden {...brandColor(logo.color)}>
      <path d={logo.path} fillRule={logo.fillRule} />
    </svg>
  )
}
