// Saves a screenshot of the running app over the DevTools protocol, after an optional delay in milliseconds.
// Usage: node scripts/snap.ts <name> [delay]
import { join, resolve } from "node:path"
import { chromium } from "playwright-core"

const [name = "snap", delay = "0"] = process.argv.slice(2)
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.PARITY_DEBUG_PORT ?? "9333"}`)
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().endsWith(":5310/") || candidate.url().endsWith(":5310"))
  if (!page) throw new Error("No Parity window found")
  await page.waitForTimeout(Number(delay))
  const path = join(resolve(import.meta.dirname, "../../../.inspect"), `${name}.png`)
  await page.screenshot({ path, timeout: 15_000 })
  console.log(path)
} finally {
  await browser.close()
}
