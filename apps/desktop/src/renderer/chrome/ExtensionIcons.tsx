import type { PathIcon } from "@parity-app/extension"
import { DynamicIcon, type IconName, iconNames } from "lucide-react/dynamic"
import type { CSSProperties } from "react"

/** Whether a name is one of the kit's icons. */
export function isIconName(name: string): name is IconName {
  return iconNames.some((known) => known === name)
}

/**
 * A contribution's icon, by its name in the kit's icon set, which loads on its own the first time it's drawn. Without a
 * name, or with one the set doesn't have, the extension's logo stands in.
 */
export function ContributionIcon({ name, logo, className }: { name?: string; logo: PathIcon; className?: string }) {
  if (name && isIconName(name)) {
    return <DynamicIcon name={name} className={className} aria-hidden />
  }

  return <ExtensionLogo icon={logo} className={className} />
}

/** An extension's logo, drawn from its path data in the text's color. */
export function ExtensionLogo({ icon, className }: { icon: PathIcon; className?: string }) {
  return (
    <svg viewBox={icon.viewBox} className={className} fill="currentColor" aria-hidden {...brandColor(icon.color)}>
      <path d={icon.path} fillRule={icon.fillRule ?? "nonzero"} />
    </svg>
  )
}

/**
 * A logo's brand color, for what holds it to show: `data-brand` marks it, and `--brand` is the color in the current
 * theme. The status bar's items color it on hover.
 */
export function brandColor(color: PathIcon["color"]) {
  if (!color) {
    return {}
  }

  // SAFETY: a custom property, which React sets as it's named and CSSProperties has no key for.
  const style = { "--brand": `light-dark(${color.light}, ${color.dark})` } as CSSProperties

  return { "data-brand": "", style }
}
