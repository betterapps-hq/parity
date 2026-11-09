import { nearestToken, type Reading, readUnitNumber, useTokens, ValueField } from "./field-parts.tsx"
import { splitUnit, type Time, timeMs, timeUnits } from "./motion-data.ts"
import { durationToken } from "./tokens.ts"

/** What's typed comes to: a time to store as it is (a token, or unset), or a number of milliseconds. */
type Typed = { time: Time | undefined } | { ms: number }

const namespace = "duration-"

/**
 * A time (PAR-652's Time): milliseconds, as a transition's Duration and Delay take them. `0.2s` typed becomes 200ms; one
 * read from code keeps `s` until it's edited. Any whole millisecond is a step (`duration-200`), unmarked while the
 * project has no duration tokens and marked once it has some. Up and Down step 10ms, Shift 100ms; a token steps to the
 * next. With a spring, the spring decides how long it takes, so Duration shows its settle time, set by Easing. Its
 * tokens are the project's (`useTokens`), drawn as a track against half a second.
 */
export function TimeField({
  label,
  which,
  value,
  defaultMs,
  setBy,
  mixed,
  onChange
}: {
  label: string
  which: "duration" | "delay"
  value: Time | undefined
  /** What it is unset: Tailwind's default duration, or no delay. */
  defaultMs: number
  /** Another control that sets it, as a spring sets Duration, with how long that comes to. */
  setBy?: { control: string; ms: number; onChange: (ms: number) => void }
  mixed?: boolean
  onChange: (value: Time | undefined) => void
}) {
  const { tokens, create } = useTokens("duration")
  const ms = setBy ? setBy.ms : timeMs(value, tokens)
  const name = value !== undefined && "token" in value ? value.token : undefined
  const token = name === undefined ? undefined : tokens.find((other) => other.name === name)
  const own = value !== undefined && !("token" in value) ? value : undefined
  const nearest = own !== undefined && ms !== undefined ? nearestToken(tokens, (other) => other.ms, ms) : undefined

  const set = (next: number) => {
    const whole = Math.round(next * 100) / 100
    const allowed = which === "delay" ? whole : Math.max(0, whole)

    if (setBy) {
      setBy.onChange(allowed)
    } else {
      onChange(Number.isInteger(allowed) ? { step: allowed } : { value: `${allowed}ms` })
    }
  }

  let comesTo: string | undefined

  if (setBy) {
    comesTo = `set by ${setBy.control}`
  } else if (token) {
    comesTo = token.detail
  } else if (own && "value" in own && splitUnit(own.value)?.unit === "s") {
    comesTo = `as ${own.value}`
  }

  const read = (text: string): Reading<Typed> => {
    const trimmed = text.trim()

    if (trimmed === "") {
      return { value: { time: undefined } }
    }

    const named = tokens.find((other) => other.name === trimmed || other.name === namespace + trimmed)

    if (named) {
      return { value: { time: { token: named.name } } }
    }

    const reading = readUnitNumber(trimmed, {
      units: timeUnits,
      current: ms ?? defaultMs,
      label,
      takes: "Enter a time, such as 200ms or 0.2s"
    })

    if ("reason" in reading) {
      return reading
    }

    if (which === "duration" && reading.value < 0) {
      return { reason: "A duration can't be negative" }
    }

    return { value: { ms: reading.value } }
  }

  const step = (up: boolean, shift: boolean) => {
    if (token) {
      const scale = [...tokens].sort((one, other) => one.ms - other.ms)
      const index = scale.indexOf(token)
      onChange({ token: scale[Math.min(scale.length - 1, Math.max(0, index + (up ? 1 : -1)))]!.name })

      return
    }

    set((ms ?? defaultMs) + (up ? 1 : -1) * (shift ? 100 : 10))
  }

  return (
    <ValueField
      label={label}
      shown={own === undefined || setBy || ms === undefined ? undefined : String(ms)}
      placeholder={String(setBy ? setBy.ms : defaultMs)}
      mixed={mixed}
      chip={
        name === undefined
          ? undefined
          : {
              name,
              token,
              namespace,
              onRemove: () => onChange(undefined),
              onDetach: token ? () => onChange({ step: token.ms }) : undefined,
              onReplace: (replacement) => onChange({ token: replacement })
            }
      }
      unit="ms"
      comesTo={comesTo}
      own={
        own === undefined || setBy || ms === undefined
          ? undefined
          : {
              text: `${ms}ms`,
              nearest,
              same: nearest?.ms === ms,
              namespace,
              onCreate:
                create &&
                ((made) => {
                  create(durationToken(made, ms))
                  onChange({ token: made })
                }),
              allowed: own.allow,
              onAllow: (reason) => {
                const plain = "step" in own ? { step: own.step } : { value: own.value }
                onChange(reason === undefined ? plain : { ...plain, allow: reason })
              }
            }
      }
      tokens={
        tokens.length > 0
          ? { list: tokens, current: name, onPick: (picked) => onChange(picked ? { token: picked } : undefined) }
          : undefined
      }
      read={read}
      onCommit={(typed) => {
        if ("ms" in typed) {
          set(typed.ms)
        } else {
          onChange(typed.time)
        }
      }}
      onStep={(up, { shift }) => step(up, shift)}
    />
  )
}
