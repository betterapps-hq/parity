// Connects to the running canvas over the DevTools protocol, checks every rendered frame, and saves a screenshot.
// Usage: pnpm inspect [design name] [--all]
//   design name  select that design in the navigator and zoom to it
//   --all        show every mode and every state of the selected design, then restore what was shown
import { mkdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import { chromium, type Page } from "playwright-core"

const port = process.env.PARITY_DEBUG_PORT ?? "9333"
const showAll = process.argv.includes("--all")
const designName = process.argv.slice(2).find((arg) => !arg.startsWith("--"))
const outDir = resolve(import.meta.dirname, "../../../.inspect")

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => !candidate.url().startsWith("devtools://"))
  if (!page) throw new Error("No canvas window found")

  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.waitForSelector(".container-view", { state: "attached", timeout: 30_000 })

  let restore: (() => Promise<void>) | undefined
  if (designName) {
    await selectDesign(page, designName)
    if (showAll) restore = await showEverything(page, designName)
  }
  await page.waitForTimeout(800)

  const report = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".container-view")].map((view) => ({
      design: view.querySelector(".design-title button")?.textContent,
      states: [...view.querySelectorAll<HTMLElement>(".state-row")].map((row) => ({
        state: row.dataset.state,
        modes: [...row.querySelectorAll<HTMLElement>(".mode-tile")].map((tile) => {
          const shadow = tile.querySelector<HTMLElement>("[data-frame]")?.shadowRoot
          const body = shadow?.firstElementChild as HTMLElement | null | undefined
          const unknown = [...(shadow?.querySelectorAll("div") ?? [])]
            .map((element) => element.textContent ?? "")
            .filter((text) => text.startsWith("Unknown component"))
          return {
            mode: tile.dataset.mode,
            primary: tile.dataset.primary === "true",
            label: tile.querySelector("figcaption button")?.textContent ?? undefined,
            error: tile.querySelector(".mode-error")?.textContent ?? undefined,
            nodes: shadow?.querySelectorAll("[data-canvas-node]").length ?? 0,
            // The width content lays out in, which must equal the mode's width whatever it's drawn at.
            layoutWidth: body?.clientWidth,
            height: body?.offsetHeight,
            theme: body?.className || "light",
            dir: body?.getAttribute("dir") ?? undefined,
            overflowsX: body ? body.scrollWidth > body.clientWidth + 1 : undefined,
            unknown: unknown.length > 0 ? unknown : undefined
          }
        })
      }))
    }))
  )

  await mkdir(outDir, { recursive: true })
  const slug = (designName ?? "canvas").toLowerCase().replaceAll(/\W+/g, "-")
  const screenshot = join(outDir, `${slug}${showAll ? "-all" : ""}.png`)
  await page.screenshot({ path: screenshot, timeout: 15_000 }).catch((error: unknown) => {
    errors.push(`screenshot: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`)
  })
  await restore?.()
  console.log(JSON.stringify({ screenshot, designs: report, errors }, null, 2))
} finally {
  await browser.close()
}

/** Selects a design in the navigator, which also zooms to it. */
async function selectDesign(page: Page, name: string): Promise<void> {
  await page.locator('[role=treeitem][aria-level="1"]', { hasText: name }).first().click()
  await page.waitForTimeout(500)
}

/** Turns on every mode and state from the Design tab; returns a function that puts back what was on before. */
async function showEverything(page: Page, name: string): Promise<() => Promise<void>> {
  await page.getByRole("tab", { name: "Design" }).click()
  const switches = page.locator("aside [role=switch]")
  const before = await switches.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-checked") === "true")
  )
  await page.getByRole("button", { name: "Show all", exact: true }).click()
  const allStates = page.getByRole("switch").first()
  if ((await allStates.getAttribute("aria-checked")) !== "true") await allStates.click()
  await page.waitForTimeout(1200)
  await selectDesign(page, name)

  return async () => {
    await selectDesign(page, name)
    const now = page.locator("aside [role=switch]")
    for (const [index, wasOn] of before.entries()) {
      const element = now.nth(index)
      if ((await element.isDisabled()) || (await element.getAttribute("aria-checked")) === String(wasOn)) continue
      await element.click()
    }
  }
}
