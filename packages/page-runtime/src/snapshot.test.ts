// @vitest-environment happy-dom
import { createChannel, domPort } from "@parity-app/channel"
import { parsePageSnapshot } from "@parity-app/frames"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { frameName, type PageMethods, type ParityMethods, pageProtocol, snapshotDeadline } from "./protocol.ts"
import { startPageRuntime } from "./runtime.ts"
import { absoluteCss, hashText, sheetsById, takeSnapshot } from "./snapshot.ts"

const parent = "parity://app"
const desktop = { width: 1280, height: 800 }
const landed = { path: "/pricing", search: "", hash: "", outcome: "landed" } as const
const plain = { classes: [], attributes: {} }

let stop: (() => void) | undefined

beforeEach(() => {
  Reflect.deleteProperty(window, "parityFrame")
  document.documentElement.className = ""
  document.documentElement.removeAttribute("style")
  document.documentElement.removeAttribute("data-theme")
  document.head.innerHTML = ""
  document.body.innerHTML = ""
  window.history.replaceState(null, "", "/pricing")
})

afterEach(() => {
  stop?.()
  stop = undefined
  window.name = ""
  Reflect.deleteProperty(window, "parent")
})

describe("takeSnapshot", () => {
  it("copies the body's tree as plain data, leaving out scripts and styles, which the schema reads", async () => {
    document.body.setAttribute("class", "antialiased")
    document.body.innerHTML = `<main id="top"><h1>Pricing</h1><script>alert(1)</script><style>p{}</style><!-- note --><p>Plans</p></main>`

    const snapshot = await takeSnapshot(window, { mode: plain, viewport: desktop, location: landed, sheets: new Map() })

    expect(snapshot.body).toEqual({
      tag: "body",
      attributes: [["class", "antialiased"]],
      children: [
        {
          tag: "main",
          attributes: [["id", "top"]],
          children: [
            { tag: "h1", attributes: [], children: ["Pricing"] },
            { tag: "p", attributes: [], children: ["Plans"] }
          ]
        }
      ]
    })
    expect(snapshot.location).toEqual(landed)
    expect(snapshot.viewport).toEqual(desktop)
    expect(parsePageSnapshot(snapshot)).toEqual(snapshot)
  })

  it("makes every URL absolute against the page's address", async () => {
    document.body.innerHTML = `<a href="/plans">Plans</a><a href="#faq">FAQ</a><img src="logo.png" srcset="a.png 1x, /b.png 2x, data:image/png;base64,AAAA 3x"><div style="background: url(bg.png)"></div>`

    const { body } = await takeSnapshot(window, { mode: plain, viewport: desktop, location: landed, sheets: new Map() })
    const origin = window.location.origin

    expect(body.children.map((child) => (child instanceof Object ? child.attributes : child))).toEqual([
      [["href", `${origin}/plans`]],
      [["href", "#faq"]],
      [
        ["src", `${origin}/logo.png`],
        ["srcset", `${origin}/a.png 1x, ${origin}/b.png 2x, data:image/png;base64,AAAA 3x`]
      ],
      [["style", `background: url("${origin}/bg.png")`]]
    ])
  })

  it("keeps svg's namespace and its tags' case", async () => {
    document.body.innerHTML = `<svg viewBox="0 0 1 1"><linearGradient id="g"></linearGradient></svg>`

    const { body } = await takeSnapshot(window, { mode: plain, viewport: desktop, location: landed, sheets: new Map() })

    expect(body.children[0]).toMatchObject({
      tag: "svg",
      namespace: "svg",
      children: [{ tag: "linearGradient", namespace: "svg" }]
    })
  })

  it("writes a form's state in as attributes, never a password", async () => {
    document.body.innerHTML = `<input id="name"><input id="secret" type="password"><input id="agree" type="checkbox"><select><option>A</option><option id="b">B</option></select><textarea></textarea>`
    document.querySelector<HTMLInputElement>("#name")!.value = "Ada"
    document.querySelector<HTMLInputElement>("#secret")!.value = "hunter2"
    document.querySelector<HTMLInputElement>("#agree")!.checked = true
    document.querySelector<HTMLOptionElement>("#b")!.selected = true
    document.querySelector("textarea")!.value = "Hello"

    const { body } = await takeSnapshot(window, { mode: plain, viewport: desktop, location: landed, sheets: new Map() })
    const [name, secret, agree, select, area] = body.children

    expect(name).toMatchObject({
      attributes: [
        ["id", "name"],
        ["value", "Ada"]
      ]
    })
    expect(JSON.stringify(secret)).not.toContain("hunter2")
    expect(agree).toMatchObject({ attributes: expect.arrayContaining([["checked", ""]]) })
    expect(select).toMatchObject({
      children: [
        { attributes: [] },
        {
          attributes: [
            ["id", "b"],
            ["selected", ""]
          ]
        }
      ]
    })
    expect(area).toMatchObject({ tag: "textarea", children: ["Hello"] })
  })

  it("takes `<html>`'s classes and attributes without the mode's, or the runtime's style, its url()s absolute", async () => {
    const root = document.documentElement
    root.className = "font-sans dark"
    root.setAttribute("data-theme", "dark")
    root.setAttribute("lang", "en")
    root.style.setProperty("--brand", "red")
    root.style.setProperty("--hero", "url(/hero.png)")
    root.style.setProperty("scrollbar-width", "none")
    const mode = { classes: ["dark"], attributes: { "data-theme": "dark" } }

    const { root: taken } = await takeSnapshot(window, { mode, viewport: desktop, location: landed, sheets: new Map() })

    expect(taken).toEqual({
      classes: ["font-sans"],
      attributes: [["lang", "en"]],
      style: `--brand: red; --hero: url("${window.location.origin}/hero.png")`
    })
  })

  it("lists the page's sheets by content hash, keeping their text for sheets.get", async () => {
    document.head.innerHTML = `<style>h1 { color: red; }</style><style>.hero { background: url(/hero.png); }</style>`
    const sheets = new Map<string, string>()

    const snapshot = await takeSnapshot(window, { mode: plain, viewport: desktop, location: landed, sheets })

    expect(snapshot.sheets).toHaveLength(2)
    const ids = snapshot.sheets.map((entry) => ("hash" in entry ? entry.hash : ""))
    const [first, second] = sheetsById(sheets, ids)
    expect(first?.text).toContain("h1")
    expect(second?.text).toContain(`url("${window.location.origin}/hero.png")`)
    expect(first?.id).toBe(hashText(first!.text))
    expect(sheetsById(sheets, ["never"])).toEqual([])
  })

  it("lists a sheet it can't read by its address, with the media it's linked for", async () => {
    const unreadable = (href: string, media: string) =>
      Object.defineProperty({ href, disabled: false, media: { mediaText: media } }, "cssRules", {
        get: () => {
          throw new DOMException("Cross-origin", "SecurityError")
        }
      })

    Object.defineProperty(document, "styleSheets", {
      configurable: true,
      value: [unreadable("https://cdn.test/print.css", "print"), unreadable("https://cdn.test/all.css", "all")]
    })

    try {
      const { sheets } = await takeSnapshot(window, {
        mode: plain,
        viewport: desktop,
        location: landed,
        sheets: new Map()
      })

      expect(sheets).toEqual([
        { href: "https://cdn.test/print.css", conditions: ["@media print"] },
        { href: "https://cdn.test/all.css" }
      ])
    } finally {
      Reflect.deleteProperty(document, "styleSheets")
    }
  })

  it("keeps an anonymous imported layer one named layer, inside its supports condition", async () => {
    const unreadable = {
      href: "https://cdn.test/more.css",
      get cssRules(): never {
        throw new DOMException("Cross-origin", "SecurityError")
      }
    }

    const theme = {
      href: "http://localhost/theme.css",
      media: { mediaText: "" },
      cssRules: [
        { cssText: ".notice { color: red }" },
        { href: "https://cdn.test/more.css", styleSheet: unreadable, media: { mediaText: "" }, layerName: null },
        { cssText: "div { color: blue }" }
      ]
    }

    const page = {
      href: null,
      disabled: false,
      media: { mediaText: "" },
      cssRules: [
        {
          href: "theme.css",
          styleSheet: theme,
          media: { mediaText: "" },
          layerName: "",
          supportsText: "display: grid"
        }
      ]
    }

    Object.defineProperty(document, "styleSheets", { configurable: true, value: [page] })

    try {
      const kept = new Map<string, string>()
      const { sheets } = await takeSnapshot(window, { mode: plain, viewport: desktop, location: landed, sheets: kept })
      const texts = sheets.map((entry) => ("hash" in entry ? kept.get(entry.hash) : entry))
      const inside = ["@layer parity-anonymous-1", "@supports (display: grid)"]

      expect(texts).toEqual([
        "@layer parity-anonymous-1 {\n@supports (display: grid) {\n.notice { color: red }\n}\n}",
        { href: "https://cdn.test/more.css", conditions: inside },
        "@layer parity-anonymous-1 {\n@supports (display: grid) {\ndiv { color: blue }\n}\n}"
      ])
    } finally {
      Reflect.deleteProperty(document, "styleSheets")
    }
  })

  it("keeps an unreadable import where it stands, inside every condition around it", async () => {
    const unreadable = {
      href: "https://cdn.test/theme.css",
      get cssRules(): never {
        throw new DOMException("Cross-origin", "SecurityError")
      }
    }

    const reset = {
      href: "http://localhost/reset.css",
      media: { mediaText: "" },
      cssRules: [{ cssText: "* { margin: 0 }" }]
    }

    const page = {
      href: null,
      disabled: false,
      media: { mediaText: "print" },
      cssRules: [
        { href: "reset.css", styleSheet: reset, media: { mediaText: "" }, layerName: null },
        { href: "https://cdn.test/theme.css", styleSheet: unreadable, media: { mediaText: "" }, layerName: "base" },
        { cssText: "main { color: red }" }
      ]
    }

    Object.defineProperty(document, "styleSheets", { configurable: true, value: [page] })

    try {
      const kept = new Map<string, string>()
      const { sheets } = await takeSnapshot(window, { mode: plain, viewport: desktop, location: landed, sheets: kept })
      const texts = sheets.map((entry) => ("hash" in entry ? kept.get(entry.hash) : entry))

      expect(texts).toEqual([
        "@media print {\n* { margin: 0 }\n}",
        { href: "https://cdn.test/theme.css", conditions: ["@media print", "@layer base"] },
        "@media print {\nmain { color: red }\n}"
      ])
    } finally {
      Reflect.deleteProperty(document, "styleSheets")
    }
  })

  it("gives the same markup hash to the same tree, and a new one to a changed tree", async () => {
    document.body.innerHTML = "<p>One</p>"
    const once = await takeSnapshot(window, { mode: plain, viewport: desktop, location: landed, sheets: new Map() })
    const again = await takeSnapshot(window, { mode: plain, viewport: desktop, location: landed, sheets: new Map() })
    document.body.innerHTML = "<p>Two</p>"
    const changed = await takeSnapshot(window, { mode: plain, viewport: desktop, location: landed, sheets: new Map() })

    expect(again.markup).toBe(once.markup)
    expect(changed.markup).not.toBe(once.markup)
  })
})

describe("absoluteCss", () => {
  it("makes url()s absolute, leaving data URLs and fragments", () => {
    expect(
      absoluteCss(`a { background: url('x.png'), url(data:image/png;base64,AA), url(#clip) }`, "https://a.test/css/")
    ).toBe(`a { background: url("https://a.test/css/x.png"), url(data:image/png;base64,AA), url(#clip) }`)
  })
})

describe("snapshot.take and sheets.get over the channel", () => {
  /** Starts the runtime in a frame Parity named and connects Parity's end of the channel. */
  function framed() {
    Object.defineProperty(window, "parent", { configurable: true, value: { postMessage: () => undefined } })
    window.name = frameName({ protocol: pageProtocol, frame: "f1", parent, viewport: desktop })
    stop = startPageRuntime()

    const parity = createChannel<ParityMethods, PageMethods>({
      handlers: {
        "page.ready": () => null,
        "page.moved": () => null,
        "page.height": () => null,
        "page.used": () => null
      }
    })

    const { port1, port2 } = new MessageChannel()
    parity.connect(domPort(port1))
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { parity: "port", frame: "f1" },
        origin: parent,
        source: window.parent,
        ports: [port2]
      })
    )

    return parity
  }

  it("answers a snapshot in the mode's window, and the sheets it lists", async () => {
    document.head.innerHTML = `<style>main { color: blue; }</style>`
    document.body.innerHTML = "<main>Pricing</main>"
    const parity = framed()

    const snapshot = await parity.request("snapshot.take", { quiet: { ms: 10, max: 100 } })
    const ids = snapshot.sheets.flatMap((entry) => ("hash" in entry ? [entry.hash] : []))
    const sheets = await parity.request("sheets.get", { ids })

    expect(snapshot.viewport).toEqual(desktop)
    expect(snapshot.location).toMatchObject({ path: "/pricing", outcome: "landed" })
    expect(sheets.map((sheet) => sheet.text)).toEqual([expect.stringContaining("main")])
  })

  it("refuses a wait it can't read, and too many sheet ids", async () => {
    const parity = framed()

    await expect(parity.request("snapshot.take", { quiet: { ms: -1, max: 100 } })).rejects.toThrow(
      "snapshot.take waits for quiet"
    )
    await expect(parity.request("sheets.get", { ids: Array.from({ length: 1001 }, String) })).rejects.toThrow(
      "sheets.get takes at most"
    )
  })

  it("gives a snapshot two seconds past the quiet it waits for", () => {
    expect(snapshotDeadline({ ms: 150, max: 3000 })).toBe(5000)
    expect(snapshotDeadline(undefined)).toBe(2000)
  })
})
