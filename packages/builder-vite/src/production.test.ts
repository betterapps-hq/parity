import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { BuilderSession, BuilderStartOptions, RendererAdapter } from "@parity-app/core"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { developmentStandIn, productionDependencies, viteBuilder } from "./index.ts"

const viteFolder = dirname(createRequire(import.meta.url).resolve("vite/package.json"))
/** What renderer-react serves in place of `react/jsx-dev-runtime`. */
const standIns = { "/jsx-dev-runtime": 'export { Fragment, jsx as jsxDEV } from "$base/jsx-runtime"' }

let root: string
let options: BuilderStartOptions
let session: BuilderSession | undefined

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "parity-production-"))
  // A stand-in for React, which says which build it is, as React picks its build by `process.env.NODE_ENV`.
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "fixture", type: "module" }),
    "guest.js": "export function createGuest(init) { return init }\n",
    "src/button.js": [
      'import { jsxDEV } from "react/jsx-dev-runtime"',
      'export const Button = () => jsxDEV("button", { children: "Save" }, undefined, false, {}, undefined)',
      ""
    ].join("\n"),
    "src/mode.js": "export const mode = process.env.NODE_ENV\n",
    "node_modules/react/package.json": JSON.stringify({ name: "react", version: "19.0.0", main: "index.js" }),
    "node_modules/react/index.js": "exports.build = process.env.NODE_ENV\n",
    "node_modules/react/jsx-runtime.js": [
      'exports.Fragment = "fragment"',
      "exports.jsx = (type, props) => ({ type, props, build: process.env.NODE_ENV })",
      ""
    ].join("\n"),
    // As React's production build has it: no `jsxDEV`.
    "node_modules/react/jsx-dev-runtime.js": [
      'exports.Fragment = "fragment"',
      'exports.jsxDEV = process.env.NODE_ENV === "production" ? undefined : (type, props) => ({ type, props })',
      ""
    ].join("\n")
  }
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  await symlink(viteFolder, join(root, "node_modules", "vite"), "junction")
  options = {
    root,
    config: {
      styles: [],
      components: {
        Button: { path: "src/button.js", export: "Button" },
        Mode: { path: "src/mode.js", export: "mode" }
      },
      documents: [],
      libraries: []
    },
    renderer: {
      runtimePackages: ["react"],
      runtimeImports: ["react", "react/jsx-runtime"],
      developmentStandIns: standIns
    } as unknown as RendererAdapter,
    rendererGuestPath: join(root, "guest.js"),
    allowedOrigins: []
  }
})

afterEach(async () => {
  await session?.close()
  session = undefined
  await rm(root, { recursive: true, force: true })
})

/** Fetches a module the builder serves, as the canvas would. */
async function served(url: string): Promise<string> {
  const response = await fetch(new URL(url, session!.guestUrl))
  expect(response.status).toBe(200)
  return response.text()
}

/** The URLs a served module imports from. */
function importsOf(code: string): string[] {
  return [...code.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!)
}

describe("frames on dependencies' production builds", () => {
  it("prebundles dependencies as production, and serves the project's own modules as development", async () => {
    session = await viteBuilder.start(options)
    await served(session.guestUrl)
    // As the process's environment says: `development` in the app, `test` here.
    expect(await served("/src/mode.js")).toContain(`"${process.env.NODE_ENV ?? "development"}"`)
    const button = await served("/src/button.js")
    const standIn = importsOf(button).find((url) => url.includes("stand-in"))
    expect(standIn).toBe("/@id/__x00__virtual:canvas/stand-in/react/jsx-dev-runtime")
    const runtime = importsOf(await served(standIn!)).find((url) => url.includes("react_jsx-runtime"))
    expect(runtime).toBeDefined()
    const bundled = await served(runtime!)
    expect(bundled).toContain('"production"')
    expect(bundled).not.toContain(`"${process.env.NODE_ENV ?? "development"}"`)
  }, 30_000)
})

describe("developmentStandIn", () => {
  it("serves a renderer's module in place of a bare specifier ending as it names, by that package", () => {
    expect(developmentStandIn("react/jsx-dev-runtime", standIns)).toBe(
      'export { Fragment, jsx as jsxDEV } from "react/jsx-runtime"'
    )
    expect(developmentStandIn("@emotion/react/jsx-dev-runtime", standIns)).toBe(
      'export { Fragment, jsx as jsxDEV } from "@emotion/react/jsx-runtime"'
    )
  })

  it("leaves other modules, files and virtual modules alone", () => {
    expect(developmentStandIn("react/jsx-runtime", standIns)).toBeUndefined()
    expect(developmentStandIn("./jsx-dev-runtime", standIns)).toBeUndefined()
    expect(developmentStandIn("/src/jsx-dev-runtime", standIns)).toBeUndefined()
    expect(developmentStandIn("\0virtual:canvas/stand-in/react/jsx-dev-runtime", standIns)).toBeUndefined()
    expect(developmentStandIn("/jsx-dev-runtime", standIns)).toBeUndefined()
    expect(developmentStandIn("react/jsx-dev-runtime")).toBeUndefined()
  })
})

describe("productionDependencies", () => {
  it("sets the optimizer's own define: Rolldown's from Vite 8, esbuild's before", () => {
    const define = { "process.env.NODE_ENV": '"production"' }
    expect(productionDependencies({ version: "8.3.5", rolldownVersion: "1.0.0" })).toEqual({
      rolldownOptions: { transform: { define } }
    })
    expect(productionDependencies({ version: "7.1.0" })).toEqual({ esbuildOptions: { define } })
  })
})
