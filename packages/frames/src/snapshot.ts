import { type DataParser, parserFor } from "@parity-app/core/schema"
import type { PageLocation } from "@parity-app/extension/page"
import { z } from "zod"

/** What a route's page drew in one mode, as plain data. */
export interface PageSnapshot {
  /** Where the page is: the route asked for, or where it redirected. */
  location: PageLocation
  /** The mode's window the page was laid out in. */
  viewport: { width: number; height: number }
  /** The page's whole height in that window, in CSS pixels, rounded up. */
  pageHeight: number
  /** `<html>`'s classes and attributes without the mode's, and its inline style. */
  root: PageRoot
  /** `<body>` and everything in it, with every URL made absolute against the page's address. */
  body: FrozenElement
  /**
   * The page's stylesheets in document order, so the cascade holds: a readable sheet by content hash, which Parity asks
   * for if it hasn't got it, or a sheet on another origin, whose rules the page can't read, by address, for main to
   * fetch.
   */
  sheets: SheetEntry[]
  /** A hash of `body`, which tells modes with the same markup apart from the rest. */
  markup: string
}

/** `<html>`'s classes, attributes and inline style, as a snapshot holds them. */
export interface PageRoot {
  classes: string[]
  attributes: [name: string, value: string][]
  style: string
}

/**
 * One of a snapshot's stylesheets: the page's own by content hash, or another origin's by address, with the at-rule
 * conditions around it, outermost first, from its own `media` and every sheet and `@import` it's in (`@media print`,
 * `@layer base`).
 */
export type SheetEntry = { hash: string } | { href: string; conditions?: string[] }

export type FrozenNode = FrozenElement | string

export interface FrozenElement {
  tag: string
  /** Set for `svg` and `math` and everything inside them. */
  namespace?: "svg" | "math"
  attributes: [name: string, value: string][]
  children: FrozenNode[]
}

export interface PageSheet {
  /** A hash of `text`. */
  id: string
  /**
   * The rules as written, from `<style>`, `<link>` and adopted sheets alike, with `@import`s inlined and `url()`s made
   * absolute against the sheet's own address.
   */
  text: string
}

export type { PageLocation }

/** The most elements a snapshot's body may hold, itself included. */
export const maxSnapshotElements = 50_000

/** How deep a snapshot's body may go: the body is at depth 1. */
export const maxSnapshotDepth = 256

/** The most text a snapshot's body may hold, in UTF-16 code units: its tags, attributes and text together. */
export const maxSnapshotText = 8 * 1024 * 1024

/** The most text a stylesheet may hold, in UTF-16 code units. */
export const maxSheetText = 4 * 1024 * 1024

const attribute = z.tuple([z.string(), z.string()])

export const pageLocationSchema: z.ZodType<PageLocation> = z.strictObject({
  path: z.string().startsWith("/"),
  search: z.string(),
  hash: z.string(),
  outcome: z.enum(["landed", "redirected", "not-found", "error"])
})

/** One element, without looking into its children, which `frozenBody` walks itself so no depth can overflow the stack. */
const shallowElement = z.strictObject({
  tag: z.string().min(1),
  namespace: z.enum(["svg", "math"]).optional(),
  attributes: z.array(attribute),
  children: z.array(z.unknown())
})

const textNode = z.string()

/** Where a child still to be read goes: the list it joins, and how deep it sits. */
interface Pending {
  raw: unknown
  into: FrozenNode[]
  depth: number
  at: string
}

/**
 * A snapshot's body, checked and copied one element at a time without recursion, so a page past a cap is refused
 * before it costs more than the cap: at most `maxSnapshotElements` elements, `maxSnapshotDepth` deep and
 * `maxSnapshotText` of text.
 */
const frozenBody = z.unknown().transform((value, context): FrozenElement => {
  const fail = (message: string, path: string) => {
    context.addIssue({ code: "custom", message, path: path ? path.split("/") : [] })

    return z.NEVER
  }

  const top = shallowElement.safeParse(value)

  if (!top.success) {
    return fail("expected the body as an element", "")
  }

  if (top.data.tag !== "body" || top.data.namespace) {
    return fail("expected the body element", "tag")
  }

  const body: FrozenElement = { tag: "body", attributes: top.data.attributes, children: [] }
  let elements = 1
  let text = textOf(body)

  if (text > maxSnapshotText) {
    return fail(`a snapshot holds at most ${maxSnapshotText} characters of text`, "attributes")
  }

  const pending: Pending[] = top.data.children.map((raw, index) => ({
    raw,
    into: body.children,
    depth: 2,
    at: `children/${index}`
  }))

  pending.reverse()

  for (let next = pending.pop(); next; next = pending.pop()) {
    const asText = textNode.safeParse(next.raw)
    const asElement = asText.success ? undefined : shallowElement.safeParse(next.raw)

    if (asText.success) {
      text += asText.data.length
      next.into.push(asText.data)
    } else if (!asElement?.success) {
      return fail("expected text or an element", next.at)
    } else {
      const raw = asElement.data
      elements += 1

      if (elements > maxSnapshotElements) {
        return fail(`a snapshot holds at most ${maxSnapshotElements} elements`, next.at)
      }

      if (next.depth > maxSnapshotDepth) {
        return fail(`a snapshot is at most ${maxSnapshotDepth} elements deep`, next.at)
      }

      const element: FrozenElement = { tag: raw.tag, attributes: raw.attributes, children: [] }

      if (raw.namespace) {
        element.namespace = raw.namespace
      }

      text += textOf(element)
      next.into.push(element)

      for (let index = raw.children.length - 1; index >= 0; index -= 1) {
        pending.push({
          raw: raw.children[index],
          into: element.children,
          depth: next.depth + 1,
          at: `${next.at}/children/${index}`
        })
      }
    }

    if (text > maxSnapshotText) {
      return fail(`a snapshot holds at most ${maxSnapshotText} characters of text`, next.at)
    }
  }

  return body
})

/** The text an element holds itself: its tag and its attributes' names and values. */
function textOf(element: FrozenElement): number {
  return element.attributes.reduce((sum, [name, value]) => sum + name.length + value.length, element.tag.length)
}

/** An at-rule's prelude a sheet sits inside, with no block or statement of its own. */
const sheetCondition = z.string().regex(/^@(?:media|layer|supports)\b[^{};]*$/)

export const pageSnapshotSchema = z.strictObject({
  location: pageLocationSchema,
  viewport: z.strictObject({ width: z.number().positive(), height: z.number().positive() }),
  pageHeight: z.number().int().nonnegative(),
  root: z.strictObject({ classes: z.array(z.string()), attributes: z.array(attribute), style: z.string() }),
  body: frozenBody,
  sheets: z.array(
    z.union([
      z.strictObject({ hash: z.string().min(1) }),
      z.strictObject({ href: z.url(), conditions: z.array(sheetCondition).max(32).optional() })
    ])
  ),
  markup: z.string().min(1)
})

export const pageSheetSchema = z.strictObject({
  id: z.string().min(1),
  text: z.string().max(maxSheetText, `a sheet holds at most ${maxSheetText} characters`)
})

/** Reads a snapshot from a page, refusing one past a cap. */
export const parsePageSnapshot: DataParser<PageSnapshot> = parserFor(pageSnapshotSchema)

/** Reads the stylesheets a page sent for `sheets.get`, refusing one past the cap. */
export const parsePageSheets: DataParser<PageSheet[]> = parserFor(z.array(pageSheetSchema))
