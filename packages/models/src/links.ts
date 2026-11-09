import { z } from "zod"
import { checkModel } from "./check.ts"

// Links join the other models, such as screen → route → operation → table. A person draws them first; traces and the
// code add more later.

export const LinkKind = z.enum(["screen", "route", "operation", "table"])

export const LinkEnd = z.strictObject({
  kind: LinkKind,
  /** The screen's design id, or the route's, operation's or table's id in its own model. */
  id: z.string().min(1)
})

export const Link = z.strictObject({
  from: LinkEnd,
  to: LinkEnd,
  /** Where it came from: drawn by a person, seen in a trace, or followed through the code. */
  source: z.enum(["drawn", "trace", "code"])
})

export const Links = z.strictObject({
  $schema: z.string().optional(),
  version: z.literal(1),
  links: z.array(Link)
})

export type LinkKind = z.infer<typeof LinkKind>

export type LinkEnd = z.infer<typeof LinkEnd>

export type Link = z.infer<typeof Link>

export type Links = z.infer<typeof Links>

export function parseLinks(value: unknown): Links {
  return checkModel(Links, value)
}
