import type { PathIcon } from "@parity-app/extension"
import { Arrow } from "@parity-app/presence-ui"
import type { ComponentType } from "react"
import { agentPalettes } from "../../agent/agent-colors.ts"

/** An icon a page or extension shows: a Lucide icon, or an extension's logo drawn as one. */
export type Mark = ComponentType<{ className?: string }>

/** An extension's logo, from its manifest, as an icon filled with the text's color and sized as Lucide's are. */
export function markOf(logo: PathIcon, name: string): Mark {
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

/**
 * Agent presence's logo is an agent's own pointer, in an agent's colors and glow, as it's drawn on the canvas. A
 * manifest's icon is one path in the text's color, which can't show either.
 */
function AgentPresenceMark({ className = "size-4" }: { className?: string }) {
  const [palette] = agentPalettes

  return (
    <span aria-hidden className={`inline-flex items-center justify-center ${className}`}>
      {palette && <Arrow stops={palette.stops} glow={palette.color} className="size-full" />}
    </span>
  )
}

/** An extension's logo: the app's own drawing of agent presence's, else its manifest's icon. */
export function extensionMark(prefix: string, logo: PathIcon | undefined, name: string): Mark | undefined {
  if (prefix === "agentPresence") {
    return AgentPresenceMark
  }

  return logo ? markOf(logo, name) : undefined
}

/** A hue of the project's own, from its name, as an organization's badge takes one from its ID. */
function hueOf(name: string): number {
  let hue = 0

  for (const char of name) {
    hue = (hue * 31 + char.charCodeAt(0)) % 360
  }

  return hue
}

/**
 * A project's first letter in a color of its own, as `OrganizationBadge` draws an organization's: it marks what's
 * saved in the project's file wherever Settings shows it, so a project's settings read apart from the person's.
 */
export function ProjectBadge({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center leading-none font-semibold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        fontSize: Math.round(size * 0.6),
        background: `oklch(0.55 0.14 ${hueOf(name)})`
      }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

/** A project's badge as a page's icon, for the sidebar. */
export function projectMark(name: string): Mark {
  function ProjectMark() {
    return <ProjectBadge name={name} />
  }

  ProjectMark.displayName = `${name}Badge`

  return ProjectMark
}
