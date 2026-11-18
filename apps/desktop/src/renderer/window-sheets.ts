/**
 * Constructed stylesheets in a lens's own window (lens-layout.md, "Today's canvas in a lens's own window"). A
 * `CSSStyleSheet` the main window makes can only be adopted in its own document, so a frame's shadow root, an icon's, or
 * the document itself in a lens window, takes a copy made in that window's document instead, kept in step with the
 * original as it changes. Code goes on adopting the main window's sheets and reading them back, wherever it draws.
 *
 * `followSheetsIntoWindows` sets this up once, before anything adopts a sheet; `readopt` gives what moved between
 * windows its sheets again, since a shadow root moved to another document loses the ones that document didn't make.
 */

type Adopting = DocumentOrShadowRoot & Node

/** What each document or shadow root was given, as code gave it: the main window's sheets. */
const given = new WeakMap<Adopting, readonly CSSStyleSheet[]>()

/** Each sheet's copy in each lens window's document. */
const copies = new WeakMap<CSSStyleSheet, Map<Document, CSSStyleSheet>>()

/** What each copy is a copy of. */
const originals = new WeakMap<CSSStyleSheet, CSSStyleSheet>()

/** The lens windows' documents, which take the main document's own sheets too. */
const lensDocuments = new Set<Document>()

let native: { root: PropertyDescriptor; document: PropertyDescriptor } | undefined

/** Sets up the copies. Done once for the page's whole life, so it's never undone. */
export function followSheetsIntoWindows(): void {
  if (native) {
    return
  }

  const root = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, "adoptedStyleSheets")
  const page = Object.getOwnPropertyDescriptor(Document.prototype, "adoptedStyleSheets")

  if (!root?.get || !root.set || !page?.get || !page.set) {
    return
  }

  native = { root, document: page }
  const nativeRoot = root
  const nativePage = page

  Object.defineProperty(ShadowRoot.prototype, "adoptedStyleSheets", {
    configurable: true,
    enumerable: root.enumerable ?? true,
    get(this: ShadowRoot) {
      return given.get(this) ?? nativeRoot.get?.call(this)
    },
    set(this: ShadowRoot, sheets: readonly CSSStyleSheet[]) {
      given.set(this, [...sheets])
      nativeRoot.set?.call(
        this,
        sheets.map((sheet) => sheetIn(sheet, this.ownerDocument))
      )
    }
  })

  Object.defineProperty(Document.prototype, "adoptedStyleSheets", {
    configurable: true,
    enumerable: page.enumerable ?? true,
    get(this: Document) {
      return given.get(this) ?? nativePage.get?.call(this)
    },
    set(this: Document, sheets: readonly CSSStyleSheet[]) {
      given.set(this, [...sheets])
      nativePage.set?.call(
        this,
        sheets.map((sheet) => sheetIn(sheet, this))
      )

      // The main document's own sheets, such as a project's fonts and registered properties, are each lens window's too.
      if (this === document) {
        for (const each of lensDocuments) {
          nativePage.set?.call(
            each,
            sheets.map((sheet) => sheetIn(sheet, each))
          )
        }
      }
    }
  })

  followEdits()
}

/** Notes a lens window's document, which takes the main document's own sheets until the function returned is called. */
export function addLensDocument(page: Document): () => void {
  lensDocuments.add(page)
  native?.document.set?.call(
    page,
    (given.get(document) ?? []).map((sheet) => sheetIn(sheet, page))
  )

  return () => {
    lensDocuments.delete(page)
  }
}

/**
 * Gives each shadow root in `subtree`, and in the shadow roots inside it, the sheets it was given again, made in the
 * document it's in now. For what has just moved between windows.
 */
export function readopt(subtree: Node): void {
  if (!native) {
    return
  }

  const roots: ShadowRoot[] = []

  const visit = (node: Node) => {
    const elements = isParent(node) ? node.querySelectorAll("*") : []
    const all = isElement(node) ? [node, ...elements] : [...elements]

    for (const element of all) {
      const shadow = element.shadowRoot

      if (shadow) {
        roots.push(shadow)
        visit(shadow)
      }
    }
  }

  visit(subtree)

  for (const shadow of roots) {
    const sheets = given.get(shadow)

    if (sheets) {
      native.root.set?.call(
        shadow,
        sheets.map((sheet) => sheetIn(sheet, shadow.ownerDocument))
      )
    }
  }
}

function isParent(node: Node): node is Node & ParentNode {
  return "querySelectorAll" in node
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1
}

/** A sheet as `page` can adopt it: the main window's own, or its copy in a lens window's document. */
function sheetIn(sheet: CSSStyleSheet, page: Document): CSSStyleSheet {
  const original = originals.get(sheet) ?? sheet

  if (page === document) {
    return original
  }

  let byDocument = copies.get(original)

  if (!byDocument) {
    byDocument = new Map()
    copies.set(original, byDocument)
  }

  let copy = byDocument.get(page)

  if (!copy) {
    const View = page.defaultView?.CSSStyleSheet

    if (!View) {
      return original
    }

    copy = new View()
    copy.replaceSync(textOf(original))
    originals.set(copy, original)
    byDocument.set(page, copy)
  }

  return copy
}

function textOf(sheet: CSSStyleSheet): string {
  return Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n")
}

/**
 * Brings a sheet's copies in lens windows up to date with it, dropping those whose windows have closed. Edits through the
 * sheet's own methods reach them by themselves; one made to a rule's declarations, as `rule.style.setProperty`, is told
 * here.
 */
export function copyEdits(sheet: CSSStyleSheet): void {
  const byDocument = copies.get(sheet)

  if (!byDocument) {
    return
  }

  const text = textOf(sheet)

  for (const [page, copy] of byDocument) {
    if (page.defaultView) {
      copy.replaceSync(text)
    } else {
      byDocument.delete(page)
    }
  }
}

/** Has each change to a main window sheet reach its copies. */
function followEdits(): void {
  const prototype = CSSStyleSheet.prototype
  // The methods as they are now, called with each sheet as `this`; `frame.ts` may wrap them again later.
  const original = Object.getOwnPropertyDescriptors(prototype)
  const insertRule = original.insertRule.value!
  const deleteRule = original.deleteRule.value!
  const replace = original.replace.value!
  const replaceSync = original.replaceSync.value!

  prototype.insertRule = function (rule, index) {
    const at = insertRule.call(this, rule, index)
    copyEdits(this)

    return at
  }

  prototype.deleteRule = function (index) {
    deleteRule.call(this, index)
    copyEdits(this)
  }

  prototype.replaceSync = function (text) {
    replaceSync.call(this, text)
    copyEdits(this)
  }

  prototype.replace = async function (text) {
    const sheet = await replace.call(this, text)
    copyEdits(this)

    return sheet
  }
}
