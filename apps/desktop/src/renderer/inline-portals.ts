import { frameBody } from "./frame-host.ts"

/**
 * Content a component portals out of its frame, as a dialog, a popover's popup or a menu do into `document.body`, drawn
 * inside the frame instead, in the flow after what's there, for a component preview (PAR-517). Out in the page it's
 * outside the frame's shadow root, so it has none of the project's styles, and outside the box the preview is cropped
 * to, so the picture showed only the trigger, or nothing for a part drawn without one.
 */

/** Marks what's been moved in, and what in it was placed over the page and is now in the flow or left out. */
const portalAttribute = "data-parity-portal"
const placedAttribute = "data-parity-placed"

let sheet: CSSStyleSheet | undefined

/**
 * What's moved in is drawn as it rests, with no transitions or animations, so it isn't caught partway through opening.
 * What was placed over the page (fixed or absolute, by its own styles or by a positioning library's inline ones) is put
 * in the flow where it is, shown, and as tall as what's in it, with no limit from the room it had where it was placed
 * (Base UI's `--available-height`, which a menu scrolls within); what holds nothing there (a backdrop, a focus guard)
 * is left out.
 */
export function inlinePortalSheet(): CSSStyleSheet {
  if (sheet) {
    return sheet
  }

  sheet = new CSSStyleSheet()
  sheet.replaceSync(`@layer canvas-inline-portals {
  [${portalAttribute}], [${portalAttribute}] * { transition: none !important; animation: none !important; }
  [${placedAttribute}="flow"] {
    position: relative !important;
    inset: auto !important;
    transform: none !important;
    translate: none !important;
    margin: 0 !important;
    height: auto !important;
    max-height: none !important;
    --available-height: none !important;
    --available-width: none !important;
    opacity: 1 !important;
    visibility: visible !important;
  }
  [${placedAttribute}="out"] { display: none !important; }
}`)

  return sheet
}

/** What the guest marks content with when it takes it from the page's body into the frame's (PAR-881). */
const framePortalAttribute = "data-canvas-portal"

/**
 * Moves what's been portaled since the frame was drawn into `into`, after what's in it, and puts what in it was placed
 * over the page in the flow: what was added to the page's body (anything but `host`), and what the guest took from it
 * into the frame's body. Gives back a function that puts each back where it was, where the library that made it
 * expects to remove it from.
 */
export function inlinePortals(host: Element, into: Element): () => void {
  const added = addedToPage(host)

  const taken = [...(frameBody(host)?.children ?? [])].filter((element) => element.hasAttribute(framePortalAttribute))

  const moved = [...taken, ...added].map((element) => ({ element, parent: element.parentElement }))

  for (const { element } of moved) {
    element.setAttribute(portalAttribute, "")
    into.append(element)
  }

  for (const { element } of moved) {
    placeInFlow(element)
  }

  return () => {
    for (const { element, parent } of moved) {
      const back = parent ?? document.body
      element.removeAttribute(portalAttribute)
      back.append(element)
    }
  }
}

/** What's been added to the page's body besides the frame's host, other than scripts and styles. */
function addedToPage(host: Element): Element[] {
  return [...document.body.children].filter(
    (element) => element !== host && !["SCRIPT", "STYLE", "LINK", "TEMPLATE"].includes(element.tagName)
  )
}

/**
 * What the frame's components drew in the page's body, outside the frame, where the project's styles don't reach and
 * the frame's screenshots don't show it (PAR-881), each described in a few words, as `<div class="toast"> "Saved"`.
 * The guest takes what React portals there into the frame, so this is what a library added to the body itself. What
 * holds nothing to see, as an empty live region, isn't counted.
 */
export function contentOutside(host: Element): string[] {
  return addedToPage(host)
    .filter((element) => drawsSomething(element))
    .map(describe)
}

function describe(element: Element): string {
  const name = element.tagName.toLowerCase()
  const className = element.classList[0]
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim()
  const shown = text.length > 40 ? `${text.slice(0, 39)}…` : text
  const tag = className ? `<${name} class="${className}">` : `<${name}>`

  return shown ? `${tag} "${shown}"` : tag
}

/**
 * Each element placed over the page, outermost first, now in the frame: in the flow if it holds something, else left
 * out with what's inside it. One inside another put in the flow, as a popup in its positioner, is put in it too.
 */
function placeInFlow(root: Element): void {
  const walk = (element: Element) => {
    const { position } = getComputedStyle(element)

    if (position === "fixed" || position === "absolute") {
      element.setAttribute(placedAttribute, drawsSomething(element) ? "flow" : "out")

      if (element.getAttribute(placedAttribute) === "out") {
        return
      }
    }

    for (const child of element.children) {
      walk(child)
    }
  }

  walk(root)
}

/**
 * Whether an element placed over the page holds anything: other elements (a popup in its positioner, even one with
 * nothing in it yet), text, or an image, icon or field. A backdrop, a focus guard or an empty toast region doesn't.
 */
function drawsSomething(element: Element): boolean {
  return element.children.length > 0 || (element.textContent ?? "").trim() !== "" || element.matches(drawn)
}

const drawn = "img, svg, video, canvas, picture, input, textarea, select, iframe"
