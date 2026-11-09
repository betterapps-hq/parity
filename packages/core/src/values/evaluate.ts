// The guest bundles this file into the project's own code and runs it on every frame, so it imports nothing at runtime:
// no zod, and none of core's other modules. `grammar.ts` checks values with zod when their file loads; this works them
// out, typed from that grammar.
import type { ComponentSample, SampleElement, SampleRender } from "../library.ts"
import type { FrameValue, GlobalValue, ImportedValue, MadeValue } from "./grammar.ts"

/** The keys that mark an object as one of the value forms rather than plain JSON. */
export const valueForms = ["$import", "$call", "$global", "$frame", "$function"] as const

/**
 * Which grammar a value follows: a decorator's, with all five forms, or a sample's, which a design node's props copy,
 * where only `$call` is a form and the other keys are data as written.
 */
export type ValueKind = "decorator" | "sample"

/** The parts of a frame a `$frame` value can name. */
export const frameParts = ["root", "host", "body", "document", "dir", "lang", "selector"] as const

export type FramePart = FrameValue["$frame"]

/**
 * What a value is worked out against. The guest's frame host loads modules with the project's own build tool and
 * knows the frame; libgen's trial host loads them in Node and has no frame.
 */
export interface ValueHost {
  /** A module's export by its path (`Tooltip.Provider`, see `exportOf`). Throws when the module isn't loaded. */
  exported(specifier: string, path: string): unknown
  /** The frame's option for a global, as its mode sets it, or `undefined` outside a frame. */
  global(name: string): string | undefined
  frame(part: FramePart): unknown
  /** What each `$call` made, by the call, so each is made once for as long as the host keeps them. */
  made: Map<string, unknown>
}

// Tree walks call these for every value, so they look at the one key that marks each form rather than parsing it. The
// value was checked when its file loaded.

/** Whether a sample's prop value is elements. */
export function isSampleElement(value: unknown): value is SampleElement {
  return typeof value === "object" && value !== null && Array.isArray((value as Record<string, unknown>).$element)
}

/** Whether a value is one the package makes. */
export function isMadeValue(value: unknown): value is MadeValue {
  const call = typeof value === "object" && value !== null ? (value as Record<string, unknown>).$call : undefined

  return typeof call === "object" && call !== null && typeof (call as Record<string, unknown>).import === "string"
}

/** Whether a sample's child or prop value is a render function. */
export function isSampleRender(value: unknown): value is SampleRender {
  return typeof value === "object" && value !== null && Array.isArray((value as Record<string, unknown>).$render)
}

/**
 * A value worked out against a host: plain JSON as written, and its kind's forms made. A `$import` without an `export`
 * is the module's default export. A `$call` calls its function with its `args`, then the `methods` in order on what it
 * returned, wherever the call is; a method that's missing or throws is passed over, as the made value is still usable.
 * Arrays and objects with no form inside them come back as they were, so a prop keeps its identity between draws.
 */
export function evaluateValue(value: unknown, host: ValueHost, kind: ValueKind = "decorator"): unknown {
  const evaluate = (item: unknown) => evaluateValue(item, host, kind)

  if (Array.isArray(value)) {
    const items = value.map(evaluate)

    return items.every((item, index) => item === value[index]) ? value : items
  }

  if (typeof value !== "object" || value === null) {
    return value
  }

  const record = value as Record<string, unknown>

  if (isMadeValue(record)) {
    return made(record, host, kind)
  }

  if (kind === "sample") {
    return evaluateEntries(record, evaluate)
  }

  if (typeof record.$import === "string") {
    const imported = record as ImportedValue

    return host.exported(imported.$import, imported.export ?? "default")
  }

  if (typeof record.$global === "string") {
    const global = record as GlobalValue
    const chosen = host.global(global.$global)
    const values = global.values ?? {}

    return evaluate(chosen !== undefined && Object.hasOwn(values, chosen) ? values[chosen] : global.default)
  }

  if (typeof record.$frame === "string") {
    return host.frame((record as FrameValue).$frame)
  }

  if ("$function" in record) {
    return () => evaluate(record.$function)
  }

  return evaluateEntries(record, evaluate)
}

/** Plain JSON's entries worked out, or the object as it was when none of them changed. */
function evaluateEntries(record: Record<string, unknown>, evaluate: (item: unknown) => unknown): unknown {
  let changed = false

  const entries = Object.entries(record).map(([key, item]) => {
    const evaluated = evaluate(item)

    if (evaluated !== item) {
      changed = true
    }

    return [key, evaluated] as const
  })

  return changed ? Object.fromEntries(entries) : record
}

function made(value: MadeValue, host: ValueHost, kind: ValueKind): unknown {
  const key = JSON.stringify(value)

  if (host.made.has(key)) {
    return host.made.get(key)
  }

  const { import: specifier, export: name } = value.$call
  const fn = host.exported(specifier, name)

  if (typeof fn !== "function") {
    throw new Error(`${specifier} has no function ${name}`)
  }

  const result: unknown = fn(...(value.args ?? []).map((arg) => evaluateValue(arg, host, kind)))

  // The methods the examples call on it (`toaster.create({ title })`), once.
  for (const step of value.methods ?? []) {
    const method = (result as Record<string, unknown> | null | undefined)?.[step.method]

    if (typeof method !== "function") {
      continue
    }

    try {
      method.apply(
        result,
        (step.args ?? []).map((arg) => evaluateValue(arg, host, kind))
      )
    } catch {
      // A call the examples make may need what the app has around it.
    }
  }

  host.made.set(key, result)

  return result
}

/** The modules a value imports from, each once, in the order they first appear. Plain JSON imports none. */
export function valueImports(value: unknown, kind: ValueKind = "decorator"): string[] {
  const found = new Set<string>()

  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      return item.forEach(visit)
    }

    if (typeof item !== "object" || item === null) {
      return
    }

    const record = item as Record<string, unknown>

    if (kind === "decorator" && typeof record.$import === "string") {
      found.add(record.$import)

      return
    }

    if (isMadeValue(record)) {
      found.add(record.$call.import)
      record.args?.forEach(visit)

      for (const step of record.methods ?? []) {
        step.args?.forEach(visit)
      }

      return
    }

    if (kind === "decorator" && typeof record.$frame === "string") {
      return
    }

    Object.values(record).forEach(visit)
  }

  visit(value)

  return [...found]
}

/** An export of a module, following dots into namespaces (`Tooltip.Provider`). */
export function exportOf(module: unknown, path: string): unknown {
  let found = module

  for (const part of path.split(".")) {
    found = (found as Record<string, unknown> | null | undefined)?.[part]
  }

  return found
}

/**
 * Where a part's sample calls what's inside it: its function children, else a render prop (Chakra's `TreeView.Node`
 * `render`), with the render function.
 */
export function renderSlotOf(sample: ComponentSample | undefined): { prop: string; render: SampleRender } | undefined {
  const children = sample?.children?.find(isSampleRender)

  if (children) {
    return { prop: "children", render: children }
  }

  const entry = Object.entries(sample?.props ?? {}).find(([, value]) => isSampleRender(value))

  return entry ? { prop: entry[0], render: entry[1] as SampleRender } : undefined
}

/** How a design node's render slot calls its nodes: the prop, and what the function is called with goes to. */
export interface RenderSlot {
  prop: string
  /** What it's called with is spread onto the one element it returns. */
  spread: boolean
  /** Props of that element that take what it's called with whole. */
  pass?: string[]
}

/**
 * The key a component node keeps a render function's nodes under (`renderInput`, function children): `$render:` and the
 * prop, `$renderWith:` when what it's called with is spread onto them, and `?pass=a,b` for the props that take it.
 */
export function renderSlotKey(prop: string, render: Pick<SampleRender, "spread" | "pass">): string {
  const pass = render.pass ? `?pass=${render.pass.join(",")}` : ""

  return `${render.spread ? "$renderWith" : "$render"}:${prop}${pass}`
}

/** A slot key `renderSlotKey` wrote, read back; `undefined` for a slot of plain nodes. */
export function readRenderSlotKey(key: string): RenderSlot | undefined {
  const match = /^\$render(With)?:([^?]+)(?:\?pass=(.+))?$/.exec(key)

  if (!match) {
    return undefined
  }

  const [, spread, prop, pass] = match

  return { prop: prop!, spread: spread !== undefined, ...(pass ? { pass: pass.split(",") } : {}) }
}
