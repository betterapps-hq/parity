import { z } from "zod"
import { fileObject, finiteNumber, plainObject } from "../schema.ts"
import { frameParts, isComposite, sampleForms, valueForms } from "./evaluate.ts"

const primitives = [z.string(), finiteNumber, z.boolean(), z.null()] as const

/**
 * A decorator's or sample's value: JSON, or one of six forms that `evaluateValue` works out against a host, the frame
 * in the guest and a trial outside one in libgen. An object with one of the forms' keys must be that form; any other
 * object is plain JSON, its values values too.
 *
 * - `{ "$import": "pkg", "export": "name" }`: something the package exports, such as a theme object. `export` defaults
 *   to `default`, the default export.
 * - `{ "$call": { "import": "pkg", "export": "name" }, "args": [...], "methods": [...] }`: what calling it returns,
 *   after calling `methods` on it in order.
 * - `{ "$global": "theme", "values": { "dark": ... }, "default": ... }`: picked by the frame's global, which is the
 *   mode's option for that variable.
 * - `{ "$frame": "root" | "host" | "body" }`: the frame's shadow root, the element it hangs from (which `:root[...]`
 *   rules match, as `:host(...)`), or the element standing in for its `<body>`. Also `document`, `dir`, `lang`, and
 *   `selector`, a CSS selector for the body alone.
 * - `{ "$function": ... }`: a function returning the value it holds.
 * - `{ "$date": "2026-11-19T00:00:00" }`: the `Date` that `new Date("2026-11-19T00:00:00")` makes, from a string or a
 *   number of milliseconds since 1970.
 *
 * Values are checked once, when their library file loads. The guest evaluates them on every frame without zod. A
 * sample's values are `sampleValue`s.
 */
// The values inside a form are values too, and samples' made values hold whatever JSON an example passed. Their type
// stays `unknown`, as the evaluator reads them; the schema is what checks them.
export const decoratorValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    ...primitives,
    z.array(decoratorValue),
    form("$import", importedValue),
    form("$call", madeValue),
    form("$global", globalValue),
    form("$frame", frameValue),
    form("$function", functionValue),
    form("$date", dateValue),
    plain(valueForms, decoratorValue)
  ])
)

/**
 * A sample's value, which a design node's props copy: JSON, values the package makes (`$call`), as an example
 * passes them, and dates (`$date`). The other forms are a decorator's alone, so in a sample an object with their keys
 * is data as written.
 */
export const sampleValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    ...primitives,
    z.array(sampleValue),
    form("$call", made(sampleValue)),
    form("$date", dateValue),
    plain(sampleForms, sampleValue)
  ])
)

/** Something the package exports, such as a theme object. */
const importedValue = fileObject({ $import: z.string(), export: z.string().optional() })

export type ImportedValue = z.infer<typeof importedValue>

/**
 * A value the package makes by calling one of its own functions, as an example does (Chakra's
 * `collection={createTreeCollection({ rootNode })}`): the canvas calls it with `args`, once per frame.
 */
function made(value: z.ZodType<unknown>) {
  return fileObject({
    $call: fileObject({ import: z.string(), export: z.string() }),
    args: z.array(value).optional(),
    /**
     * Methods called on what it makes, in order, as the examples call them (Chakra's `toaster.create({ title })`), so
     * a toaster is drawn with a toast in it.
     */
    methods: z.array(fileObject({ method: z.string(), args: z.array(value).optional() })).optional()
  })
}

const madeValue = made(decoratorValue)

export type MadeValue = z.infer<typeof madeValue>

/** Picked by the frame's global, which is the mode's option for that variable, else `default`. */
const globalValue = fileObject({
  $global: z.string(),
  values: z.record(z.string(), decoratorValue),
  default: decoratorValue.optional()
})

export type GlobalValue = z.infer<typeof globalValue>

/**
 * A `Date`, as `new Date($date)` makes it in the project's code: from a string JavaScript reads as a date, or from
 * milliseconds since 1970. A string `new Date` can't read is refused, as it would make an invalid date.
 */
export const dateValue = fileObject({
  $date: z.union([z.string(), finiteNumber]).refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "expected a date, such as 2026-11-19T00:00:00"
  })
})

export type DateValue = z.infer<typeof dateValue>

/** Part of the frame itself. */
const frameValue = fileObject({ $frame: z.enum(frameParts) })

export type FrameValue = z.infer<typeof frameValue>

/** A function returning the value it holds. */
const functionValue = fileObject({ $function: decoratorValue })

export type FunctionValue = z.infer<typeof functionValue>

/**
 * An object with a form's key is that form. Any other object is refused as another type of value would be, which
 * `parseData` passes over, so a broken form reports its own mistake and not the closest of the other forms.
 */
function form(key: string, schema: z.ZodType) {
  return z
    .unknown()
    .superRefine((value, context) => {
      if (!(isComposite(value) && key in value)) {
        context.addIssue({ code: "invalid_type", expected: "object", input: value })
      }
    })
    .pipe(schema)
}

/** Plain JSON, its values values too. An object with a form's key is refused, for the form to report. */
function plain(forms: readonly string[], value: z.ZodType<unknown>) {
  return plainObject
    .superRefine((record, context) => {
      if (forms.some((key) => key in record)) {
        context.addIssue({ code: "invalid_type", expected: "object", input: record })
      }
    })
    .pipe(z.record(z.string(), value))
}

/** A decorator's attributes, styles and element props. */
export const decoratorProps = z.record(z.string(), decoratorValue)

/** A sample's props, and those of the components in its children. */
export const sampleProps = z.record(z.string(), sampleValue)
