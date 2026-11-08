import { useState } from "react"
import { OffSystemMark } from "./color-picker.tsx"
import { type DurationToken, type Time, timeMs, timeUnits, splitUnit } from "./motion-data.ts"
import { readUnitNumber, type TokenOption, UnitField } from "./unit-field.tsx"

/**
 * A time (PAR-652's Time): milliseconds, as a transition's Duration and Delay take them. `0.2s` typed becomes 200ms; one
 * read from code keeps `s` until it's edited. Any whole millisecond is a step (`duration-200`), unmarked while the
 * project has no duration tokens and marked once it has some. Up and Down step 10ms, Shift 100ms; a token steps to the
 * next. With a spring, the spring decides how long it takes, so Duration shows its settle time, set by Easing.
 */
export function TimeField({
  label,
  which,
  value,
  defaultMs,
  tokens,
  setBy,
  mixed,
  onChange
}: {
  label: string
  which: "duration" | "delay"
  value: Time | undefined
  /** What it is unset: Tailwind's default duration, or no delay. */
  defaultMs: number
  /** The project's duration tokens; none leaves every whole millisecond unmarked. */
  tokens: readonly DurationToken[]
  /** Another control that sets it, as a spring sets Duration, with how long that comes to. */
  setBy?: { control: string; ms: number; onChange: (ms: number) => void }
  mixed?: boolean
  onChange: (value: Time | undefined) => void
}) {
  const [created, setCreated] = useState<DurationToken[]>([])
  const all = [...tokens, ...created]
  const ms = setBy ? setBy.ms : timeMs(value, all)
  const token = value !== undefined && "token" in value ? all.find((other) => other.name === value.token) : undefined
  const nearest =
    all.length > 0 && ms !== undefined
      ? all.reduce((best, other) => (Math.abs(other.ms - ms) < Math.abs(best.ms - ms) ? other : best))
      : undefined
  const offSystem = value !== undefined && !("token" in value) && nearest !== undefined && setBy === undefined
  const set = (next: number) => {
    const whole = Math.round(next * 100) / 100
    const allowed = which === "delay" ? whole : Math.max(0, whole)
    if (setBy) setBy.onChange(allowed)
    else onChange(Number.isInteger(allowed) ? { step: allowed } : { value: `${allowed}ms` })
  }
  let detail: string | undefined
  if (setBy) detail = `set by ${setBy.control}`
  else if (token) detail = `${token.ms}ms`
  else if (value !== undefined && "value" in value && splitUnit(value.value)?.unit === "s") detail = `as ${value.value}`
  const options: TokenOption[] = all.map((option) => ({
    name: option.name,
    label: option.name.replace(/^duration-/, ""),
    detail: `${option.ms}ms`,
    preview: <TimeTrack ms={option.ms} />
  }))
  const allowed = value !== undefined && "allow" in value ? value.allow : undefined
  return (
    <UnitField
      label={label}
      unit="ms"
      shown={value === undefined || token || setBy || ms === undefined ? undefined : String(ms)}
      placeholder={String(setBy ? setBy.ms : defaultMs)}
      detail={detail}
      mixed={mixed}
      chip={
        token && value
          ? {
              name: token.name.replace(/^duration-/, ""),
              title: `${token.name}, ${token.ms}ms`,
              preview: <TimeTrack ms={token.ms} />,
              onRemove: () => onChange(undefined)
            }
          : undefined
      }
      tokens={options}
      onPickToken={(name) => onChange({ token: name })}
      mark={
        offSystem && nearest ? (
          <OffSystemMark
            compact
            label={label}
            description={`${ms}ms isn't one of the project's durations.`}
            nearest={{ name: nearest.name, preview: <TimeTrack ms={nearest.ms} /> }}
            allowed={allowed}
            isTaken={(name) => all.some((other) => other.name === `duration-${name}` || other.name === name)}
            namePlaceholder="quick"
            onUse={() => onChange({ token: nearest.name })}
            onCreate={(name) => {
              const full = name.startsWith("duration-") ? name : `duration-${name}`
              setCreated((current) => [...current, { name: full, ms: ms! }])
              onChange({ token: full })
            }}
            onAllow={(reason) => {
              if (value === undefined) return
              if ("step" in value) onChange({ step: value.step, allow: reason })
              else if ("value" in value) onChange({ value: value.value, allow: reason })
            }}
          />
        ) : undefined
      }
      onType={(text) => {
        const trimmed = text.trim()
        if (trimmed === "") {
          onChange(undefined)
          return undefined
        }
        const named = all.find((other) => other.name === trimmed || other.name === `duration-${trimmed}`)
        if (named) {
          onChange({ token: named.name })
          return undefined
        }
        const reading = readUnitNumber(trimmed, {
          units: timeUnits,
          current: ms ?? defaultMs,
          takes: `${label} takes a time, such as 200, 200ms or 0.2s`
        })
        if ("reason" in reading) return reading.reason
        if (which === "duration" && reading.value < 0) return "A duration can't be negative"
        set(reading.value)
        return undefined
      }}
      onStep={(up, shift) => {
        if (token) {
          const scale = [...all].sort((one, other) => one.ms - other.ms)
          const index = scale.indexOf(token)
          const next = scale[Math.min(scale.length - 1, Math.max(0, index + (up ? 1 : -1)))]!
          onChange({ token: next.name })
          return
        }
        set((ms ?? defaultMs) + (up ? 1 : -1) * (shift ? 100 : 10))
      }}
      scrub={{
        from: () => ms ?? defaultMs,
        apply: (from, dx, shift) => set(from + Math.trunc(dx) * (shift ? 100 : 10))
      }}
    />
  )
}

/** A duration token's preview: a track filled as far as its time goes against half a second. */
export function TimeTrack({ ms }: { ms: number }) {
  return (
    <span aria-hidden className="relative h-1.5 w-6 shrink-0 overflow-hidden rounded-full bg-muted-foreground/20">
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-foreground/60"
        style={{ width: `${Math.min(1, ms / 500) * 100}%` }}
      />
    </span>
  )
}
