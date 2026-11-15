import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { nextAppStyles } from "./app-styles.ts"
import { detectNext, postcssConfigFile, projectTsconfigFile, tsconfigSetsBaseUrl } from "./next.ts"

let root: string

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-next-")))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

async function write(files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

/** A Next.js app on `version`, with a `dev` script running `dev`, and Next's own package as far as detection reads it. */
const app = (version: string, dev = "next dev") => ({
  "package.json": JSON.stringify({ name: "app", scripts: { dev, build: "next build" } }),
  "node_modules/next/package.json": JSON.stringify({ name: "next", version })
})

describe("detecting a Next.js app", () => {
  it("finds the project's Next, the bundler its dev script runs, and its config", async () => {
    await write({ ...app("16.4.6"), "next.config.ts": "export default {}\n" })

    const found = await detectNext(root)

    expect(found).toMatchObject({ bundler: "turbopack", script: "dev", config: "next.config.ts" })
    expect("next" in found && found.next.version).toBe("16.4.6")
    expect("next" in found && found.next.folder).toBe(join(root, "node_modules/next").replaceAll("\\", "/"))
  })

  it("says the bundler is webpack when the dev script asks for it", async () => {
    await write(app("16.4.6", "next dev --webpack"))

    expect(await detectNext(root)).toMatchObject({ bundler: "webpack", script: "dev" })
    expect(await detectNext(root)).not.toHaveProperty("config")
  })

  it("finds Next in a folder above, as a workspace hoists it", async () => {
    await write({ ...app("15.5.2"), "apps/web/package.json": JSON.stringify({ name: "web" }) })

    expect(await detectNext(join(root, "apps/web"))).toMatchObject({ bundler: "webpack" })
  })

  it("says why when Next isn't installed", async () => {
    await write({ "package.json": JSON.stringify({ name: "app" }) })

    expect(await detectNext(root)).toEqual({ missing: "No Next.js installed" })
  })

  it("finds the PostCSS and TypeScript configs the guest app passes on", async () => {
    expect(await postcssConfigFile(root)).toBeUndefined()
    expect(await projectTsconfigFile(root)).toBeUndefined()

    await write({ "postcss.config.mjs": "export default {}\n", "jsconfig.json": "{}" })

    expect(await postcssConfigFile(root)).toBe("postcss.config.mjs")
    expect(await projectTsconfigFile(root)).toBe("jsconfig.json")
  })
})

describe("a Next.js app's global stylesheets", () => {
  it("are the ones its root layout imports, by path from the root, through its path aliases, without CSS modules", async () => {
    await write({
      "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
      "src/app/layout.tsx": [
        'import type { Metadata } from "next"',
        'import "@/app/globals.css"',
        'import styles from "./layout.module.css"',
        "export default function RootLayout() {}"
      ].join("\n"),
      "src/app/globals.css": "@import 'tailwindcss';\n",
      "src/app/layout.module.css": ".root {}\n"
    })

    expect((await nextAppStyles(root)).styles).toEqual(["src/app/globals.css"])
  })

  it("are found through the modules the Pages Router's _app imports", async () => {
    await write({
      "pages/_app.jsx": 'import { Shell } from "../components/shell"\nexport default function App() {}\n',
      "components/shell.jsx": 'import "../styles/base.css"\nexport function Shell() {}\n',
      "styles/base.css": "body { margin: 0 }\n"
    })

    expect((await nextAppStyles(root)).styles).toEqual(["styles/base.css"])
  })
})

describe("a project's own baseUrl", () => {
  it("is one its tsconfig sets or inherits through extends", async () => {
    await write({
      "tsconfig.base.json": JSON.stringify({ compilerOptions: { baseUrl: "./src", paths: { "@/*": ["*"] } } }),
      "tsconfig.json": JSON.stringify({ extends: "./tsconfig.base.json", include: ["src"] })
    })

    expect(tsconfigSetsBaseUrl(root, "tsconfig.json")).toBe(true)

    await write({ "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }) })

    expect(tsconfigSetsBaseUrl(root, "tsconfig.json")).toBe(false)
  })
})
