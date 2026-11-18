import { bodyAttribute, prepareCanvasCss } from "@parity-app/core"
import { type PageMode, type SanitizePolicy, sanitizeSheet } from "@parity-app/frames"

/*
 * A frozen copy's stylesheets as its shadow root adopts them (docs/proposals/route-frames.md, "Frozen copies"): each
 * sanitized and prepared once per content hash, and shared by every copy that lists it. The canvas's route boards and
 * the render window's pictures both draw copies with them, so a picture is styled as the board's copy is.
 */

/** What a copy's sheets are found by: the ids it lists, in the page's order, and the origin they were sanitized for. */
export interface CopySheets {
  sheets: readonly string[]
  origin: string
}

/** The text of each stylesheet a copy lists, by its id: a page's own by content hash, another host's as `href:` and its address. */
export const sheetTexts = new Map<string, string>()

/** Each stylesheet prepared for a copy's shadow root, by its origin and id, shared by every copy that lists it. */
const preparedSheets = new Map<string, CSSStyleSheet>()

/** The rules only the document can hold, `@font-face` and `@property`, from every copy's sheets, and their sheet. */
interface CopyGlobals {
  sheet?: CSSStyleSheet
  /** Each prepared sheet's rules for the document, by its origin and id. */
  texts: Map<string, string>
}

const copyGlobals: CopyGlobals = { texts: new Map() }

/**
 * A copy's stylesheets, each sanitized and gone through `prepareCanvasCss` once per content hash and shared by every
 * copy that lists it, so its media queries, viewport units, fonts and root rules measure the copy's mode. What only the
 * document can hold goes into one sheet the document adopts.
 */
export function copySheets(copy: CopySheets): CSSStyleSheet[] {
  const policy: SanitizePolicy = { pageOrigin: copy.origin }

  return copy.sheets.flatMap((id) => {
    const key = `${copy.origin}\n${id}`
    let sheet = preparedSheets.get(key)

    if (!sheet) {
      const text = sheetTexts.get(id)

      if (text === undefined) {
        return []
      }

      const prepared = prepareCanvasCss(sanitizeSheet(text, policy), { baseUrl: copy.origin })
      sheet = new CSSStyleSheet()
      sheet.replaceSync(throughCopyRoot(prepared.scoped))
      preparedSheets.set(key, sheet)
      addGlobals(key, prepared.global)
    }

    return [sheet]
  })
}

/**
 * A web component's shadow-root styles in a copy, prepared as the copy's sheets are, so their media queries and viewport
 * units measure the copy's mode too. A `prefers-color-scheme` query is answered for the mode's scheme here, since the
 * body the copy's sheets scope those rules to is outside the shadow root, and its roots stay its own `:host`. They've
 * been through `sanitizePage`.
 */
export function copyShadowStyle(copy: Pick<CopySheets, "origin">, css: string, scheme: PageMode["scheme"]): string {
  const answered = scheme
    ? css.replaceAll(/\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/gi, (_query, asked: string) =>
        asked.toLowerCase() === scheme ? "(min-width: 0px)" : "(max-width: -1px)"
      )
    : css

  const prepared = prepareCanvasCss(answered, {
    baseUrl: copy.origin,
    colorSchemes: false,
    qualifiedRoots: false
  })

  addGlobals(`${copy.origin}\nshadow:${answered}`, prepared.global)

  return prepared.scoped
}

/** The attribute on a copy's element on a route board that names its layer, which a style preview's rules find it by. */
export const copyNodeAttribute = "data-copy-node"

/** The selector of a copy's element for a layer (`copyNodeAttribute`). */
export function copyNodeSelector(nodeId: string): string {
  return `[${copyNodeAttribute}="${nodeId.replaceAll(/["\\]/g, String.raw`\$&`)}"]`
}

/** The attribute on the element around a copy's body that carries `<html>`'s classes and attributes. */
export const copyRootAttribute = "data-copy-root"

/**
 * Prepared CSS with the root's children (`html > body`, which became `:host > [data-canvas-body]`) found through the
 * element around a copy's body, which adds nothing to their specificity.
 */
export function throughCopyRoot(css: string): string {
  return css.replaceAll(
    new RegExp(String.raw`(:host(?:\([^()]*\))?)\s*>\s*(?=\[${bodyAttribute}\])`, "g"),
    `$1 > :where([${copyRootAttribute}]) > `
  )
}

function addGlobals(key: string, css: string): void {
  if (!css.trim() || copyGlobals.texts.has(key)) {
    return
  }

  copyGlobals.texts.set(key, css)

  if (!copyGlobals.sheet) {
    copyGlobals.sheet = new CSSStyleSheet()
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, copyGlobals.sheet]
  }

  copyGlobals.sheet.replaceSync([...copyGlobals.texts.values()].join("\n"))
}

/** Forgets every sheet's text and prepared sheet, as when the window starts again. */
export function clearCopySheets(): void {
  sheetTexts.clear()
  preparedSheets.clear()
}
