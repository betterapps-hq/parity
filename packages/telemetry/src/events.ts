import type { z } from "zod"
import type { Level } from "./envelope.ts"

/** An event's attributes: an object of named fields, so each is searchable in Sentry and listed in the catalog. */
export type AttributesSchema = z.ZodType<Record<string, unknown>>

/** A registered event: its name, the schema its attributes follow, its level and the share of them kept. */
export interface EventDefinition<Name extends string = string, Schema extends AttributesSchema = AttributesSchema> {
  name: Name
  schema: Schema
  level: Level
  /** The share kept, from 0 to 1. */
  sample: number
}

/** Dotted and lowercase, area first: `project.opened`, `command.ran`, `gesture.ended`. */
const eventName = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/

/**
 * Defines an event for `createTelemetry` to register. Its name is dotted, area first, and its attributes follow
 * `schema`. `sample` keeps that share of them, all by default. A name that isn't dotted or a share outside 0 to 1 is a
 * mistake in Parity's own code, so it throws.
 */
export function defineEvent<const Name extends string, Schema extends AttributesSchema>(
  name: Name,
  schema: Schema,
  { level, sample = 1 }: { level: Level; sample?: number }
): EventDefinition<Name, Schema> {
  if (!eventName.test(name)) throw new Error(`An event's name is dotted and lowercase, area first, not "${name}"`)
  if (!(sample >= 0 && sample <= 1)) throw new Error(`${name} keeps a share from 0 to 1, not ${sample}`)
  return { name, schema, level, sample }
}

/** The names of a set of events. */
export type EventName<Events extends readonly EventDefinition[]> = Events[number]["name"]

/** What an event's attributes take, from its schema. */
export type EventAttributes<Events extends readonly EventDefinition[], Name extends EventName<Events>> = z.input<
  Extract<Events[number], { name: Name }>["schema"]
>
