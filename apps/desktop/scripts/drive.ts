// Runs a scenario against the running app over the DevTools protocol: a module whose default export takes the page
// and a `shot(name)` helper that saves a screenshot to .inspect. Page errors are printed at the end.
// Usage: node scripts/drive.ts <scenario.mjs>
import { writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { JsonValue } from "@parity-app/core/schema"
import { chromium, type Page } from "playwright-core"
import { print } from "../../../scripts/output.ts"

/** A scenario module. What it returns is printed as JSON, so it returns JSON or nothing. */
interface Scenario {
  default(page: Page, helpers: { shot(name: string): Promise<string> }): Promise<JsonValue | undefined>
}

const [file] = process.argv.slice(2)

if (!file) {
  throw new Error("Usage: node scripts/drive.ts <scenario.mjs>")
}

const outDir = resolve(import.meta.dirname, "../../../.inspect")
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.PARITY_DEBUG_PORT ?? "9333"}`)

try {
  // Right after the app starts, its window can take a moment to show up as a page.
  const findPage = () =>
    browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) =>
        candidate
          .url()
          .replace(/\/$/, "")
          .endsWith(`:${process.env.PARITY_UI_PORT ?? "5310"}`)
      )

  let page = findPage()

  for (let attempt = 0; !page && attempt < 40; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    page = findPage()
  }

  if (!page) {
    throw new Error("No Parity window found")
  }

  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text())
    }
  })

  // SAFETY: a scenario's default export takes the page and the helpers, as the usage at the top says.
  const scenario = (await import(pathToFileURL(resolve(file)).href)) as Scenario

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

        const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true })

        await writeFile(path, Buffer.from(data, "base64"))
        await cdp.detach()

        return path
      } catch (error) {
        print(`Screenshot ${name} failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`)

        return ""
      }
    }
  })

  if (result !== undefined) {
    print(JSON.stringify(result, null, 2))
  }

  if (errors.length > 0) {
    print(`Page errors:\n${errors.join("\n")}`)
  }
} finally {
  await browser.close()
}
