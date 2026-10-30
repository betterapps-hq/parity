import type { ResolvedMode } from "@parity-app/core"
import { Check, ChevronDown, Moon, Sun } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Hint } from "../chrome/Hint.tsx"
import { ModeViewportIcon } from "../chrome/viewports.tsx"
import { kindColors } from "./kinds.tsx"
import { toggleShownMode } from "./view.ts"

/** The main frame's tint, in the mode color. */
const mainTint = { background: `color-mix(in oklch, ${kindColors.mode} 18%, transparent)`, color: kindColors.mode }

/**
 * Which modes a board shows as frames. Each of the project's modes is listed once, checked while it's on the board,
 * and one of the checked ones is Main: the large frame the others sit beside. The trigger shows a chip for each frame,
 * the main one first.
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
  onChange(main: string, shown: string[]): void
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
        <DropdownMenuLabel>Frames on this board</DropdownMenuLabel>
        {modes.map((mode) => {
          const on = shown.includes(mode.id)
          return (
            <div key={mode.id} className="group/mode flex items-center gap-1">
              <DropdownMenuItem
                role="menuitemcheckbox"
                aria-checked={on}
                className="min-w-0 flex-1"
                onSelect={(event) => {
                  event.preventDefault()
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
                <span className="flex-1 truncate">{mode.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{mode.width}</span>
              </DropdownMenuItem>
              <div className="flex w-20 shrink-0 justify-end">
                {mode.id === main.id ? (
                  <span className="mr-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={mainTint}>
                    Main
                  </span>
                ) : (
                  <DropdownMenuItem
                    className="h-auto rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground opacity-0 group-hover/mode:opacity-100 focus:opacity-100"
                    onSelect={(event) => {
                      event.preventDefault()
                      onChange(mode.id, on ? shown : [...shown, mode.id])
                    }}
                  >
                    Make main
                  </DropdownMenuItem>
                )}
              </div>
            </div>
          )
        })}
        <DropdownMenuSeparator />
        <div className="flex gap-1">
          <DropdownMenuItem
            className="flex-1 justify-center"
            disabled={frames.length === 1}
            onSelect={() => onChange(main.id, [main.id])}
          >
            Main only
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex-1 justify-center"
            disabled={frames.length === modes.length}
            onSelect={() =>
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

/** A frame on the board, as its viewport and theme: the main one tinted and named, the rest named on hover. */
function ModeChip({ mode, main }: { mode: ResolvedMode; main: boolean }) {
  return (
    <Hint label={main ? `${mode.name}, the main frame` : mode.name} wait>
      <span
        className={`flex h-5 items-center gap-0.5 rounded px-1 ${main ? "" : "bg-muted text-muted-foreground"}`}
        style={main ? mainTint : undefined}
      >
        <ModeViewportIcon of={mode} className="size-3.5" aria-hidden />
        <ThemeIcon mode={mode} />
        {main && <span className="ml-0.5 max-w-32 truncate text-xs font-medium">{mode.name}</span>}
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
