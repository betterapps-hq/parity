// Runs a scenario against the running app over the DevTools protocol: a module whose default export takes the page
// and a `shot(name)` helper that saves a screenshot to .inspect. Page errors are printed at the end.
// Usage: node scripts/drive.ts <scenario.mjs>
import { writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { chromium, type Page } from "playwright-core"

const [file] = process.argv.slice(2)
if (!file) throw new Error("Usage: node scripts/drive.ts <scenario.mjs>")
const outDir = resolve(import.meta.dirname, "../../../.inspect")
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.PARITY_DEBUG_PORT ?? "9333"}`)
try {
  // Right after the app starts, its window can take a moment to show up as a page.
  const findPage = () =>
    browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => /:5310\/?$/.test(candidate.url()))
  let page = findPage()
  for (let attempt = 0; !page && attempt < 40; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    page = findPage()
  }
  if (!page) throw new Error("No Parity window found")
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  const scenario = (await import(pathToFileURL(resolve(file)).href)) as {
    default(page: Page, helpers: { shot(name: string): Promise<string> }): Promise<unknown>
  }
  const result = await scenario.default(page, {
    // Best effort: a window in the background can't always be captured, and that shouldn't stop the scenario.
    async shot(name) {
      const path = join(outDir, `${name}.png`)
      try {
        await page.screenshot({ path, timeout: 5_000 })
        return path
      } catch {
        // A window in the background doesn't paint on schedule; capturing the last frame directly still works.
      }
      try {
        const cdp = await page.context().newCDPSession(page)
        const { data } = (await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true })) as {
          data: string
        }
        await writeFile(path, Buffer.from(data, "base64"))
        await cdp.detach()
        return path
      } catch (error) {
        console.log(`Screenshot ${name} failed: ${error instanceof Error ? error.message.split("\n")[0] : error}`)
        return ""
      }
    }
  })
  if (result !== undefined) console.log(JSON.stringify(result, null, 2))
  if (errors.length > 0) console.log(`Page errors:\n${errors.join("\n")}`)
} finally {
  await browser.close()
}
