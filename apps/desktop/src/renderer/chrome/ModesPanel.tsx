import {
  type ModeSettings,
  type ModeSpec,
  type ModeVariable,
  resolveMode,
  uniqueId,
  type VariableOption
} from "@parity/core"
import {
  Copy,
  Crown,
  Monitor,
  MoreHorizontal,
  Palette,
  Languages,
  Plus,
  SlidersHorizontal,
  SquareDashed,
  Trash2,
  X
} from "lucide-react"
import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CommandGroup, CommandItem } from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useProject } from "../canvas/context.ts"
import { useModeSettings } from "../design-store.ts"
import { useTokenList } from "../tokens-store.ts"
import { Hint } from "./Hint.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { type PresetGroup, ViewportIcon, ViewportPicker, viewportPresets, withViewport } from "./viewports.tsx"

const kindIcons = { viewport: Monitor, theme: Palette, locale: Languages, custom: SlidersHorizontal }

/**
 * The project's modes, shared by every design. A mode is a named combination of one option per variable, like a
 * Chromatic mode in Storybook. The first mode is the primary frame everywhere.
 */
export function ModesPanel() {
  const { store, info, tokens: tokenStore } = useProject()
  const modesFile = info.modes
  const settings = useModeSettings(store)
  const tokens = useTokenList(tokenStore)
  const presets = useMemo(() => viewportPresets(tokens, info.libraries), [tokens, info.libraries])
  const update = (next: Partial<ModeSettings>) => store.setModes({ ...settings, ...next })
  const replaceMode = (id: string, next: ModeSpec) =>
    update({ modes: settings.modes.map((mode) => (mode.id === id ? next : mode)) })

  /** A mode with each variable's first option, or with a viewport picked from the presets, added if it's new. */
  const addMode = (viewport?: PresetGroup["presets"][number]) => {
    const added = viewport ? withViewport(settings, viewport) : undefined
    const base = added?.settings ?? settings
    const values = Object.fromEntries(base.variables.map((variable) => [variable.id, variable.options[0]!.id]))
    const variable = base.variables.find((candidate) => candidate.kind === "viewport")
    if (added && variable) values[variable.id] = added.option
    const name = autoName(base, values)
    const id = uniqueId(
      name,
      base.modes.map((mode) => mode.id)
    )
    store.setModes({ ...base, modes: [...base.modes, { id, name, values }] }, "Add mode")
  }

  return (
    <>
      <PanelSection
        title="Modes"
        description={
          <>
            Shared by every design; each design picks which to show.{" "}
            {modesFile.custom ? "Saved in " : "Using the defaults; editing saves them to "}
            <code>{store.mainPath}</code>.
          </>
        }
        action={
          <ViewportPicker
            groups={presets}
            onPick={addMode}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Add mode">
                <Plus />
              </Button>
            }
            // oxlint-disable-next-line react/no-unstable-nested-components -- a render callback ViewportPicker calls, not a component
            extra={(close) => (
              <CommandGroup>
                <CommandItem
                  value="blank mode"
                  onSelect={() => {
                    addMode()
                    close()
                  }}
                >
                  <SquareDashed className="text-muted-foreground" />
                  Blank mode
                  <span className="ml-auto text-xs text-muted-foreground">First of each variable</span>
                </CommandItem>
              </CommandGroup>
            )}
          />
        }
      >
        <ul className="flex flex-col gap-2">
          {settings.modes.map((mode, index) => (
            <ModeCard
              key={mode.id}
              mode={mode}
              settings={settings}
              primary={index === 0}
              onChange={(next) => replaceMode(mode.id, next)}
              onMakePrimary={() => update({ modes: [mode, ...settings.modes.filter((m) => m.id !== mode.id)] })}
              onDuplicate={() => {
                const name = `${mode.name} copy`
                const copy = {
                  ...mode,
                  id: uniqueId(
                    name,
                    settings.modes.map((m) => m.id)
                  ),
                  name
                }
                update({ modes: [...settings.modes, copy] })
              }}
              onDelete={
                settings.modes.length > 1
                  ? () => update({ modes: settings.modes.filter((m) => m.id !== mode.id) })
                  : undefined
              }
            />
          ))}
        </ul>
      </PanelSection>
      <PanelSection title="Variables" description="The axes modes combine. Each option says what it does to a frame.">
        <ul className="flex flex-col gap-4">
          {settings.variables.map((variable) => (
            <VariableCard
              key={variable.id}
              variable={variable}
              presets={variable.kind === "viewport" ? presets : undefined}
              onChange={(next) =>
                update({ variables: settings.variables.map((v) => (v.id === variable.id ? next : v)) })
              }
              onAdd={(preset) => {
                const added = withViewport(settings, preset)
                if (added && added.settings !== settings) store.setModes(added.settings, `Add ${preset.name}`)
              }}
              onRemove={(optionId) => {
                // Modes that used it fall back to the first option.
                const modes = settings.modes.map((mode) => {
                  if (mode.values[variable.id] !== optionId) return mode
                  const values = { ...mode.values }
                  delete values[variable.id]
                  return { ...mode, values }
                })
                const variables = settings.variables.map((v) =>
                  v.id === variable.id ? { ...v, options: v.options.filter((option) => option.id !== optionId) } : v
                )
                store.setModes({ ...settings, variables, modes }, "Remove option")
              }}
            />
          ))}
        </ul>
      </PanelSection>
    </>
  )
}

interface ModeCardProps {
  mode: ModeSpec
  settings: ModeSettings
  primary: boolean
  onChange(mode: ModeSpec): void
  onMakePrimary(): void
  onDuplicate(): void
  onDelete?: () => void
}

function ModeCard({ mode, settings, primary, onChange, onMakePrimary, onDuplicate, onDelete }: ModeCardProps) {
  const resolved = resolveMode(settings, mode)
  const setValue = (variableId: string, optionId: string) => {
    const values = { ...mode.values, [variableId]: optionId }
    // Keep generated names in step with the values; a name someone typed stays as it is.
    const renamed = mode.name === autoName(settings, mode.values) ? autoName(settings, values) : mode.name
    onChange({ ...mode, values, name: renamed })
  }

  return (
    <li className={`rounded-lg border p-3 ${primary ? "border-primary/40 bg-accent/30" : ""}`}>
      <div className="mb-2.5 flex items-center gap-2">
        <Input
          key={mode.name}
          defaultValue={mode.name}
          aria-label="Mode name"
          className="h-7 flex-1 border-transparent bg-transparent px-1.5 font-medium shadow-none hover:border-input"
          onBlur={(event) => {
            const name = event.currentTarget.value.trim()
            if (name && name !== mode.name) onChange({ ...mode, name })
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
        {primary && <Badge variant="secondary">Primary</Badge>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`${mode.name} actions`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={primary} onSelect={onMakePrimary}>
              <Crown /> Make primary
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={!onDelete} onSelect={onDelete}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
        {resolved.options.map(({ variable, option }) => {
          const Icon = kindIcons[variable.kind]
          return (
            <VariableSelect
              key={variable.id}
              icon={<Icon className="size-3.5 text-muted-foreground" />}
              variable={variable}
              value={option.id}
              onChange={(value) => setValue(variable.id, value)}
            />
          )
        })}
      </div>
    </li>
  )
}

interface VariableSelectProps {
  icon: React.ReactNode
  variable: ModeVariable
  value: string
  onChange(value: string): void
}

function VariableSelect({ icon, variable, value, onChange }: VariableSelectProps) {
  return (
    <>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {variable.name}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-full min-w-0 overflow-hidden" aria-label={variable.name}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {variable.options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {variable.kind === "viewport" && <ViewportIcon option={option} className="text-muted-foreground" />}
              {option.name}
              <OptionDetails option={option} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

interface VariableCardProps {
  variable: ModeVariable
  /** Sizes that can be added, for the viewport variable. */
  presets?: PresetGroup[]
  onChange(variable: ModeVariable): void
  onAdd(preset: PresetGroup["presets"][number]): void
  onRemove(optionId: string): void
}

function VariableCard({ variable, presets, onChange, onAdd, onRemove }: VariableCardProps) {
  const Icon = kindIcons[variable.kind]
  const setOption = (id: string, next: VariableOption) =>
    onChange({ ...variable, options: variable.options.map((option) => (option.id === id ? next : option)) })
  const viewport = variable.kind === "viewport"

  return (
    <li>
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" />
        <span className="flex-1">{variable.name}</span>
        {presets && (
          <ViewportPicker
            groups={presets}
            onPick={onAdd}
            trigger={
              <Button variant="ghost" size="icon-xs" aria-label={`Add a ${variable.name.toLowerCase()} size`}>
                <Plus />
              </Button>
            }
          />
        )}
      </div>
      <ul className="flex flex-col">
        {variable.options.map((option) => (
          <li key={option.id} className="group/option flex items-center gap-2 rounded-md px-1 py-1 text-sm">
            {viewport && <ViewportIcon option={option} className="size-3.5 shrink-0 text-muted-foreground" />}
            <Hint label={option.height ? `${option.width} × ${option.height}` : undefined} wait>
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
            </Hint>
            {option.width !== undefined ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Input
                  key={option.width}
                  type="number"
                  min={240}
                  max={3840}
                  defaultValue={option.width}
                  aria-label={`${option.name} width`}
                  className="h-6 w-16 px-1.5 text-right text-xs"
                  onBlur={(event) => {
                    const width = Number(event.currentTarget.value)
                    if (Number.isFinite(width) && width >= 240 && width !== option.width) {
                      setOption(option.id, { ...option, width })
                    }
                  }}
                />
                px
              </span>
            ) : (
              <span className="flex gap-1">
                <OptionDetails option={option} />
              </span>
            )}
            {viewport && variable.options.length > 1 && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${option.name}`}
                className="opacity-0 group-hover/option:opacity-100 focus-visible:opacity-100"
                onClick={() => onRemove(option.id)}
              >
                <X />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </li>
  )
}

/** What an option does to a frame, as small code chips. */
function OptionDetails({ option }: { option: VariableOption }) {
  const parts: string[] = []
  if (option.width !== undefined) parts.push(`${option.width}px`)
  if (option.className) parts.push(`class="${option.className}"`)
  for (const [name, value] of Object.entries(option.attributes ?? {})) parts.push(`${name}="${value}"`)
  if (parts.length === 0) return <span className="text-xs text-muted-foreground">No change</span>
  return (
    <>
      {parts.map((part) => (
        <code key={part} className="rounded bg-muted px-1 text-[11px] text-muted-foreground">
          {part}
        </code>
      ))}
    </>
  )
}

/** "Desktop Dark": the viewport and theme, plus any other option that isn't its variable's default. */
function autoName(settings: ModeSettings, values: Record<string, string>): string {
  const names = settings.variables.flatMap((variable, index) => {
    const option = variable.options.find((candidate) => candidate.id === values[variable.id]) ?? variable.options[0]!
    const isDefault = option.id === variable.options[0]!.id
    return index < 2 || !isDefault ? [option.name] : []
  })
  return names.join(" ")
}
