/**
 * What each function of the snippet API takes, as zod schemas (PAR-596). A snippet passes whatever JavaScript it likes,
 * so every function checks its arguments before it reads them, and a bad one fails as `invalid_input` naming the field.
 * Node trees and patches are PAR-589's schemas from `.par` files, with `null` taking a value away where a call allows it.
 */
import {
  CodedError,
  containerKinds,
  finiteNumber,
  imageCredit,
  nodeStyle,
  paramTypes,
  patchUnset,
  plainObject,
  textTags
} from "@parity-app/core"
import { checkData } from "@parity-app/core/schema"
import { z } from "zod"

/**
 * Checks one argument and returns what the schema reads from it, or throws `invalid_input` with the field at fault, as
 * `node/children/0/type`. `name` is the parameter's name, which starts the field.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: a snippet passes whatever JavaScript it likes
export function readArgument<T extends z.ZodType>(schema: T, value: unknown, name: string): z.output<T> {
  return read(schema, value, `/${name}`, name)
}

/**
 * Checks an argument that is an object of named fields, such as a call's options, whose fields name themselves:
 * `width`, `style/gap`. The parameter's `name` is the field only when the argument itself is wrong.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: a snippet passes whatever JavaScript it likes
export function readFields<T extends z.ZodType>(schema: T, value: unknown, name: string): z.output<T> {
  return read(schema, value, "", name)
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what a snippet passed, checked here
function read<T extends z.ZodType>(schema: T, value: unknown, at: string, name: string): z.output<T> {
  const checked = checkData(schema, value, at)

  if (checked.success) {
    return checked.data
  }

  const { pointer, message } = checked.problem
  const field = pointer.slice(1) || name
  throw new CodedError(`${field}: ${message}`, { code: "invalid_input", field })
}

// The fields `z.strictObject` takes, by its own parameter rather than zod's internal name for them.
type ObjectFields = NonNullable<Parameters<typeof z.strictObject>[0]>

/** Each of an object's fields optional, with `null` to take its value away. */
function nullable<const Fields extends ObjectFields>(fields: Fields) {
  // SAFETY: the entries are `fields`' own, each wrapped the same way, so the object has every key of `Fields` with
  // its schema made nullable and optional; `Object.fromEntries` only knows it has string keys.
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, z.nullable(field).optional()])) as {
    [Key in keyof Fields]: z.ZodOptional<z.ZodNullable<Fields[Key]>>
  }
}

/** A design, by id, `file#id` or name. */
export const designReference = z.string()

/** A node, by `design/node`, or by id or name alone when one design has it. */
export const nodeReference = z.string()

/** A project file the call writes to. */
const parFile = z.string().refine((path) => path.endsWith(".par"), "expected a .par file")

/** A frame's width or height in pixels. */
const pixels = finiteNumber.positive("expected a number of pixels above 0")

/**
 * A patch as an agent writes it for a state or a viewport: PAR-589's node patch, where `null` takes a value away. A
 * state's patch clears what it names; a viewport's leaves out what's `null`.
 */
export const patchInput = z.strictObject({
  hidden: z.boolean().nullish(),
  text: z.string().nullish(),
  props: plainObject.optional(),
  style: z.strictObject(nullable(nodeStyle.shape)).optional(),
  unset: patchUnset.nullish()
})

export type PatchInput = z.infer<typeof patchInput>

/** A variant's option: its id, made from its name unless given, and what it changes, keyed by node id or name. */
const optionInput = z.strictObject({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  overrides: z.record(z.string(), patchInput).optional()
})

export type OptionInput = z.infer<typeof optionInput>

/** A param, as `CreateDesign` and `AddParam` take it. A variant's default can be an option's id or name. */
export const paramInput = z.strictObject({
  type: z.enum(paramTypes),
  default: z.unknown().optional(),
  description: z.string().optional(),
  options: z.array(optionInput).min(1).optional()
})

export type ParamInput = z.infer<typeof paramInput>

/** `UpdateParam`'s change. `null` takes away the default or the description; `options` is the whole new list. */
export const paramUpdate = z.strictObject({
  name: z.string().optional(),
  default: z.unknown().optional(),
  description: z.string().nullish(),
  options: z.array(optionInput).min(1).optional()
})

export type ParamUpdate = z.infer<typeof paramUpdate>

/** `Update`'s change: a patch, and the node's name, tag and component in the base state. */
export const updateChange = z.strictObject(
  {
    ...patchInput.shape,
    name: z.string().nullish(),
    tag: z.enum(textTags).nullish(),
    component: z.string().optional(),
    /** An instance's args, as props. */
    args: plainObject.optional(),
    /** An image's picture, its description and who made it, in the base design only. */
    src: z.string().min(1).optional(),
    alt: z.string().nullish(),
    credit: imageCredit.nullish(),
    /** Binds a field to one of the component's params, or with `null` unbinds it, in the base design only. */
    bind: z
      .strictObject({
        text: z.string().nullish(),
        visible: z.string().nullish(),
        props: z.record(z.string(), z.string().nullable()).optional()
      })
      .optional()
  },
  {
    error: (issue) =>
      issue.code === "unrecognized_keys" ? "Update can't change this; use Replace, Move or Responsive" : undefined
  }
)

export type UpdateChange = z.infer<typeof updateChange>

export const updateOptions = z.strictObject({ state: z.string().optional() }).optional()

export const designInput = z.strictObject({
  name: z.string(),
  kind: z.enum(containerKinds).optional(),
  file: parFile.optional(),
  x: finiteNumber.optional(),
  y: finiteNumber.optional(),
  /** Checked as a node tree when the design gets its fresh ids. */
  root: z.unknown().optional(),
  baseState: z.string().optional(),
  /** A frame's own size, in pixels. */
  width: pixels.optional(),
  height: pixels.optional(),
  /** A component's params, by name. */
  params: z.record(z.string(), paramInput).optional()
})

export type DesignInput = z.infer<typeof designInput>

/** Inserting into `document` makes a design of the node, named after it unless the options name it. */
export const documentPlacement = designInput.omit({ root: true }).partial({ name: true }).optional()

export const designUpdate = z.strictObject({
  name: z.string().optional(),
  /** Becoming a frame drops what a frame doesn't have, and says so in the call's warnings. */
  kind: z.enum(containerKinds).optional(),
  x: finiteNumber.optional(),
  y: finiteNumber.optional(),
  /** A frame's own size, in pixels. */
  width: pixels.optional(),
  height: pixels.optional(),
  /** The main frame's mode. */
  mode: z.string().optional(),
  /** Modes shown beside the main frame. */
  showModes: z.array(z.string()).optional(),
  state: z.string().optional(),
  allStates: z.boolean().optional()
})

export type DesignUpdate = z.infer<typeof designUpdate>

const placeFields = { index: z.int().nonnegative().optional(), slot: z.string().optional() }

export const placeOptions = z.strictObject(placeFields).optional()

export type PlaceOptions = z.infer<typeof placeOptions>

export const copyOptions = z.strictObject({ ...placeFields, name: z.string().optional() }).optional()

export const getOptions = z
  .strictObject({
    depth: z.int().nonnegative().optional(),
    /** Read the nodes as the board draws this state; the state the design shows when only `mode` is given. */
    state: z.string().optional(),
    /** Read the nodes as the board draws this mode; the design's main mode when only `state` is given. */
    mode: z.string().optional()
  })
  .optional()

export type GetOptions = z.infer<typeof getOptions>

/** What `Get` reads: a path, or a function it calls for every node. */
export const getPath = z.string("expected a path, or a function to call for every node")

const matrixFields = {
  /** A state id, a list of them, or "all". Defaults to the state the design shows. */
  state: z.union([z.string(), z.array(z.string())]).optional(),
  /** A mode id, a list, "shown" (what the design shows) or "all". Defaults to the primary mode. */
  mode: z.union([z.string(), z.array(z.string())]).optional()
}

/** Which frames a check draws: the states and modes asked for. */
export const matrixOptions = z.strictObject(matrixFields).optional()

export type MatrixOptions = z.infer<typeof matrixOptions>

export const screenshotOptions = z.strictObject({ ...matrixFields, scale: finiteNumber.optional() }).optional()

export const propsOptions = z.strictObject({ all: z.boolean().optional() }).optional()

export const iconOptions = z
  .strictObject({
    /** Finds icons by name, alias and the tags the set publishes, best first. */
    search: z.string().optional(),
    /** One of the set's styles; the set's default otherwise. */
    style: z.string().optional(),
    /** At most this many icons; 50 unless set. */
    limit: z.int().positive().optional()
  })
  .optional()

export const tokenFilter = z
  .strictObject({
    category: z.string().optional(),
    source: z.string().optional(),
    search: z.string().optional(),
    /** A color or length that isn't a token, such as `#2f6fed` or `13px`: the tokens nearest it, nearest first. */
    nearest: z.string().optional()
  })
  .optional()

export type TokenFilter = NonNullable<z.infer<typeof tokenFilter>>

/** A state's changes, keyed by node id or name; `null` clears a node's override. */
const stateChanges = z.record(z.string(), patchInput.nullable()).optional()

export const newState = z.strictObject({ name: z.string(), changes: stateChanges })

export const stateUpdate = z.strictObject({ name: z.string().optional(), changes: stateChanges })

/** Token values by name, as one value or one per theme. One value is the `default` theme's. */
export const tokenValues = z.record(
  z.string(),
  z.union([z.string().transform((value) => ({ default: value })), z.record(z.string(), z.string())])
)

export const spaceOptions = z.strictObject({
  width: finiteNumber,
  height: finiteNumber,
  direction: z.enum(["right", "below"]).optional(),
  padding: finiteNumber.optional(),
  near: z.string().optional()
})

/** `PlaceReference`'s options: the design it's for, why it's here, and the connector that found it. */
export const referenceOptions = z.strictObject({
  near: z.string().optional(),
  note: z.string().max(500).optional(),
  connector: z.string().optional()
})

export const extractNodes = z.union([z.string(), z.array(z.string()).min(1)])

export const extractOptions = z.strictObject({
  name: z.string(),
  file: parFile.optional(),
  /** Better names for the params found, by the name they were given. */
  params: z.record(z.string(), z.string()).optional()
})
