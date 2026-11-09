// The guest bundles this file into the project's own code and runs it on every frame, so it imports nothing at runtime:
// no zod, and none of core's other modules. `grammar.ts` checks values with zod when their file loads; this works them
// out, typed from that grammar.
import type { ComponentSample, SampleElement, SampleRender } from "../library.ts"
import type { FrameValue, FunctionValue, GlobalValue, ImportedValue, MadeValue } from "./grammar.ts"

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
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- a module's export is whatever its package exports
  exported(specifier: string, path: string): unknown
  /** The frame's option for a global, as its mode sets it, or `undefined` outside a frame. */
  global(name: string): string | undefined
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- the frame's parts are DOM nodes and strings, as the host has them
  frame(part: FramePart): unknown
  /** What each `$call` made, by the call, so each is made once for as long as the host keeps them. */
  made: Map<string, unknown>
}

// Tree walks call these for every value, so they look at the one key that marks each form rather than parsing it. The
// value was checked when its file loaded.

/** Whether a value is an object or a list, which is how JSON holds everything but its primitives. */
export function isComposite(value: unknown): value is object {
  return value !== null && Object(value) === value
}

/** Whether a value is text. */
export function isText(value: unknown): value is string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the guest checks values without zod, and text is a primitive
  return typeof value === "string"
}

/** Whether a sample's prop value is elements. */
export function isSampleElement(value: unknown): value is SampleElement {
  return isComposite(value) && "$element" in value && Array.isArray(value.$element)
}

/** Whether a value is one the package makes. */
export function isMadeValue(value: unknown): value is MadeValue {
  if (!isComposite(value) || !("$call" in value)) {
    return false
  }

  const call = value.$call

  return isComposite(call) && "import" in call && isText(call.import)
}

/** Whether a sample's child or prop value is a render function. */
export function isSampleRender(value: unknown): value is SampleRender {
  return isComposite(value) && "$render" in value && Array.isArray(value.$render)
}

/**
 * A value worked out against a host: plain JSON as written, and its kind's forms made. A `$import` without an `export`
 * is the module's default export. A `$call` calls its function with its `args`, then the `methods` in order on what it
 * returned, wherever the call is; a method that's missing or throws is passed over, as the made value is still usable.
 * Arrays and objects with no form inside them come back as they were, so a prop keeps its identity between draws.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- grammar.ts checked the value when its file loaded, and it works out to whatever a module exports
export function evaluateValue(value: unknown, host: ValueHost, kind: ValueKind = "decorator"): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => evaluateValue(item, host, kind))

    return items.every((item, index) => item === value[index]) ? value : items
  }

  if (!isComposite(value)) {
    return value
  }

  if (isMadeValue(value)) {
    return made(value, host, kind)
  }

  if (kind === "sample") {
    return evaluateEntries(value, host, kind)
  }

  // In a decorator's grammar an object with a form's key is that form, as grammar.ts checked when the file loaded.
  if ("$import" in value) {
    // SAFETY: grammar.ts refuses a decorator value with `$import` that isn't an `ImportedValue`.
    const imported = value as ImportedValue

    return host.exported(imported.$import, imported.export ?? "default")
  }

  if ("$global" in value) {
    // SAFETY: grammar.ts refuses a decorator value with `$global` that isn't a `GlobalValue`.
    const global = value as GlobalValue
    const chosen = host.global(global.$global)
    const values = global.values ?? {}

    return evaluateValue(
      chosen !== undefined && Object.hasOwn(values, chosen) ? values[chosen] : global.default,
      host,
      kind
    )
  }

  if ("$frame" in value) {
    // SAFETY: grammar.ts refuses a decorator value with `$frame` that isn't a `FrameValue`.
    return host.frame((value as FrameValue).$frame)
  }

  if ("$function" in value) {
    // SAFETY: grammar.ts refuses a decorator value with `$function` that isn't a `FunctionValue`.
    return evaluateLater(value as FunctionValue, host, kind)
  }

  return evaluateEntries(value, host, kind)
}

/** A `$function` value's function, which works out the value it holds each time it's called. */
function evaluateLater(value: FunctionValue, host: ValueHost, kind: ValueKind) {
  return () => evaluateValue(value.$function, host, kind)
}

/** Plain JSON's entries worked out, or the object as it was when none of them changed. */
function evaluateEntries<Entries extends object>(record: Entries, host: ValueHost, kind: ValueKind) {
  let changed = false

  const entries = Object.entries(record).map(([key, item]) => {
    const evaluated = evaluateValue(item, host, kind)

    if (evaluated !== item) {
      changed = true
    }

    return [key, evaluated] as const
  })

  return changed ? Object.fromEntries(entries) : record
}

// oxlint-disable-next-line anti-slop/no-unknown-returns -- what a package's function makes is whatever it returns
function made(value: MadeValue, host: ValueHost, kind: ValueKind): unknown {
  const key = JSON.stringify(value)

  if (host.made.has(key)) {
    return host.made.get(key)
  }

  const { import: specifier, export: name } = value.$call
  const fn = host.exported(specifier, name)

  if (!(fn instanceof Function)) {
    throw new Error(`${specifier} has no function ${name}`)
  }

  const result: unknown = fn(...(value.args ?? []).map((arg) => evaluateValue(arg, host, kind)))

  // The methods the examples call on it (`toaster.create({ title })`), once.
  for (const step of value.methods ?? []) {
    // As `result?.[step.method]` reads it: `Object` wraps a primitive, so a string's methods are found on it too.
    const method = result === null || result === undefined ? undefined : Object(result)[step.method]

    if (!(method instanceof Function)) {
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
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- grammar.ts checked the value when its file loaded; callers pass props as they hold them
export function valueImports(value: unknown, kind: ValueKind = "decorator"): string[] {
  const found = new Set<string>()
  collectImports(value, kind, found)

  return [...found]
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- walks the value `valueImports` was given, part by part
function collectImports(item: unknown, kind: ValueKind, found: Set<string>): void {
  if (Array.isArray(item)) {
    for (const entry of item) {
      collectImports(entry, kind, found)
    }

    return
  }

  if (!isComposite(item)) {
    return
  }

  if (kind === "decorator" && "$import" in item && isText(item.$import)) {
    found.add(item.$import)

    return
  }

  if (isMadeValue(item)) {
    found.add(item.$call.import)

    for (const arg of item.args ?? []) {
      collectImports(arg, kind, found)
    }

    for (const step of item.methods ?? []) {
      for (const arg of step.args ?? []) {
        collectImports(arg, kind, found)
      }
    }

    return
  }

  if (kind === "decorator" && "$frame" in item && isText(item.$frame)) {
    return
  }

  for (const entry of Object.values(item)) {
    collectImports(entry, kind, found)
  }
}

/** An export of a module, following dots into namespaces (`Tooltip.Provider`). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- a module is whatever its package exports
export function exportOf(module: unknown, path: string): unknown {
  let found = module

  for (const part of path.split(".")) {
    // As `found?.[part]` reads it: `Object` wraps a primitive, so a string's methods are found on it too.
    found = found === null || found === undefined ? undefined : Object(found)[part]
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

  const render = entry?.[1]

  return entry && isSampleRender(render) ? { prop: entry[0], render } : undefined
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

  const slot: RenderSlot = { prop: prop!, spread: spread !== undefined }

  if (pass) {
    slot.pass = pass.split(",")
  }

  return slot
}
