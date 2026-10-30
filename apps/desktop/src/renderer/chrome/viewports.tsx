import {
  type DeviceKind,
  deviceForWidth,
  devicePresets,
  lengthToPixels,
  type LibraryInfo,
  type ModeSettings,
  type ResolvedMode,
  uniqueId,
  type VariableOption
} from "@parity-app/core"
import { type Token } from "@parity-app/tokens"
import { Laptop, Monitor, type LucideProps, Smartphone, Tablet } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const deviceIcons = { phone: Smartphone, tablet: Tablet, laptop: Laptop, desktop: Monitor }

/** A viewport's icon: the device it says it is, or the one its width suggests. */
export function ViewportIcon({ option, ...props }: { option: VariableOption } & LucideProps) {
  const Icon = deviceIcons[option.device ?? deviceForWidth(option.width ?? 1280)]
  return <Icon {...props} />
}

/** A mode's viewport icon, from the viewport option it uses. */
export function ModeViewportIcon({ of: mode, ...props }: { of: ResolvedMode } & Omit<LucideProps, "mode">) {
  const option = mode.options.find(({ variable }) => variable.kind === "viewport")?.option
  return <ViewportIcon option={option ?? { id: mode.viewport, name: mode.name, width: mode.width }} {...props} />
}

/** A size to add as a viewport: a breakpoint from the tokens or a library, or a device's screen. */
export interface ViewportPreset {
  key: string
  name: string
  width: number
  height?: number
  device: DeviceKind
  /** A breakpoint, as opposed to a device. */
  breakpoint?: boolean
}

export interface PresetGroup {
  title: string
  presets: ViewportPreset[]
}

const breakpointNames: Record<string, string> = { sm: "Small", md: "Medium", lg: "Large", xl: "XL", "2xl": "2XL" }

/**
 * Sizes to pick from when adding a mode or a viewport: the project's breakpoint tokens, each library's breakpoints
 * from its `.lib.par`, then common devices by kind.
 */
export function viewportPresets(tokens: readonly Token[], libraries: readonly LibraryInfo[]): PresetGroup[] {
  const groups: PresetGroup[] = []
  const breakpoints = tokens
    .filter((token) => token.category === "breakpoint")
    .flatMap((token) => {
      const width = lengthToPixels(token.values.default ?? Object.values(token.values)[0] ?? "")
      if (width === undefined) return []
      const id = token.name.replace(/^breakpoint-/, "")
      const preset: ViewportPreset = {
        key: `token:${token.name}`,
        name: breakpointNames[id] ?? id,
        width,
        device: deviceForWidth(width),
        breakpoint: true
      }
      return [preset]
    })
    .sort((a, b) => a.width - b.width)
  if (breakpoints.length > 0) groups.push({ title: "Breakpoints from tokens", presets: breakpoints })
  for (const library of libraries) {
    if (!library.breakpoints?.length) continue
    groups.push({
      title: `${library.name} breakpoints`,
      presets: library.breakpoints.map((breakpoint) => ({
        key: `${library.id}:${breakpoint.id}`,
        name: breakpoint.name,
        width: breakpoint.width,
        device: deviceForWidth(breakpoint.width),
        breakpoint: true
      }))
    })
  }
  const kinds: { title: string; devices: DeviceKind[] }[] = [
    { title: "Phones", devices: ["phone"] },
    { title: "Tablets", devices: ["tablet"] },
    { title: "Laptops and desktops", devices: ["laptop", "desktop"] }
  ]
  for (const { title, devices } of kinds) {
    groups.push({
      title,
      presets: devicePresets
        .filter((preset) => devices.includes(preset.device))
        .map((preset) => ({ key: `device:${preset.id}`, ...preset }))
    })
  }
  return groups
}

/**
 * Adds a preset to the viewport variable, unless a viewport of the same name and width is already there. Returns the
 * settings and the viewport option's id, or undefined when there's no viewport variable.
 */
export function withViewport(
  settings: ModeSettings,
  preset: ViewportPreset
): { settings: ModeSettings; option: string } | undefined {
  const variable = settings.variables.find((candidate) => candidate.kind === "viewport")
  if (!variable) return undefined
  const existing = variable.options.find((option) => option.width === preset.width && option.name === preset.name)
  if (existing) return { settings, option: existing.id }
  const option: VariableOption = {
    id: uniqueId(
      preset.name,
      variable.options.map((candidate) => candidate.id)
    ),
    name: preset.name,
    width: preset.width,
    ...(preset.height ? { height: preset.height } : {}),
    device: preset.device
  }
  return {
    option: option.id,
    settings: {
      ...settings,
      variables: settings.variables.map((candidate) =>
        candidate === variable ? { ...variable, options: [...variable.options, option] } : candidate
      )
    }
  }
}

/** A searchable list of sizes in a popover, with any extra items above them. */
export function ViewportPicker({
  groups,
  trigger,
  extra,
  onPick
}: {
  groups: PresetGroup[]
  trigger: ReactNode
  /** Items above the sizes, like a blank mode. */
  extra?: (close: () => void) => ReactNode
  onPick: (preset: ViewportPreset) => void
}) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search sizes and devices" className="h-8 text-xs" />
          <CommandList className="max-h-96">
            <CommandEmpty>No size matches.</CommandEmpty>
            {extra?.(close)}
            {groups.map((group) => (
              <CommandGroup key={group.title} heading={group.title}>
                {group.presets.map((preset) => {
                  const Icon = deviceIcons[preset.device]
                  return (
                    <CommandItem
                      key={preset.key}
                      value={`${group.title} ${preset.name} ${preset.width}`}
                      onSelect={() => {
                        onPick(preset)
                        close()
                      }}
                    >
                      <Icon className="text-muted-foreground" />
                      <span className="flex-1 truncate">{preset.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {preset.height ? `${preset.width} × ${preset.height}` : `${preset.width}px and up`}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
