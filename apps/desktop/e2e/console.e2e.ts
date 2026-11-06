import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App, center } from "./app.ts"

// docs/editor.md, Reading the code: the designs' console (PAR-147). Ada's row on the Members screen warns when it's
// clicked.

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterEach(() => app?.reset())
afterAll(() => app?.close())

describe("the designs' console", () => {
  it("keeps what a frame writes while it's used as its design's, and opens on it from the board", async () => {
    await app.show("Members", 1)
    await app.selectDesign("Members")
    await app.page.keyboard.press("i")
    await expect.poll(() => app.tool()).toBe("interact")
    await app.click(center(await app.box("Members", "ada")))
    // Only the board whose frame wrote it counts it.
    const badge = app.page.getByRole("button", { name: /1 warning from Members in the console$/ })
    await expect.poll(() => badge.count(), { timeout: 10_000 }).toBe(1)
    await badge.click()
    const panel = app.page.getByRole("region", { name: "Console" })
    try {
      const members = panel.getByRole("region", { name: "Members" })
      await expect.poll(() => members.getByText("Picked Ada Lovelace").count()).toBe(1)
    } finally {
      // The layout is kept, so the files after this one start with the console closed.
      await panel.getByRole("button", { name: "Close the console" }).click()
    }
  })
})
