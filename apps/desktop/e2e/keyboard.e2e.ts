import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App, center } from "./app.ts"

// docs/editor.md, Keyboard: keys outside Interact (CAN-54), nudging, select inverse and matching, next and previous
// design, both pastes (CAN-39), and how shortcuts are shown. Copying and pasting go through the page's stand-in for
// the system clipboard, which the tests never touch.

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterEach(() => app.reset())
afterAll(() => app.close())

// Pricing's footer links, a row of three texts: Privacy, Terms and Status.
const links = "b1UlB"
const [privacy, terms, status] = ["I642d", "U2Hkf", "vMbuW"]
// Calendar's Planning slot, placed absolutely at top 16 and stretched between left 0 and right 0, in its Events.
const planning = "aAaEs"
const events = "zEb2T"

const frameFocus = () =>
  app.page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-frame]")].some((host) => host.shadowRoot?.activeElement)
  )
const allInert = () =>
  app.page.evaluate(() => [...document.querySelectorAll("[data-frame]")].every((host) => host.hasAttribute("inert")))

describe("keys outside Interact", () => {
  it("keeps every frame inert, so Tab from the canvas never reaches a design's fields", async () => {
    await app.show("Sign in", 0.5)
    await app.selectDesign("Sign in")
    expect(await allInert()).toBe(true)
    for (let press = 0; press < 4; press++) {
      await app.page.keyboard.press("Tab")
      expect(await frameFocus()).toBe(false)
    }
    // The canvas's keys still work after it.
    await app.page.keyboard.press("n")
    await expect.poll(async () => (await app.selection()).design).not.toBe(await app.key("Sign in"))
  })

  it("hands frames the pointer and keys in Interact, and takes them back after", async () => {
    await app.show("Sign in", 0.5)
    await app.selectDesign("Sign in")
    await app.page.keyboard.press("i")
    await expect.poll(() => app.tool()).toBe("interact")
    expect(await allInert()).toBe(false)
    const field = await app.page.evaluate(() => {
      const e2e = window.e2e!
      const { x, y, width, height } = e2e
        .frame(e2e.key("Sign in"))
        .shadowRoot!.querySelector("input")!
        .getBoundingClientRect()
      return { x, y, width, height }
    })
    await app.click(center(field))
    await app.page.keyboard.type("ada")
    const typed = () =>
      app.page.evaluate(() => {
        const e2e = window.e2e!
        const active = e2e.frame(e2e.key("Sign in")).shadowRoot!.activeElement
        return active instanceof HTMLInputElement ? active.value : undefined
      })
    expect(await typed()).toMatch(/ada$/)
    // Keys typed there are the design's: N went into the field rather than to the next design.
    await app.page.keyboard.type("n")
    expect(await typed()).toMatch(/adan$/)
    await app.page.keyboard.press("Escape")
    await app.page.keyboard.press("Escape")
    await expect.poll(() => app.tool()).toBe("select")
    expect(await allInert()).toBe(true)
    expect(await frameFocus()).toBe(false)
  })
})

describe("nudging", () => {
  it("moves a layer in a row one place per arrow, as one undo step", async () => {
    await app.show("Pricing", 0.5, links)
    await app.selectLayer("Pricing", privacy)
    await app.page.keyboard.press("ArrowRight")
    await app.page.keyboard.press("ArrowRight")
    await expect.poll(() => app.children("Pricing", links)).toEqual([terms, status, privacy])
    // Across a row, nothing.
    await app.page.keyboard.press("ArrowDown")
    expect(await app.children("Pricing", links)).toEqual([terms, status, privacy])
    await app.page.keyboard.press("Control+z")
    await expect.poll(() => app.children("Pricing", links)).toEqual([privacy, terms, status])
  })

  it("moves an absolutely placed layer a step, ten with Shift, both sides when it's stretched", async () => {
    await app.show("Calendar", 0.5, planning)
    await app.selectLayer("Calendar", planning)
    const was = await app.style("Calendar", planning)
    await app.page.keyboard.press("ArrowDown")
    await app.page.keyboard.press("Shift+ArrowDown")
    await app.page.keyboard.press("ArrowRight")
    await expect
      .poll(() => app.style("Calendar", planning))
      .toMatchObject({ top: Number(was.top) + 11, left: 1, right: -1, height: was.height })
    await app.page.keyboard.press("Control+z")
    await expect.poll(() => app.style("Calendar", planning)).toEqual(was)
  })

  it("moves a design 1px, 10px with Shift, and leaves Ctrl and Alt arrows to nothing", async () => {
    await app.show("Pricing", 0.3)
    await app.selectDesign("Pricing")
    const position = async () => (await app.designs()).find((design) => design.name === "Pricing")!.position
    const at = await position()
    await app.page.keyboard.press("ArrowLeft")
    await app.page.keyboard.press("Shift+ArrowUp")
    await expect.poll(position).toEqual({ x: at.x - 1, y: at.y - 10 })
    // tldraw would move the design with these, behind the store's back.
    await app.page.keyboard.press("Control+ArrowRight")
    await app.page.keyboard.press("Alt+ArrowRight")
    await app.frames(2)
    expect(await position()).toEqual({ x: at.x - 1, y: at.y - 10 })
    const board = await app.page.evaluate(() => {
      const e2e = window.e2e!
      const editor = e2e.session().editor!
      const shape = editor
        .getCurrentPageShapes()
        .find((candidate) => candidate.id.endsWith(encodeURIComponent(e2e.key("Pricing"))))!
      return { x: shape.x, y: shape.y }
    })
    expect(board).toEqual({ x: at.x - 1, y: at.y - 10 })
    await app.page.keyboard.press("Control+z")
    await expect.poll(position).toEqual(at)
  })
})

describe("select inverse and select matching layers", () => {
  it("selects the other layers beside the selected one with Ctrl+Shift+A", async () => {
    await app.show("Pricing", 0.5, links)
    await app.selectLayer("Pricing", privacy)
    await app.page.keyboard.press("Control+Shift+A")
    await expect.poll(async () => (await app.selection()).nodes).toEqual([terms, status])
  })

  it("selects every matching plan card with Ctrl+Alt+A", async () => {
    await app.show("Pricing", 0.5, "AhMrf")
    await app.selectLayer("Pricing", "AhMrf")
    await app.page.keyboard.press("Control+Alt+A")
    await expect
      .poll(async () => [...((await app.selection()).nodes ?? [])].sort())
      .toEqual(["AhMrf", "nGcY6", "u0Oqu"].sort())
    // The one picked last stays the one the inspector shows.
    expect((await app.selection()).node).toBe("AhMrf")
  })

  it("runs Select inverse from the Edit menu", async () => {
    await app.show("Pricing", 0.5, links)
    await app.selectLayer("Pricing", terms)
    await app.page.getByRole("menuitem", { name: "Edit" }).click()
    await app.page.getByRole("menuitem", { name: /^Select inverse/ }).click()
    await expect.poll(async () => (await app.selection()).nodes).toEqual([privacy, status])
  })
})

describe("next and previous design", () => {
  it("selects the next design with N and zooms to it as Zoom to selection does, and Shift+N goes back", async () => {
    await app.show("Pricing", 0.3)
    await app.selectDesign("Pricing")
    const before = await app.camera()
    await app.page.keyboard.press("n")
    // Screens go in the order the project lists them, and Sign up comes after Pricing.
    await expect.poll(async () => (await app.selection()).design).toBe(await app.key("Sign up"))
    await expect.poll(() => app.camera()).not.toEqual(before)
    const afterN = await settledCamera()
    await app.page.keyboard.press("Shift+2")
    await app.frames(4)
    expect(await settledCamera()).toEqual(afterN)
    await app.page.keyboard.press("Shift+N")
    await expect.poll(async () => (await app.selection()).design).toBe(await app.key("Pricing"))
    await expect.poll(settledCamera).not.toEqual(afterN)
  })

  it("goes round from the last design to the first, components first", async () => {
    // Members is the last screen the project lists, and Member row its first component.
    await app.show("Members", 0.5)
    await app.selectDesign("Members")
    await app.page.keyboard.press("n")
    await expect.poll(async () => (await app.selection()).design).toBe(await app.key("Member row"))
    await app.page.keyboard.press("Shift+N")
    await expect.poll(async () => (await app.selection()).design).toBe(await app.key("Members"))
  })
})

/** The camera once it has stopped moving, rounded to what can be seen. */
async function settledCamera(): Promise<{ x: number; y: number; z: number }> {
  let last = ""
  for (let tries = 0; tries < 40; tries++) {
    await app.frames(2)
    const camera = await app.camera()
    const rounded = { x: Math.round(camera.x), y: Math.round(camera.y), z: Math.round(camera.z * 1000) / 1000 }
    if (JSON.stringify(rounded) === last) return rounded
    last = JSON.stringify(rounded)
  }
  throw new Error("The camera kept moving")
}

describe("paste over selection and paste to replace", () => {
  it("pastes a copied layer just after the selected one with Ctrl+Shift+V, removing nothing", async () => {
    await app.show("Pricing", 0.5, links)
    await app.selectLayer("Pricing", terms)
    await app.page.keyboard.press("Control+c")
    await expect.poll(() => app.clipboard()).toContain('"parity":"clipboard"')
    await app.selectLayer("Pricing", status)
    await app.page.keyboard.press("Control+Shift+V")
    await expect.poll(async () => (await app.children("Pricing", links)).length).toBe(4)
    const copy = (await app.selection()).node!
    expect(await app.children("Pricing", links)).toEqual([privacy, terms, status, copy])
    expect(await app.node("Pricing", copy)).toMatchObject({ type: "text", text: "Terms" })
    await app.page.keyboard.press("Control+z")
    await expect.poll(() => app.children("Pricing", links)).toEqual([privacy, terms, status])
  })

  it("replaces the selected layer in its place with Ctrl+Shift+R, without reloading the window", async () => {
    let loads = 0
    const count = () => loads++
    app.page.on("framenavigated", count)
    try {
      await app.show("Pricing", 0.5, links)
      await app.selectLayer("Pricing", terms)
      await app.page.keyboard.press("Control+c")
      await app.selectLayer("Pricing", status)
      await app.page.keyboard.press("Control+Shift+R")
      await expect.poll(async () => (await app.children("Pricing", links)).includes(status)).toBe(false)
      const copy = (await app.selection()).node!
      expect(await app.children("Pricing", links)).toEqual([privacy, terms, copy])
      expect(loads).toBe(0)
      expect(await app.page.evaluate(() => window.e2e !== undefined)).toBe(true)
      await app.page.keyboard.press("Control+z")
      await expect.poll(() => app.children("Pricing", links)).toEqual([privacy, terms, status])
    } finally {
      app.page.off("framenavigated", count)
    }
  })

  it("pastes over an absolutely placed layer on top of it, at its insets", async () => {
    await app.show("Pricing", 0.5, links)
    await app.selectLayer("Pricing", terms)
    await app.page.keyboard.press("Control+c")
    const stack = await app.children("Calendar", events)
    await app.show("Calendar", 0.5, planning)
    await app.selectLayer("Calendar", planning)
    await app.page.keyboard.press("Control+Shift+V")
    await expect.poll(async () => (await app.children("Calendar", events)).length).toBe(stack.length + 1)
    const copy = (await app.selection()).node!
    const after = await app.children("Calendar", events)
    expect(after[after.indexOf(planning) + 1]).toBe(copy)
    expect(await app.style("Calendar", copy)).toMatchObject({ position: "absolute", top: 16, left: 0, right: 0 })
  })

  it("pastes copied designs over a design, at its position and on top of it", async () => {
    await app.show("Pricing", 0.1)
    await app.selectDesign("Pricing")
    await app.page.keyboard.press("Control+c")
    await expect.poll(() => app.clipboard()).toContain('"kind":"designs"')
    await app.show("Sign in", 0.1)
    await app.selectDesign("Sign in")
    const before = await app.designs()
    await app.page.keyboard.press("Control+Shift+V")
    await expect.poll(async () => (await app.designs()).length).toBe(before.length + 1)
    const copy = (await app.designs()).find((design) => !before.some((other) => other.key === design.key))!
    const signIn = before.find((design) => design.name === "Sign in")!
    expect(copy.position).toEqual(signIn.position)
    expect((await app.selection()).design).toBe(copy.key)
    const onTop = await app.page.evaluate(
      ([copy, under]) => {
        const shapes = window.e2e!.session().editor!.getCurrentPageShapesSorted()
        const index = (key: string) => shapes.findIndex((shape) => shape.id.endsWith(encodeURIComponent(key)))
        return index(copy) > index(under)
      },
      [copy.key, signIn.key] as const
    )
    expect(onTop).toBe(true)
  })

  it("says what to copy when the clipboard holds designs and layers are selected", async () => {
    await app.show("Pricing", 0.1)
    await app.selectDesign("Pricing")
    await app.page.keyboard.press("Control+c")
    await app.show("Pricing", 0.5, links)
    await app.selectLayer("Pricing", status)
    await app.page.keyboard.press("Control+Shift+V")
    await expect.poll(() => app.page.getByText("Copy layers to paste them over layers").isVisible()).toBe(true)
    expect(await app.children("Pricing", links)).toEqual([privacy, terms, status])
    expect(await app.undoLabel()).toBeUndefined()
  })

  it("replaces a layer with plain text from the clipboard as a text layer", async () => {
    await app.show("Pricing", 0.5, links)
    await app.setClipboard("Cookies")
    await app.selectLayer("Pricing", status)
    await app.page.keyboard.press("Control+Shift+R")
    await expect.poll(async () => (await app.children("Pricing", links)).includes(status)).toBe(false)
    const copy = (await app.selection()).node!
    expect(await app.node("Pricing", copy)).toMatchObject({ type: "text", text: "Cookies" })
  })
})

describe("how shortcuts are shown", () => {
  it("writes shortcuts in the menus as plain text joined by +", async () => {
    // Each item's text, its label and then its keys, as the menu shows them.
    const items = async (menu: string) => {
      await app.page.getByRole("menuitem", { name: menu, exact: true }).click()
      const open = app.page.getByRole("menu").getByRole("menuitem")
      await expect.poll(() => open.count()).toBeGreaterThan(0)
      const texts = await open.allInnerTexts()
      await app.page.keyboard.press("Escape")
      await expect.poll(() => app.page.getByRole("menu").count()).toBe(0)
      return texts.map((text) => text.replace(/\s+/g, " ").trim())
    }
    expect(await items("Edit")).toEqual(
      expect.arrayContaining([
        "Paste Ctrl+V",
        "Paste over selection Ctrl+Shift+V",
        "Paste to replace Ctrl+Shift+R",
        "Select inverse Ctrl+Shift+A",
        "Select matching layers Ctrl+Alt+A"
      ])
    )
    expect(await items("View")).toEqual(expect.arrayContaining(["Next design N", "Previous design Shift+N"]))
  })

  it("lists the nudges and the new keys in the Keyboard shortcuts dialog, as keycaps", async () => {
    await app.page.keyboard.press("Control+Shift+?")
    const dialog = app.page.getByRole("dialog")
    await expect.poll(() => dialog.isVisible()).toBe(true)
    const text = await dialog.innerText()
    for (const label of [
      "Nudge",
      "Big nudge",
      "Next design",
      "Previous design",
      "Paste over selection",
      "Paste to replace"
    ]) {
      expect(text).toContain(label)
    }
    expect(await dialog.locator("kbd", { hasText: /^Ctrl\+Shift\+R$/ }).count()).toBeGreaterThan(0)
    expect(await dialog.locator("kbd", { hasText: /^Shift\+←$/ }).count()).toBeGreaterThan(0)
  })
})
