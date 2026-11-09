import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { type Length, remPixels } from "@parity-app/core"
import {
  type LengthToken,
  type PaddingSide,
  type SidesHeld,
  type SpacingHandle,
  spacingName,
  spacingScaleName
} from "@parity-app/editor"
import { spacingScale, spacingStepName } from "@parity-app/tokens"
import { ChevronDown } from "lucide-react"
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState
} from "react"
import { Hint } from "../chrome/Hint.tsx"
import { gestures as held } from "../chrome/keymap.ts"
import { holds } from "../chrome/keys.ts"
import { SpacingBar } from "../chrome/token-previews.tsx"
import { KeyHints } from "./KeyHints.tsx"
import { spacingChip, spacingColors, spacingHatch } from "./spacing-colors.ts"
import type { SpacingValue } from "./spacing-edit.ts"

/** A handle's key among a layout's: its side, or which gap. */
export function spacingKey(handle: SpacingHandle): string {
  return handle.kind === "padding" ? `padding:${handle.side}` : `gap:${handle.index}`
}

/** The padding sides an edit changes besides its own, from the keys held, as the keymap names them. */
export type SpacingKeys = SidesHeld

/** What the keys held during an event say about the sides an edit changes. */
export function sidesHeld(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): SidesHeld {
  return { opposite: holds(event, held.oppositePadding.keys), every: holds(event, held.everyPadding.keys) }
}

export interface SpacingHandlesProps {
  /** Where each handle goes, in the overlay's pixels. */
  handles: readonly SpacingHandle[]
  /** Layout pixels per spacing step, to name each value's step of the scale. */
  unit: number
  /** The project's length tokens, listed beside the box a value is typed in. */
  tokens: readonly LengthToken[]
  /** What each handle's value is now: in layout pixels, with the token it's bound to. */
  valueOf: (handle: SpacingHandle) => SpacingValue
  /** The handle being dragged, the value it's come to and the padding sides it changes. */
  dragging?: { key: string; px: number; token?: string; sides?: readonly PaddingSide[] }
  /** A handle pressed: the caller follows the press, and calls `type` when it's released without dragging. */
  onPress: (handle: SpacingHandle, event: ReactPointerEvent, type: () => void) => void
  /** A value typed after a click; gives the reason when it can't be read, and nothing once it's made. */
  onType: (handle: SpacingHandle, text: string, keys: SpacingKeys) => string | undefined
  /** A token or a step of the spacing scale picked from the list beside the box. */
  onPick: (handle: SpacingHandle, value: Length, keys: SpacingKeys) => void
  /** Up or Down (Right or Left) on a focused handle: one step, ten with Shift. */
  onStep: (handle: SpacingHandle, count: number, keys: SpacingKeys) => void
}

/**
 * Handles on a selected layout's padding and gaps: a short bar in the middle of each, which hatches its space when the
 * pointer is on it, as Figma does; nothing is hatched otherwise. Dragging shows the value beside it; a click opens a box
 * to type one, as the inspector's fields take it. Each is a slider, named after its side, that Up and Down step from the
 * keyboard and Enter opens to type.
 */
export function SpacingHandles({
  handles,
  unit,
  tokens,
  valueOf,
  dragging,
  onPress,
  onType,
  onPick,
  onStep
}: SpacingHandlesProps) {
  const [hovered, setHovered] = useState<string>()
  const [focused, setFocused] = useState<string>()
  const [typing, setTyping] = useState<{ key: string; text: string; keys: SpacingKeys; reason?: string }>()

  // While Alt or Alt+Shift drags a side, every side it changes is shaded.
  const shaded = (handle: SpacingHandle) => {
    const key = spacingKey(handle)

    if (dragging) {
      if (dragging.key === key) {
        return true
      }

      // A layout has one gap, so every gap changes with the one dragged.
      if (handle.kind === "gap") {
        return dragging.key.startsWith("gap:")
      }

      return !!dragging.sides?.includes(handle.side)
    }

    const lit = [hovered, focused, typing?.key]

    if (handle.kind === "gap") {
      return lit.some((other) => other?.startsWith("gap:"))
    }

    return lit.includes(key)
  }

  const commit = (handle: SpacingHandle, text: string) => {
    if (!typing) {
      return
    }

    const reason = onType(handle, text, typing.keys)
    setTyping(reason ? { ...typing, reason } : undefined)
  }

  return (
    <>
      {hatchedByColor(handles.filter(shaded)).map(([color, areas]) => (
        <Hatching key={color} color={color} areas={areas} />
      ))}
      {handles.map((handle) => {
        const key = spacingKey(handle)
        const name = spacingName(handle, handles.filter((other) => other.kind === "gap").length)
        const value = dragging?.key === key ? dragging : valueOf(handle)
        const scaleName = spacingScaleName(value, unit)
        const across = isAcross(handle)
        const active = dragging?.key === key || hovered === key || focused === key
        const color = spacingColors[handle.kind]

        const step = (event: ReactKeyboardEvent) => {
          const keys = sidesHeld(event)
          // Shift steps ten, unless it's part of the keys for every side.
          const by = event.shiftKey && !keys.every ? 10 : 1

          if (event.key === "Enter") {
            setTyping({ key, text: startText(value), keys })
          } else if (event.key === "ArrowUp" || event.key === "ArrowRight") {
            onStep(handle, by, keys)
          } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
            onStep(handle, -by, keys)
          } else {
            return
          }

          // The canvas's own keys would nudge the layer.
          event.preventDefault()
          event.stopPropagation()
        }

        return (
          <div key={key}>
            <div
              className="absolute rounded-full"
              style={{
                ...place(handle.bar),
                background: color,
                opacity: active ? 1 : 0.75,
                boxShadow: "0 0 0 1px white"
              }}
            />
            <Hint
              label="Drag, or click to type"
              detail={
                handle.kind === "padding" && (
                  <KeyHints
                    rows={[
                      { keys: held.oppositePadding.keys, does: "Both sides" },
                      { keys: held.everyPadding.keys, does: "All sides" }
                    ]}
                  />
                )
              }
              wait
              hidden={!!dragging || !!typing}
            >
              <input
                type="range"
                min={0}
                max={Math.max(256, Math.ceil(value.px))}
                value={px(value.px)}
                // Its keys and the pointer are the handle's own (below), so the range never moves by itself.
                onChange={() => undefined}
                aria-label={name}
                aria-valuetext={`${px(value.px)}px${scaleName ? `, ${scaleName}` : ""}`}
                aria-orientation={across ? "vertical" : "horizontal"}
                className="spacing-handle pointer-events-auto absolute m-0 appearance-none rounded-sm bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-(--spacing-color) [&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-thumb]:size-0 [&::-webkit-slider-thumb]:appearance-none"
                style={Object.assign(
                  { ...place(handle.hit), cursor: across ? "ns-resize" : "ew-resize" },
                  { "--spacing-color": color }
                )}
                onPointerEnter={() => setHovered(key)}
                onPointerLeave={() => setHovered((current) => (current === key ? undefined : current))}
                onFocus={() => setFocused(key)}
                onBlur={() => setFocused((current) => (current === key ? undefined : current))}
                onKeyDown={step}
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return
                  }

                  event.stopPropagation()
                  event.preventDefault()
                  const keys = sidesHeld(event)
                  onPress(handle, event, () => setTyping({ key, text: startText(valueOf(handle)), keys }))
                }}
              />
            </Hint>
            {typing?.key === key ? (
              <TypeBox
                name={name}
                id={`${key}-reason`}
                style={labelPlace(handle)}
                color={color}
                text={typing.text}
                reason={typing.reason}
                unit={unit}
                tokens={tokens}
                onChange={(text) => setTyping({ ...typing, text, reason: undefined })}
                onCommit={(text) => commit(handle, text)}
                onPick={(picked) => {
                  onPick(handle, picked, typing.keys)
                  setTyping(undefined)
                }}
                onCancel={() => setTyping(undefined)}
              />
            ) : (
              active && (
                <div
                  className="absolute z-20 rounded px-1.5 py-px text-2xs font-medium whitespace-nowrap tabular-nums"
                  style={{ ...labelPlace(handle), ...spacingChip(handle.kind) }}
                >
                  {px(value.px)}
                  {scaleName && <span className="ml-1 font-mono">{scaleName}</span>}
                </div>
              )
            )}
          </div>
        )
      })}
    </>
  )
}

/**
 * The areas of the handles shaded, grouped by the color they're hatched in, so padding and gaps are one shape while
 * their colors match.
 */
function hatchedByColor(shaded: readonly SpacingHandle[]): [string, SpacingHandle["area"][]][] {
  const byColor = new Map<string, SpacingHandle["area"][]>()

  for (const handle of shaded) {
    const color = spacingColors[handle.kind]
    byColor.set(color, [...(byColor.get(color) ?? []), handle.area])
  }

  return [...byColor]
}

/**
 * One hatched shape over every area shaded at once in a color, so where two padding sides meet at a corner it's hatched
 * once, not twice, and the lines run on from one area into the next.
 */
function Hatching({ color, areas }: { color: string; areas: readonly SpacingHandle["area"][] }) {
  const drawn = areas.filter((area) => area.w > 0 && area.h > 0)

  if (drawn.length === 0) {
    return null
  }

  const left = Math.min(...drawn.map((area) => area.x))
  const top = Math.min(...drawn.map((area) => area.y))
  const right = Math.max(...drawn.map((area) => area.x + area.w))
  const bottom = Math.max(...drawn.map((area) => area.y + area.h))
  // Each area drawn the same way round, so the path's nonzero rule fills where they overlap once.
  const path = drawn.map((area) => `M${area.x - left} ${area.y - top}h${area.w}v${area.h}h${-area.w}z`).join("")

  return (
    <div
      data-spacing-hatch
      className="pointer-events-none absolute"
      style={{
        left,
        top,
        width: right - left,
        height: bottom - top,
        background: spacingHatch(color),
        clipPath: `path("${path}")`
      }}
    />
  )
}

/** What the box a value is typed in starts with: the token a value is bound to, or its pixels. */
function startText(value: SpacingValue): string {
  return value.token ?? String(px(value.px))
}

/** A plain number, which the box reads in the unit it shows after it. */
const plainNumber = /^\s*\d+(\.\d+)?\s*$/

/** The units the box takes a plain number in, and the pixels in each, counting 16 to the rem as the fields do. */
const boxUnits = { px: 1, rem: remPixels } as const

type BoxUnit = keyof typeof boxUnits

/** A length in one of the box's units, to the place it's typed to. */
function inUnit(pixels: number, unit: BoxUnit): string {
  return String(Math.round((pixels / boxUnits[unit]) * 1000) / 1000)
}

/** The room a bar in the list takes, so the names beside the bars line up, as in the token previews. */
const barRoom = 64

/**
 * The box a value is typed in after a click on a handle, or Enter on it, as the inspector's length fields take one:
 * pixels, shown with `px` after them, `rem`, maths or a token's name. Beside it, a list of the project's length tokens
 * and the spacing scale to pick from. It takes the keys as it opens.
 */
function TypeBox(props: {
  name: string
  id: string
  style: CSSProperties
  /** The padding's or gap's color, which the list's bars take. */
  color: string
  text: string
  reason?: string
  unit: number
  tokens: readonly LengthToken[]
  onChange: (text: string) => void
  /** What's typed, with the unit a plain number is in. */
  onCommit: (text: string) => void
  onPick: (value: Length) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [unit, setUnit] = useState<BoxUnit>("px")
  const plain = plainNumber.test(props.text)
  const commit = () => props.onCommit(plain ? `${props.text.trim()}${unit}` : props.text)

  // Switching the unit keeps the length, so 16px becomes 1rem.
  const switchUnit = () => {
    const next = unit === "px" ? "rem" : "px"

    if (plain) {
      props.onChange(inUnit(Number(props.text) * boxUnits[unit], next))
    }

    setUnit(next)
    ref.current?.focus()
  }

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <div className="absolute z-20" style={props.style}>
      <div
        // As the inspector's fields draw: a plain border, the ring while it has focus, red when it can't read a value.
        data-invalid={props.reason ? "" : undefined}
        className="pointer-events-auto flex h-6 items-center rounded-md border border-input bg-background text-xs text-foreground shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 data-[invalid]:border-destructive data-[invalid]:ring-destructive/20"
      >
        <input
          ref={ref}
          aria-label={props.name}
          className="spacing-value field-sizing-content h-full max-w-40 min-w-8 bg-transparent px-1.5 tabular-nums outline-none"
          value={props.text}
          aria-invalid={!!props.reason}
          aria-describedby={props.reason ? props.id : undefined}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation()

            if (event.key === "Enter") {
              commit()
            } else if (event.key === "Escape") {
              props.onCancel()
            }
          }}
          onBlur={(event) => {
            // Moving to the list or the unit keeps the box open.
            if (event.relatedTarget instanceof Element && event.relatedTarget.closest("[data-spacing-picker]")) {
              return
            }

            if (!open) {
              commit()
            }
          }}
        />
        {plain && (
          <button
            type="button"
            data-spacing-picker
            aria-label={`${unit}, switch to ${unit === "px" ? "rem" : "px"}`}
            className="h-full rounded-sm px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            onPointerDown={(event) => event.preventDefault()}
            onClick={switchUnit}
          >
            {unit}
          </button>
        )}
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)

            if (!next) {
              ref.current?.focus()
            }
          }}
        >
          <PopoverTrigger
            render={
              <button
                type="button"
                data-spacing-picker
                aria-label={`Pick a token for ${props.name.toLowerCase()}`}
                className="grid h-full w-5 shrink-0 place-items-center rounded-r border-l text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ChevronDown className="size-3" />
              </button>
            }
          />
          <PopoverContent data-spacing-picker className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search spacing" className="h-8 text-xs" />
              <CommandList className="max-h-72">
                <CommandEmpty>No length matches.</CommandEmpty>
                {props.tokens.length > 0 && (
                  <CommandGroup heading="Semantic">
                    {props.tokens.map((token) => (
                      <CommandItem
                        key={token.name}
                        value={token.name}
                        onSelect={() => props.onPick(token.name)}
                        className="gap-2 text-xs"
                      >
                        <span className="flex shrink-0" style={{ width: barRoom }}>
                          <SpacingBar length={token.px} room={barRoom} color={props.color} />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono">{token.name}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {inUnit(token.px, unit)}
                          {unit}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                <CommandGroup heading="Spacing scale">
                  {spacingScale.map((step) => (
                    <CommandItem
                      key={step}
                      value={spacingStepName(step)}
                      onSelect={() => props.onPick(step)}
                      className="gap-2 text-xs"
                    >
                      <span className="flex shrink-0" style={{ width: barRoom }}>
                        <SpacingBar length={step * props.unit} room={barRoom} color={props.color} />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono">{spacingStepName(step)}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {inUnit(step * props.unit, unit)}
                        {unit}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {props.reason && (
        <div
          id={props.id}
          role="alert"
          className="type-message mt-1 w-max max-w-56 rounded bg-destructive px-1.5 py-0.5 text-white"
        >
          {props.reason}
        </div>
      )}
    </div>
  )
}

/** Whether a handle is dragged up and down: the top and bottom padding, and gaps between children in a column. */
function isAcross(handle: SpacingHandle): boolean {
  return handle.kind === "padding" ? handle.side === "top" || handle.side === "bottom" : handle.direction === "column"
}

/** Pixels as shown, to a tenth. */
const px = (value: number) => Math.round(value * 10) / 10

function place(box: { x: number; y: number; w: number; h: number }): CSSProperties {
  return { left: box.x, top: box.y, width: box.w, height: box.h }
}

/** Beside the bar: to its right for a bar that's dragged up and down, below it otherwise. */
function labelPlace(handle: SpacingHandle): CSSProperties {
  const { bar } = handle

  if (isAcross(handle)) {
    return { left: bar.x + bar.w + 6, top: bar.y + bar.h / 2, transform: "translateY(-50%)" }
  }

  return { left: bar.x + bar.w / 2, top: bar.y + bar.h + 6, transform: "translateX(-50%)" }
}
