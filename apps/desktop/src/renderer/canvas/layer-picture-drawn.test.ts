import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// A picture's copies are styled by the frame's stylesheets, which only a browser applies, so this draws one in Chrome. It
// needs Chrome installed. The card is drawn by the frame's own rules, written against its node as a frame writes them
// (`nodeSelector`), with nothing inline: a picture that dropped the attribute those rules match would carry it bare.
let browser: Browser
let page: Page

const entry = `export { layerPicture } from "./layer-picture.ts"`

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "pictures",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  await page.setContent(
    `<body style="margin: 0"><div id="host" data-frame style="width: 600px; height: 400px"></div></body>`
  )
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>("#host")!.attachShadow({ mode: "open" })
    const rules = new CSSStyleSheet()
    rules.replaceSync(`
      [data-canvas-node="card"] { position: absolute; left: 40px; top: 60px; width: 200px; height: 120px;
        background: rgb(0, 128, 0); border: 3px solid rgb(0, 0, 255) }
      [data-canvas-node="card"] > [data-canvas-node="title"] { color: rgb(255, 0, 0) }
      [data-canvas-node="badge"] { position: absolute; left: 300px; top: 200px; width: 80px; height: 40px;
        background: rgb(255, 165, 0); scale: 1.5; rotate: 30deg; translate: 10px 6px; transition: scale 1s, rotate 1s }
      [data-canvas-node="tilted"] { position: absolute; left: 60px; top: 260px; width: 300px; height: 120px;
        scale: 1.6; rotate: -12deg }
      [data-canvas-node="tilted"] > [data-canvas-node="loose"] { margin: 8px 0 0 50px; width: 80px; height: 30px }
      [data-canvas-node="chip"] { position: relative; width: 140px; height: 50px; margin: 20px 0 0 30px;
        border: 2px solid rgb(0, 0, 0); background: rgb(200, 220, 255); font: 14px/20px sans-serif }
      [data-canvas-node="padded"] { padding: 10% 5%; background: rgb(240, 240, 200) }
      [data-canvas-node="padded"] > .inner { display: block; height: 10px }
      .panel { container-type: inline-size; width: 240px }
      .panel .label { background: rgb(10, 20, 30); border-left: 4px solid rgb(40, 50, 60) }
      .lead + .label { padding-left: 12px }
      .panel .label::before { content: "#"; color: rgb(70, 80, 90) }
      @container (min-width: 200px) { .label > .note { color: rgb(100, 110, 120) } }`)
    frame.adoptedStyleSheets = [rules]
    frame.innerHTML = `<div data-canvas-body><div data-canvas-node="card"><p data-canvas-node="title">Plans</p></div>
      <div data-canvas-node="badge"></div>
      <div data-canvas-node="tilted"><div data-canvas-node="chip"><span class="mark" style="position: absolute;
        left: 100px; top: 30px; width: 4px; height: 4px"></span>Chip</div><div data-canvas-node="loose"><span
        class="pinned" style="position: absolute; left: 4px; top: 6px; width: 4px; height: 4px"></span></div></div>
      <div style="position: absolute; left: 380px; top: 20px; width: 200px">
        <div data-canvas-node="padded"><span class="inner"></span></div></div>
      <div class="panel" style="position: absolute; left: 380px; top: 200px">
        <span class="lead">Lead</span><div class="label" data-canvas-node="label"><span class="note">Note</span></div>
      </div>
      <div style="opacity: 0.8; filter: url(#missing)"><div style="filter: brightness(0.5)">
        <div style="opacity: 0.5; filter: grayscale(1)"><div data-canvas-node="dimmed" style="width: 40px; height: 40px;
          background: rgb(255, 0, 0)"></div></div></div></div>
      <div data-canvas-node="field" style="position: absolute; left: 420px; top: 320px; width: 90px; height: 30px;
        background: rgb(0, 0, 0)"></div><span data-canvas-node="field" style="display: none"></span>
      <input data-canvas-node="field" style="position: absolute; left: 0; top: 0; width: 1px; height: 1px;
        clip: rect(0 0 0 0)">
      <div style="position: absolute; left: 100px; top: 20px; width: 220px; height: 60px">
        <div data-canvas-node="static" style="margin-left: 40px; width: 120px; height: 40px; border: 2px solid">
          <span class="pinned" style="position: absolute; left: 10px; top: 5px; width: 6px; height: 6px"></span>
          <span class="fixed" style="position: fixed; left: 30px; top: 12px; width: 6px; height: 6px"></span>
        </div></div></div>`
  })
})

afterAll(async () => {
  await browser?.close()
})

describe("a picture of a layer the frame's rules draw", () => {
  let drawn: { background: string; border: string; title: string; layers: number; found: number }

  beforeAll(async () => {
    drawn = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const card = host.shadowRoot!.querySelector('[data-canvas-node="card"]')!

      // SAFETY: the bundle's global is layer-picture.ts's exports, whose layerPicture returns this.
      // @ts-expect-error The bundle's global.
      const picture = pictures.layerPicture(host, [card], 1, card.getBoundingClientRect()) as HTMLElement
      document.body.append(picture)

      // The card's copy is the first thing the body's stand-in holds, in the layer's place.
      const copied = picture.querySelector("div")!.shadowRoot!.querySelector("[data-canvas-body] > * > *")!
      const copy = getComputedStyle(copied)
      const title = getComputedStyle(copied.firstElementChild!)

      return {
        background: copy.backgroundColor,
        border: copy.borderTopColor,
        title: title.color,
        // What the canvas finds layers by: the frames' shadow roots, never the page itself.
        layers: [...document.querySelectorAll("[data-frame]")].flatMap((frame) => [
          ...frame.shadowRoot!.querySelectorAll("[data-canvas-node]")
        ]).length,
        found: document.querySelectorAll("[data-canvas-node]").length
      }
    })
  })

  it("draws the copy as the frame's rules draw the layer", () => {
    expect(drawn.background).toBe("rgb(0, 128, 0)")
    expect(drawn.border).toBe("rgb(0, 0, 255)")
  })

  it("draws what's inside it by the rules about its parent too", () => {
    expect(drawn.title).toBe("rgb(255, 0, 0)")
  })

  it("adds no layers where the canvas looks for them", () => {
    expect(drawn.layers).toBe(13)
    expect(drawn.found).toBe(0)
  })
})

describe("a picture of a layer scaled, turned and moved by its own transforms", () => {
  let drawn: { layer: Box; copy: Box; picture: Box; animating: number; after: Box }

  beforeAll(async () => {
    drawn = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const badge = host.shadowRoot!.querySelector<HTMLElement>('[data-canvas-node="badge"]')!
      const box = ({ left, top, width, height }: DOMRect) => ({ left, top, width, height })
      const layer = box(badge.getBoundingClientRect())

      // SAFETY: as above.
      // @ts-expect-error The bundle's global.
      const picture = pictures.layerPicture(host, [badge], 1, badge.getBoundingClientRect()) as HTMLElement
      document.body.append(picture)
      const copied = picture.querySelector("div")!.shadowRoot!.querySelector("[data-canvas-body] > * > *")!

      return {
        layer,
        copy: box(copied.getBoundingClientRect()),
        picture: box(picture.getBoundingClientRect()),
        // Measuring it without its transforms doesn't set off its own transition.
        animating: badge.getAnimations().length,
        after: box(badge.getBoundingClientRect())
      }
    })
  })

  it("draws the copy just as the layer is drawn, transformed once", () => {
    // The picture is the layer's box on screen, so the copy fills it from its top-left.
    expect(drawn.copy.left - drawn.picture.left).toBeCloseTo(0, 1)
    expect(drawn.copy.top - drawn.picture.top).toBeCloseTo(0, 1)
    expect(drawn.copy.width).toBeCloseTo(drawn.layer.width, 1)
    expect(drawn.copy.height).toBeCloseTo(drawn.layer.height, 1)
  })

  it("leaves the layer as it was drawn, with nothing animating", () => {
    expect(drawn.animating).toBe(0)
    expect(drawn.after).toEqual(drawn.layer)
  })
})

describe("a picture of a layer inside something scaled and turned", () => {
  let drawn: { layer: Box; copy: Box; mark: Box; copyMark: Box; union: Box; picture: Box }

  beforeAll(async () => {
    drawn = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const chip = host.shadowRoot!.querySelector<HTMLElement>('[data-canvas-node="chip"]')!
      const box = ({ left, top, width, height }: DOMRect) => ({ left, top, width, height })

      // SAFETY: as above.
      // @ts-expect-error The bundle's global.
      const picture = pictures.layerPicture(host, [chip], 1, chip.getBoundingClientRect()) as HTMLElement
      document.body.append(picture)
      const copied = picture.querySelector("div")!.shadowRoot!.querySelector("[data-canvas-body] > * > *")!

      return {
        layer: box(chip.getBoundingClientRect()),
        copy: box(copied.getBoundingClientRect()),
        mark: box(chip.querySelector(".mark")!.getBoundingClientRect()),
        copyMark: box(copied.querySelector(".mark")!.getBoundingClientRect()),
        union: box(chip.getBoundingClientRect()),
        picture: box(picture.getBoundingClientRect())
      }
    })
  })

  it("draws the copy as big as the layer is drawn, turned as it is", () => {
    expect(drawn.copy.width).toBeCloseTo(drawn.layer.width, 1)
    expect(drawn.copy.height).toBeCloseTo(drawn.layer.height, 1)
    expect(drawn.copy.left - drawn.picture.left).toBeCloseTo(drawn.layer.left - drawn.union.left, 1)
    expect(drawn.copy.top - drawn.picture.top).toBeCloseTo(drawn.layer.top - drawn.union.top, 1)
  })

  it("puts what's inside it where it is in the layer, so a turn isn't lost", () => {
    expect(drawn.copyMark.left - drawn.picture.left).toBeCloseTo(drawn.mark.left - drawn.union.left, 1)
    expect(drawn.copyMark.top - drawn.picture.top).toBeCloseTo(drawn.mark.top - drawn.union.top, 1)
    expect(drawn.copyMark.width).toBeCloseTo(drawn.mark.width, 1)
  })
})

describe("a picture of a layer padded by a share of what it's laid out in", () => {
  let drawn: { layer: Box; inner: Box; copy: Box; copyInner: Box }

  beforeAll(async () => {
    drawn = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const padded = host.shadowRoot!.querySelector<HTMLElement>('[data-canvas-node="padded"]')!
      const box = ({ left, top, width, height }: DOMRect) => ({ left, top, width, height })

      // SAFETY: as above.
      // @ts-expect-error The bundle's global.
      const picture = pictures.layerPicture(host, [padded], 1, padded.getBoundingClientRect()) as HTMLElement
      document.body.append(picture)
      const copied = picture.querySelector("div")!.shadowRoot!.querySelector("[data-canvas-body] > * > *")!

      return {
        layer: box(padded.getBoundingClientRect()),
        inner: box(padded.querySelector(".inner")!.getBoundingClientRect()),
        copy: box(copied.getBoundingClientRect()),
        copyInner: box(copied.querySelector(".inner")!.getBoundingClientRect())
      }
    })
  })

  it("keeps the padding, so what's inside the copy is where it is in the layer", () => {
    // 10% and 5% of the 200px it's laid out in.
    expect(drawn.inner.left - drawn.layer.left).toBeCloseTo(10, 1)
    expect(drawn.inner.top - drawn.layer.top).toBeCloseTo(20, 1)
    expect(drawn.copyInner.left - drawn.copy.left).toBeCloseTo(drawn.inner.left - drawn.layer.left, 1)
    expect(drawn.copyInner.top - drawn.copy.top).toBeCloseTo(drawn.inner.top - drawn.layer.top, 1)
    expect(drawn.copyInner.width).toBeCloseTo(drawn.inner.width, 1)
  })
})

describe("a picture of a layer drawn by rules about what it's in", () => {
  let drawn: {
    layer: Look
    copy: Look
    hit: boolean
  }

  beforeAll(async () => {
    drawn = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const label = host.shadowRoot!.querySelector<HTMLElement>('[data-canvas-node="label"]')!

      const look = (element: Element) => {
        const style = getComputedStyle(element)
        const before = getComputedStyle(element, "::before")

        return {
          background: style.backgroundColor,
          border: style.borderLeftColor,
          padding: style.paddingLeft,
          before: `${before.content} ${before.color}`,
          note: getComputedStyle(element.querySelector(".note")!).color
        }
      }

      // SAFETY: as above.
      // @ts-expect-error The bundle's global.
      const picture = pictures.layerPicture(host, [label], 1, label.getBoundingClientRect()) as HTMLElement
      document.body.append(picture)
      const copied = picture.querySelector("div")!.shadowRoot!.querySelector("[data-canvas-body] > * > *")!
      const box = copied.getBoundingClientRect()
      const under = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)

      // A copy that's hit is found as the stage its shadow root is in.
      const stage = picture.querySelector("div")!

      return { layer: look(label), copy: look(copied), hit: Boolean(under && stage.contains(under)) }
    })
  })

  it("keeps how what it's in, what's beside it and its container draw it", () => {
    expect(drawn.layer.background).toBe("rgb(10, 20, 30)")
    expect(drawn.layer.padding).toBe("12px")
    expect(drawn.layer.note).toBe("rgb(100, 110, 120)")
    expect(drawn.copy).toEqual(drawn.layer)
  })

  it("keeps its ::before", () => {
    expect(drawn.copy.before).toBe('"#" rgb(70, 80, 90)')
  })

  it("is never hit", () => {
    expect(drawn.hit).toBe(false)
  })
})

describe("a picture of a layer in something dimmed and filtered", () => {
  let blended: { opacity: string; filter: string }

  beforeAll(async () => {
    blended = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const dimmed = host.shadowRoot!.querySelector('[data-canvas-node="dimmed"]')!

      // SAFETY: as above.
      // @ts-expect-error The bundle's global.
      const picture = pictures.layerPicture(host, [dimmed], 1, dimmed.getBoundingClientRect()) as HTMLElement
      document.body.append(picture)
      const copied = picture.querySelector("div")!.shadowRoot!.querySelector("[data-canvas-body] > * > *")!
      const holder = getComputedStyle(copied.parentElement!)

      return { opacity: holder.opacity, filter: holder.filter }
    })
  })

  it("is as faint as everything it's in makes it", () => {
    expect(Number(blended.opacity)).toBeCloseTo(0.4, 5)
  })

  it("is filtered by what it's in, the nearest first, but for a filter the picture can't draw", () => {
    expect(blended.filter).toBe("grayscale(1) brightness(0.5)")
  })
})

describe("a picture of a component that draws a hidden input and a part not displayed beside what's seen", () => {
  let drawn: { seen: Box; copy: Box; picture: Box }

  beforeAll(async () => {
    drawn = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const parts = [...host.shadowRoot!.querySelectorAll('[data-canvas-node="field"]')]
      const box = ({ left, top, width, height }: DOMRect) => ({ left, top, width, height })
      // As the drag measures it (`nodeBox`): what's seen, leaving out what's empty or clipped to nothing.
      const seen = parts[0]!.getBoundingClientRect()

      // SAFETY: as above.
      // @ts-expect-error The bundle's global.
      const picture = pictures.layerPicture(host, parts, 1, seen) as HTMLElement
      document.body.append(picture)
      const copied = picture.querySelector("div")!.shadowRoot!.querySelector("[data-canvas-body] > * > *")!

      return {
        seen: box(seen),
        copy: box(copied.getBoundingClientRect()),
        picture: box(picture.getBoundingClientRect())
      }
    })
  })

  it("is the box of what's seen, which is drawn from its top-left, where the drag holds it", () => {
    expect(drawn.picture.width).toBeCloseTo(drawn.seen.width, 1)
    expect(drawn.picture.height).toBeCloseTo(drawn.seen.height, 1)
    expect(drawn.copy.left - drawn.picture.left).toBeCloseTo(0, 1)
    expect(drawn.copy.top - drawn.picture.top).toBeCloseTo(0, 1)
  })
})

describe("a picture of a layer that isn't positioned, with parts placed against what it's in", () => {
  /** Where the parts of the layer `node` are drawn, and of its copy, each from its own layer's box. */
  async function placed(node: string) {
    return page.evaluate((node) => {
      const host = document.querySelector<HTMLElement>("#host")!
      const layer = host.shadowRoot!.querySelector(`[data-canvas-node="${node}"]`)!
      const union = layer.getBoundingClientRect()

      // SAFETY: as above.
      // @ts-expect-error The bundle's global.
      const picture = pictures.layerPicture(host, [layer], 1, union) as HTMLElement
      document.body.append(picture)
      const copied = picture.querySelector("div")!.shadowRoot!.querySelector("[data-canvas-body] > * > *")!
      const frame = picture.getBoundingClientRect()

      const from = (element: Element, { left, top }: DOMRect) => {
        const box = element.getBoundingClientRect()

        return { x: box.left - left, y: box.top - top }
      }

      return [".pinned", ".fixed"].flatMap((selector) => {
        const part = layer.querySelector(selector)

        return part ? [{ layer: from(part, union), copy: from(copied.querySelector(selector)!, frame) }] : []
      })
    }, node)
  }

  it("keeps a part placed absolutely, and one fixed, where they're drawn", async () => {
    for (const { layer, copy } of await placed("static")) {
      expect(copy.x).toBeCloseTo(layer.x, 1)
      expect(copy.y).toBeCloseTo(layer.y, 1)
    }
  })

  it("keeps them there in something scaled and turned", async () => {
    for (const { layer, copy } of await placed("loose")) {
      expect(copy.x).toBeCloseTo(layer.x, 1)
      expect(copy.y).toBeCloseTo(layer.y, 1)
    }
  })
})

/** How a part of a layer is drawn, for comparing a copy with it. */
interface Look {
  background: string
  border: string
  padding: string
  before: string
  note: string
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}
