import { ToggleGroup, ToggleGroupItem } from "@buildkitgg/shadcn-baseui-kit"
import { Asterisk, Feather, Heart, type LucideIcon, Smile, Sticker } from "lucide-react"
import { useMemo, useState } from "react"
import { AppWindow } from "../../App.tsx"
import { type IconLayers, IconLayersContext } from "../../canvas/kinds.tsx"
import { iconLibraries } from "../../chrome/icons.tsx"
import { example } from "../../stories/fixtures.tsx"

/**
 * The fixed icons an icon layer could show. None is a kind icon Layers already draws, nor one the app uses for
 * something else: Star marks a favorite project and Shapes is Insert, so both are left out.
 */
export const iconOptions = {
  smile: { label: "Smile", icon: Smile },
  sticker: { label: "Sticker", icon: Sticker },
  heart: { label: "Heart", icon: Heart },
  asterisk: { label: "Asterisk", icon: Asterisk },
  feather: { label: "Feather", icon: Feather }
} as const satisfies Record<string, { label: string; icon: LucideIcon }>

export type IconOption = keyof typeof iconOptions

const isIconOption = (value: string): value is IconOption => value in iconOptions

/** The whole window, as the app shows it, with its icon layers drawn in the option picked in the bar above it. */
export function IconLayersStage({ initial }: { initial: IconOption }) {
  const [choice, setChoice] = useState<IconOption>(initial)
  const libraries = example().info.libraries

  const iconLayers = useMemo<IconLayers>(
    () => ({ sets: iconLibraries(libraries).map((library) => library.id), icon: iconOptions[choice].icon }),
    [libraries, choice]
  )

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b px-3">
        <span id="icon-option-label" className="text-xs text-muted-foreground">
          Icon layers show
        </span>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[choice]}
          onValueChange={([next]) => {
            if (next && isIconOption(next)) {
              setChoice(next)
            }
          }}
          aria-labelledby="icon-option-label"
        >
          {Object.entries(iconOptions).map(([value, { label, icon: Icon }]) => (
            <ToggleGroupItem key={value} value={value}>
              <Icon />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="min-h-0 flex-1">
        <IconLayersContext value={iconLayers}>
          <AppWindow />
        </IconLayersContext>
      </div>
    </div>
  )
}
