import type { z } from "zod"
import type { Attributes, Level, Process } from "./envelope.ts"

/** An event's attributes: an object of named fields, so each is searchable in Sentry and listed in the catalog. */
export type AttributesSchema = z.ZodType<Attributes, Attributes>

/**
 * A registered event: its name, the schema its attributes follow, its level, the share of them kept, the processes that
 * send it and when. docs/telemetry.md lists each one from these.
 */
export interface EventDefinition<Name extends string = string, Schema extends AttributesSchema = AttributesSchema> {
  name: Name
  schema: Schema
  level: Level
  /** The share kept, from 0 to 1. */
  sample: number
  /** The processes that send it. */
  sentBy: readonly Process[]
  /** When it's sent, as a sentence for the catalog: "A project finishes opening, or fails to." */
  when: string
}

/** Dotted and camelCase, area first: `project.opened`, `document.saveFailed`, `projectEdit.applied`. */
const eventName = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9_]*)+$/

/**
 * Defines an event for `createTelemetry` to register. Its name is dotted, area first, and its attributes follow
 * `schema`, each described with `.describe()` for the catalog. `sample` keeps that share of them, all by default. A name
 * that isn't dotted or a share outside 0 to 1 is a mistake in Parity's own code, so it throws.
 */
export function defineEvent<const Name extends string, Schema extends AttributesSchema>(
  name: Name,
  schema: Schema,
  { level, sample = 1, sentBy, when }: { level: Level; sample?: number; sentBy: readonly Process[]; when: string }
): EventDefinition<Name, Schema> {
  if (!eventName.test(name)) {
    throw new Error(`An event's name is dotted and camelCase, area first, not "${name}"`)
  }

  if (!(sample >= 0 && sample <= 1)) {
    throw new Error(`${name} keeps a share from 0 to 1, not ${sample}`)
  }

  return { name, schema, level, sample, sentBy, when }
}

/** The names of a set of events. */
export type EventName<Events extends readonly EventDefinition[]> = Events[number]["name"]

/** What an event's attributes take, from its schema. */
export type EventAttributes<Events extends readonly EventDefinition[], Name extends EventName<Events>> = z.input<
  Extract<Events[number], { name: Name }>["schema"]
>
