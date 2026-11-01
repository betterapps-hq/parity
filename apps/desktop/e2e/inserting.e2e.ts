import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App } from "./app.ts"

// docs/editor.md, Inserting: the `/` picker (PAR-178), how quickly it opens, what it lists first, what it leaves out
// until it's searched for, and a component found in two places.

declare global {
  interface Window {
    /** How long the picker took to open, once it has. */
    pickerOpened?: Promise<number>
  }
}

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterEach(() => app?.reset())
afterAll(() => app?.close())

const picker = () => app.page.getByRole("listbox", { name: "Layers, components and icons" })
const field = () => app.page.getByRole("combobox", { name: "Insert a layer, component or icon" })

/**
 * Presses `/` and says how long the picker took to open: from the press until its first rows are in the page and laid
 * out, so the next frame draws them. Frames themselves aren't waited for, since a window in the background gets one a
 * second or less.
 */
async function open(): Promise<number> {
  await app.page.evaluate(() => {
    const opened = new Promise<number>((resolve) => {
      const observer = new MutationObserver(() => {
        const list = document.querySelector("[role=listbox]")
        if (!list?.querySelector("[role=option]")) return
        observer.disconnect()
        list.getBoundingClientRect()
        resolve(performance.now() - pressed)
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    const pressed = performance.now()
    window.pickerOpened = opened
  })
  await app.page.keyboard.press("/")
  return app.page.evaluate(() => window.pickerOpened!)
}

/** Closes the picker with Escape, once it has played its closing animation. */
async function close(): Promise<void> {
  await app.page.keyboard.press("Escape")
  await expect.poll(() => app.page.getByRole("dialog").count()).toBe(0)
}

/** What the picker draws, in order: `# heading`, and each row's name with what's beside it. */
function lines(): Promise<string[]> {
  return picker().evaluate((list) =>
    [...list.querySelectorAll(":scope > div > *")].map((line) => {
      const text = (line.textContent ?? "").trim()
      if (line.getAttribute("role") !== "option") return `# ${text}`
      // A row's name, then each source or detail beside it as its own part.
      const parts = [...line.querySelectorAll(":scope > span")].map((part) => {
        const chips = [...part.querySelectorAll("button")].map((chip) => chip.textContent)
        return chips.length > 0 ? chips.join(" | ") : part.textContent
      })
      return parts.join(" / ")
    })
  )
}

/** Types a search, and waits for the list to follow it. */
async function search(query: string): Promise<string[]> {
  await field().fill(query)
  await expect.poll(async () => (await field().inputValue()) === query && (await lines()).length > 0).toBe(true)
  return lines()
}

describe("the insert picker", () => {
  it("opens within 100ms", async () => {
    await app.show("Members", 0.5)
    await app.selectDesign("Members")
    const times: number[] = []
    for (let run = 0; run < 7; run++) {
      times.push(await open())
      await close()
    }
    // The list is built while the window is idle, so even the first opening only draws it. On a quiet machine every
    // opening takes 25 to 50ms in development; other work on the machine can double one, so the slower half has room.
    // Before PAR-178 each took 400 to 900ms.
    const sorted = [...times].sort((a, b) => a - b)
    console.log(`Opened the picker in ${times.map((time) => Math.round(time)).join(", ")}ms`)
    expect(sorted[0]).toBeLessThan(100)
    expect(sorted[3]).toBeLessThan(150)
  })

  it("lists basic layers, then the project's component designs and its own components, and libraries' last", async () => {
    await open()
    const first = await lines()
    expect(first.slice(0, 5)).toEqual([
      "# Basics",
      "Text",
      "Vertical layout",
      "Horizontal layout",
      "# Component designs"
    ])
    // Only the lines in view are drawn, so the list is scrolled a screen at a time to read every heading. Each scroll
    // is announced at once, as a wheel's would be a frame later, since frames are slow in a window in the background.
    const headings = await app.page.evaluate(async () => {
      const list = document.querySelector<HTMLElement>("[role=listbox]")!
      const seen: string[] = []
      for (let top = 0; top <= list.scrollHeight; top += list.clientHeight) {
        list.scrollTop = top
        list.dispatchEvent(new Event("scroll"))
        await new Promise((resolve) => setTimeout(resolve, 0))
        for (const line of list.querySelectorAll(":scope > div > div[role=presentation]")) {
          const text = line.textContent ?? ""
          if (text && !seen.includes(text)) seen.push(text)
        }
      }
      return seen
    })
    // The example has no pages, and App and ThemeProvider aren't listed until searched for, so the app's own section
    // holds the run's MemberRow, MemberNames and EmailField.
    expect(headings).toEqual([
      "Basics",
      "Component designs",
      "UI kit",
      "shadcn-vite",
      "Shadcn Nova",
      "Radix Primitives"
    ])
  })

  it("finds Badge for `badge`, once, with both its sources, and nothing that only scatters its letters", async () => {
    await open()
    const found = await search("badge")
    const components = found.slice(0, found.indexOf("# Lucide icons"))
    expect(components).toEqual([
      "Badge / UI kit | Shadcn Nova",
      "AvatarBadge / UI kit | Shadcn Nova",
      "SidebarMenuBadge / Shadcn Nova"
    ])
  })

  it("leaves out internal parts, providers and app plumbing until they're searched for by name", async () => {
    await open()
    // ThemeProvider and App are listed under the app's folders, as MemberRow is; a search for the folder finds only
    // what people place.
    const inFolder = await search("components")
    expect(inFolder.some((line) => line.startsWith("MemberRow"))).toBe(true)
    expect(inFolder.some((line) => line.startsWith("ThemeProvider"))).toBe(false)
    expect((await search("theme")).at(0)).toBe("ThemeProvider / shadcn-vite")
    expect((await search("App")).at(0)).toBe("App / shadcn-vite")
    // Searching `dialog` is searching for a dialog: its overlay and portal come after every part placed.
    const dialog = await search("dialog")
    expect(dialog[0]).toBe("Dialog / Shadcn Nova")
    expect(dialog.slice(0, 12).some((line) => /^Dialog(Overlay|Portal) /.test(line))).toBe(false)
    expect((await search("dialog overlay")).at(0)).toBe("DialogOverlay / Shadcn Nova")
  })

  it("inserts the project's own Badge with Enter, and Nova's from its source", async () => {
    await app.show("Members", 0.5)
    await app.selectDesign("Members")
    const before = await app.children("Members", "page")
    await open()
    await search("badge")
    await app.page.keyboard.press("Enter")
    await expect.poll(() => app.undoLabel()).toBe("Add Badge")
    const added = (await app.children("Members", "page")).filter((id) => !before.includes(id))
    expect(added).toHaveLength(1)
    expect(await app.node("Members", added[0]!)).toMatchObject({ type: "component", component: "Badge" })

    await app.selectDesign("Members")
    await open()
    await search("badge")
    await picker().getByRole("button", { name: "Insert Badge from Shadcn Nova" }).click()
    await expect.poll(async () => (await app.children("Members", "page")).length).toBe(before.length + 2)
    const nova = (await app.children("Members", "page")).find((id) => !before.includes(id) && id !== added[0])
    expect(await app.node("Members", nova!)).toMatchObject({ type: "component", component: "nova/Badge" })
  })
})
