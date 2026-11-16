import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { serverOnlyReason, serverOnlyStandIns } from "./server-modules.ts"

let root: string

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-next-server-")))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe("modules only Next's server can build", () => {
  it("are those that export metadata or a viewport", () => {
    expect(serverOnlyReason('export const metadata: Metadata = { title: "Home" }')).toBe("exports metadata")
    expect(serverOnlyReason("export async function generateMetadata() {}")).toBe("exports generateMetadata")
    expect(serverOnlyReason("export function generateViewport() {}")).toBe("exports generateViewport")
    expect(serverOnlyReason("const viewport = {}\nexport { viewport }")).toBe("exports viewport")
  })

  it("are those that import next/headers or server-only", () => {
    expect(serverOnlyReason('import { cookies } from "next/headers"')).toBe("imports next/headers")
    expect(serverOnlyReason("import 'server-only'")).toBe("imports server-only")
    expect(serverOnlyReason('import { Html, Head } from "next/document"')).toBe("imports next/document")
  })

  it("aren't client modules, or modules that only mention those names", () => {
    expect(serverOnlyReason('"use client"\nexport const metadata = {}')).toBeUndefined()
    expect(serverOnlyReason('// A client module\n"use client"\nimport "server-only"')).toBeUndefined()
    expect(serverOnlyReason("export function Card({ metadata }) { return metadata.title }")).toBeUndefined()
    expect(serverOnlyReason('import { headers } from "./headers"')).toBeUndefined()
  })

  it("are imported from stand-ins that throw why, by the module's path", async () => {
    for (const [path, content] of Object.entries({
      "src/app/layout.tsx": "export const metadata = {}\nexport default function RootLayout() {}\n",
      "src/components/Card.tsx": "export function Card() {}\n",
      "src/pages/_document.tsx": 'import { Html } from "next/document"\n'
    })) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), content)
    }

    const standIns = await serverOnlyStandIns(root, [
      "src/components/Card.tsx",
      "src/app/layout.tsx",
      "src/missing.tsx",
      "src/pages/_document.tsx"
    ])

    expect(standIns).toEqual([
      {
        module: "src/app/layout.tsx",
        path: "app/server-only/1.js",
        text: `throw new Error(${JSON.stringify(
          "src/app/layout.tsx exports metadata, so it's a server component, which the canvas can't draw yet"
        )})\n`
      },
      {
        module: "src/pages/_document.tsx",
        path: "app/server-only/3.js",
        text: `throw new Error(${JSON.stringify(
          "src/pages/_document.tsx imports next/document, so it's a Pages Router document, which the canvas can't draw yet"
        )})\n`
      }
    ])
  })
})
