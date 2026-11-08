import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import type { ResolvedMode } from "@parity-app/core"
import { Check, ChevronDown, Moon, Sun } from "lucide-react"
import { Hint } from "../chrome/Hint.tsx"
import { Name } from "../chrome/Name.tsx"
import { ModeViewportIcon } from "../chrome/viewports.tsx"
import { kindColors } from "./kinds.tsx"
import { toggleShownMode } from "./view.ts"

/** The tint of the preview shown first, in the mode color. */
const mainTint = { background: `color-mix(in oklch, ${kindColors.mode} 18%, transparent)`, color: kindColors.mode }

/**
 * Which modes a board shows as previews. Each of the project's modes is listed once, checked while it's on the board,
 * and one of the checked ones is shown first: the large preview the others sit beside. The trigger shows a chip for
 * each preview, the first one first.
 */
export function ModesMenu({
  modes,
  main,
  beside,
  triggerClassName,
  onChange
}: {
  /** Every mode in the project, in its order. */
  modes: ResolvedMode[]
  main: ResolvedMode
  beside: ResolvedMode[]
  /** The trigger's look, to match the menus beside it. */
  triggerClassName?: string
  onChange: (main: string, shown: string[]) => void
}) {
  const frames = [main, ...beside]
  const shown = frames.map((mode) => mode.id)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={triggerClassName}
        aria-label={`Modes: ${frames.map((mode) => mode.name).join(", ")}`}
      >
        {frames.map((mode, index) => (
          <ModeChip key={mode.id} mode={mode} main={index === 0} />
        ))}
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Previews</DropdownMenuLabel>
        </DropdownMenuGroup>
        {modes.map((mode) => {
          const on = shown.includes(mode.id)
          return (
            <div key={mode.id} className="group/mode flex items-center gap-1">
              <DropdownMenuItem
                role="menuitemcheckbox"
                aria-checked={on}
                className="min-w-0 flex-1"
                closeOnClick={false}
                onClick={() => {
                  const next = toggleShownMode(main.id, shown, mode.id, modes)
                  onChange(next.main, next.shown)
                }}
              >
                <span
                  className={`flex size-4 items-center justify-center rounded-[4px] border ${on ? "border-foreground bg-foreground text-background" : "border-muted-foreground/50"}`}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <ModeViewportIcon of={mode} className="text-muted-foreground" />
                <Name className="flex-1">{mode.name}</Name>
                <span className="text-xs text-muted-foreground tabular-nums">{mode.width}</span>
              </DropdownMenuItem>
              <div className="flex w-24 shrink-0 justify-end">
                {mode.id === main.id ? (
                  <span
                    className="mr-1 rounded-full px-2 py-0.5 text-2xs font-medium whitespace-nowrap"
                    style={mainTint}
                  >
                    Shown first
                  </span>
                ) : (
                  <DropdownMenuItem
                    className="h-auto rounded-full border px-2 py-0.5 text-2xs text-muted-foreground opacity-0 group-hover/mode:opacity-100 focus:opacity-100"
                    closeOnClick={false}
                    onClick={() => {
                      onChange(mode.id, on ? shown : [...shown, mode.id])
                    }}
                  >
                    Show first
                  </DropdownMenuItem>
                )}
              </div>
            </div>
          )
        })}
        <DropdownMenuSeparator />
        <div className="flex gap-1">
          <DropdownMenuItem
            className="min-w-0 flex-1 justify-center"
            disabled={frames.length === 1}
            onClick={() => onChange(main.id, [main.id])}
          >
            <span className="truncate">Only {main.name}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex-1 justify-center"
            disabled={frames.length === modes.length}
            onClick={() =>
              onChange(
                main.id,
                modes.map((mode) => mode.id)
              )
            }
          >
            Show all
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A preview on the board, as its viewport and theme: the first one tinted and named, the rest named on hover. */
function ModeChip({ mode, main }: { mode: ResolvedMode; main: boolean }) {
  return (
    <Hint label={main ? `${mode.name}, shown first` : mode.name} wait>
      <span
        className={`flex h-5 items-center gap-0.5 rounded px-1 ${main ? "" : "bg-muted text-muted-foreground"}`}
        style={main ? mainTint : undefined}
      >
        <ModeViewportIcon of={mode} className="size-3.5" aria-hidden />
        <ThemeIcon mode={mode} />
        {main && <Name className="ml-0.5 max-w-32 text-xs font-medium">{mode.name}</Name>}
      </span>
    </Hint>
  )
}

/** A sun or moon for a light or dark theme; nothing for a mode without either. */
function ThemeIcon({ mode }: { mode: ResolvedMode }) {
  const option = mode.options.find(({ variable }) => variable.kind === "theme")?.option
  const name = `${option?.id ?? ""} ${option?.name ?? ""}`
  if (/dark/i.test(name)) return <Moon className="size-3" aria-hidden />
  if (/light/i.test(name)) return <Sun className="size-3" aria-hidden />
  return null
}
