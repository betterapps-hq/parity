import { z } from "zod"
import { finiteNumber, stored } from "./stored.ts"

// The forms a stored value takes. Each value says what it is, so a token named `fill` or `auto` is never mistaken for
// the size or the keyword, and a value's text is never read to find out.

/** One of the project's tokens, by its custom property's name without `--`. */
export const tokenForm = stored({ token: z.string().min(1) })

/** A value as CSS reads it, with its unit: `280px`, `50%`, `#2563eb`. */
export const valueForm = stored({ value: z.string().min(1) })

/** A step of the key's scale, where the styling framework's class takes a bare number: `p-4`, `z-10`, `duration-150`. */
export const stepForm = stored({ step: finiteNumber })

/** One of CSS's own words for the property: `auto`, `currentColor`. */
export const keywordForm = stored({ keyword: z.string().min(1) })

/** An expression as CSS reads it: `clamp(1rem, 2vw, 2rem)`, `calc(100% - 2rem)`. */
export const exprForm = stored({ expr: z.string().min(1) })

/** Turned off with the eye: kept in the file, not drawn. Every list entry and CSS map declaration takes it. */
export const off = z.boolean().optional()

export type TokenForm = z.infer<typeof tokenForm>

export type ValueForm = z.infer<typeof valueForm>

export type StepForm = z.infer<typeof stepForm>

export type KeywordForm = z.infer<typeof keywordForm>

export type ExprForm = z.infer<typeof exprForm>

/** Any value that is one of the plain forms. */
export type Form = TokenForm | ValueForm | StepForm | KeywordForm | ExprForm

/** A reference to one of the project's custom properties. */
export function token(name: string): string {
  return `var(--${name})`
}

/**
 * A form as CSS, with steps written by `step`: a token is its variable, and a value, keyword or expression is as it's
 * written.
 */
export function formCss(value: Form, step: (steps: number) => string): string {
  if ("token" in value) {
    return token(value.token)
  }

  if ("step" in value) {
    return step(value.step)
  }

  if ("value" in value) {
    return value.value
  }

  return "keyword" in value ? value.keyword : value.expr
}

/** Steps of the spacing scale, a multiple of the project's spacing unit. */
export function spacingSteps(steps: number): string {
  return steps === 0 ? "0" : `calc(var(--spacing) * ${steps})`
}

/** A length as CSS: its steps of the spacing scale, its token's variable, or as it's written. */
export function spacing(value: Form): string {
  return formCss(value, spacingSteps)
}

/** A value that takes no steps, as CSS: its token's variable, or as it's written. */
export function namedCss(value: TokenForm | ValueForm | KeywordForm | ExprForm): string {
  return formCss(value, String)
}

/** Pixels in a whole spacing step, at Tailwind's default `--spacing` of 0.25rem. */
export const spacingPx = 4

/** Pixels in a rem, at the browser's default font size. */
export const remPx = 16

/** A number as a field or a value writes it: at most `places` decimals (three unless said), with no trailing zeros. */
export function formatNumber(value: number, places = 3): string {
  const factor = 10 ** places

  return String(Math.round(value * factor) / factor)
}

/**
 * A length in pixels in its stored form: a spacing step wherever it's a whole pixel (any multiple of a quarter step, as
 * 13px is 3.25 steps), and a value otherwise (`13.3px`). Every writer of a length uses this, so 13px is a step in
 * padding, a size and a move alike.
 */
export function lengthForm(px: number): StepForm | ValueForm {
  return Number.isInteger(px) ? { step: px / spacingPx } : { value: `${formatNumber(px)}px` }
}
