import { z } from "zod"

/**
 * A value from running JavaScript: a loaded module's export, a theme object, a prop made live, an element React made,
 * data parsed from JSON. Every JavaScript value is one of these cases, so code reads one by checking which with the
 * guards below before using it.
 */
export type Live =
  | string
  | number
  | bigint
  | boolean
  | symbol
  | null
  | undefined
  | LiveFunction
  | LiveObject
  | readonly Live[]

/**
 * A function or class from running code, called with live values. Its parameters are checked both ways, as a method's
 * are, since what one takes is up to the code that made it: a component takes its props.
 */
export type LiveFunction = { call(...args: Live[]): Live }["call"]

/** An object from running code, read by key: a module's namespace, a theme object, a React element. */
export interface LiveObject {
  [key: string]: Live
}

/** Any value, read as live: a schema for a field that holds whatever running code put there. */
export const live = z.custom<Live>()

const text = z.string()
const numeric = z.number()

/** Loads a module the way the project would, from the project's own `node_modules`: its exports by name. */
export type Load = (specifier: string) => Promise<LiveObject>

/** Whether a value is a function or a class. */
export function isFunction(value: unknown): value is LiveFunction {
  return value instanceof Function
}

/**
 * Whether a value is an object and not a function, arrays included. A module's namespace has no prototype, so this
 * asks whether boxing the value gives the value back rather than whether it's an `Object`.
 */
export function isObject(value: unknown): value is LiveObject | readonly Live[] {
  return Object(value) === value && !(value instanceof Function)
}

/** Whether a value is an object that isn't an array, as a JSON object or a module's namespace is. */
export function isRecord(value: unknown): value is LiveObject {
  return isObject(value) && !Array.isArray(value)
}

/** Whether a value is a string. */
export function isText(value: unknown): value is string {
  return text.safeParse(value).success
}

/** Whether a value is a finite number. */
export function isNumber(value: unknown): value is number {
  return numeric.safeParse(value).success
}

/** Whether a value is a React component: a function or class, or an object React marks as one (`memo`, `forwardRef`). */
export function isComponent(value: unknown): value is LiveFunction | LiveObject {
  return isFunction(value) || (isObject(value) && "$$typeof" in value)
}

/**
 * A module's export by name, or else its default export's, as a CommonJS module loaded as ESM keeps React's
 * `createElement` on `default`.
 */
export function exported(module: LiveObject, name: string): Live {
  const fallback = module.default

  return module[name] ?? (isRecord(fallback) ? fallback[name] : undefined)
}
