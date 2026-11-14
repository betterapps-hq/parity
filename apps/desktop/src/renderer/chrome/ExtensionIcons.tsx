import type { PathIcon } from "@parity-app/extension-api"
import { DynamicIcon, type IconName, iconNames } from "lucide-react/dynamic"

/** Whether a name is one of the kit's icons. */
function isIconName(name: string): name is IconName {
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
    <svg viewBox={icon.viewBox} className={className} fill="currentColor" aria-hidden>
      <path d={icon.path} fillRule={icon.fillRule ?? "nonzero"} />
    </svg>
  )
}
