import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { appOpenProjects, envScrubber, folderEnvSecrets, projectFolders } from "./env-secrets.ts"

let folder: string

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "parity-cli-env-"))
})

afterEach(() => rmSync(folder, { recursive: true, force: true }))

/** A project at `name` with a package.json and these files beside it. */
function project(name: string, files: Record<string, string>): string {
  const root = join(folder, name)
  mkdirSync(join(root, "src"), { recursive: true })
  writeFileSync(join(root, "package.json"), "{}")

  for (const [file, text] of Object.entries(files)) {
    writeFileSync(join(root, file), text)
  }

  return root
}

describe("the CLI's .env values", () => {
  it("reads every .env file in a folder, and nothing else", () => {
    const shop = project("shop", {
      ".env": "STRIPE_KEY=shop-stripe-value\nPORT=3000",
      ".env.local": 'DATABASE_URL="postgres://shop-db-value"',
      "notes.txt": "NOT_READ=notes-value-here"
    })

    expect(folderEnvSecrets([shop, join(folder, "missing")])).toEqual(["shop-stripe-value", "postgres://shop-db-value"])
  })

  it("takes a command run inside a project up to the project's root", () => {
    const shop = project("shop", {})

    expect(projectFolders(join(shop, "src"))).toEqual([join(shop, "src"), shop])
    expect(projectFolders(shop)).toEqual([shop])
  })

  it("reads the projects the app keeps open, and none from a list that's missing or malformed", () => {
    writeFileSync(join(folder, "open-projects.json"), JSON.stringify({ roots: ["D:/shop", "D:/blog"] }))
    expect(appOpenProjects(folder)).toEqual(["D:/shop", "D:/blog"])

    writeFileSync(join(folder, "open-projects.json"), "{ not json")
    expect(appOpenProjects(folder)).toEqual([])
    expect(appOpenProjects(join(folder, "missing"))).toEqual([])
  })

  it("scrubs the open projects' values, adds each command's project, and keeps those it had", () => {
    const shop = project("shop", { ".env": "SHOP_SECRET=shop-secret-value" })
    const blog = project("blog", { ".env": "BLOG_SECRET=blog-secret-value" })
    const scrubber = envScrubber([shop])
    const error = { message: "failed with shop-secret-value and blog-secret-value" }

    expect(scrubber.value(error).message).toBe("failed with [redacted] and blog-secret-value")

    scrubber.read(projectFolders(join(blog, "src")))
    expect(scrubber.value(error).message).toBe("failed with [redacted] and [redacted]")
  })
})
