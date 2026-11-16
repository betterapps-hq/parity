import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { findPackage } from "./packages.ts"
import { pnpNodeOptions, pnpProject } from "./pnp.ts"

/**
 * A Plug'n'Play project in `app`, inside a folder whose `node_modules` holds other copies, and with a project in
 * `app/legacy` installed with `node_modules`, which its map doesn't include. Yarn's real runtime reads packages from zip
 * archives; this one stands in for it with the API Parity uses, leading to plain folders under `.yarn/unpacked`.
 */
let root: string

const at = (...path: string[]) => join(root, ...path)

function write(path: string, content: string): void {
  mkdirSync(dirname(at(path)), { recursive: true })
  writeFileSync(at(path), content)
}

const runtime = `const path = require("node:path")
const app = __dirname
const packages = { react: path.join(app, ".yarn", "unpacked", "react") }
const inApp = (location) => {
  const relative = path.relative(app, path.resolve(location))
  return !relative.startsWith("..") && !relative.startsWith("legacy")
}
module.exports = {
  setup() {},
  findPackageLocator: (location) => (inApp(location) ? { name: "app", reference: "workspace:." } : null),
  resolveToUnqualified(request, issuer) {
    if (inApp(issuer) && request in packages) return packages[request] + path.sep
    throw new Error(request + " isn't a dependency of " + issuer)
  }
}
`

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "parity-pnp-")))
  write("node_modules/react/package.json", JSON.stringify({ name: "react", version: "18.3.1" }))
  write("node_modules/lodash/package.json", JSON.stringify({ name: "lodash", version: "4.17.21" }))
  write("app/package.json", JSON.stringify({ name: "app", dependencies: { react: "^19.2.0" } }))
  write("app/.pnp.cjs", runtime)
  write("app/.yarn/unpacked/react/package.json", JSON.stringify({ name: "react", version: "19.2.0" }))
  write("app/legacy/package.json", JSON.stringify({ name: "legacy" }))
  write("app/legacy/node_modules/react/package.json", JSON.stringify({ name: "react", version: "17.0.2" }))
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe("Yarn Plug'n'Play", () => {
  it("finds a package through the project's map, whatever node_modules above it holds", async () => {
    const react = await findPackage(at("app"), "react")

    expect(react?.manifest.version).toBe("19.2.0")
    expect(react?.dir).toBe(at("app", ".yarn", "unpacked", "react"))
    expect(react?.installedAt).toBe(at("app", ".pnp.cjs"))
  })

  it("finds it for a file deeper in the project", async () => {
    expect((await findPackage(at("app", "src", "components"), "react"))?.manifest.version).toBe("19.2.0")
  })

  it("doesn't fall back to node_modules for a package the map doesn't give", async () => {
    expect(await findPackage(at("app"), "lodash")).toBeUndefined()
  })

  it("reads a project the map doesn't include from node_modules", async () => {
    expect(pnpProject(at("app", "legacy"))).toBeUndefined()
    expect((await findPackage(at("app", "legacy"), "react"))?.manifest.version).toBe("17.0.2")
  })

  it("reads the map again once Yarn rewrites it, as installing a package does", async () => {
    write("app/.yarn/unpacked/zod/package.json", JSON.stringify({ name: "zod", version: "4.1.0" }))

    expect(await findPackage(at("app"), "zod")).toBeUndefined()

    write(
      "app/.pnp.cjs",
      runtime.replace("const packages = {", 'const packages = { zod: path.join(app, ".yarn", "unpacked", "zod"),')
    )
    // The rewrite is told apart by when it was written, which within a test can be the same millisecond.
    utimesSync(at("app", ".pnp.cjs"), new Date(), new Date(Date.now() + 5000))

    expect((await findPackage(at("app"), "zod"))?.manifest.version).toBe("4.1.0")
  })

  it("finds a package's dependency when the package is kept outside the project, as in Yarn's global cache", async () => {
    const cache = at("cache", "tailwind-vite")

    write("cache/tailwind-vite/package.json", JSON.stringify({ name: "tailwind-vite", version: "4.2.0" }))
    write("cache/tailwind-node/package.json", JSON.stringify({ name: "tailwind-node", version: "4.2.0" }))
    write("global/package.json", JSON.stringify({ name: "global" }))
    write(
      "global/.pnp.cjs",
      `const path = require("node:path")
const cache = ${JSON.stringify(at("cache"))}
const owns = (location) => path.resolve(location).startsWith(__dirname) || path.resolve(location).startsWith(cache)
module.exports = {
  setup() {},
  findPackageLocator: (location) => (owns(location) ? { name: "global", reference: "workspace:." } : null),
  resolveToUnqualified(request, issuer) {
    if (owns(issuer)) return path.join(cache, request) + path.sep
    throw new Error(request + " isn't a dependency of " + issuer)
  }
}
`
    )

    expect((await findPackage(at("global"), "tailwind-vite"))?.dir).toBe(cache)
    expect((await findPackage(cache, "tailwind-node"))?.manifest.version).toBe("4.2.0")
  })

  it("forgets a project whose runtime is gone, still finding packages through the others", async () => {
    write("gone/package.json", JSON.stringify({ name: "gone" }))
    write(
      "gone/.pnp.cjs",
      "module.exports = { setup() {}, findPackageLocator: () => null, resolveToUnqualified() {} }\n"
    )

    expect(pnpProject(at("gone"))).toBeUndefined()

    rmSync(at("gone"), { recursive: true })

    expect((await findPackage(at("cache", "tailwind-vite"), "tailwind-node"))?.manifest.version).toBe("4.2.0")
  })

  it("gives Node the runtime, and the loader when Yarn wrote one, after the options it had", () => {
    const runtime = `--require "${at("app", ".pnp.cjs").replaceAll("\\", "/")}"`

    expect(pnpNodeOptions(at("app"))).toBe(runtime)
    expect(pnpNodeOptions(at("app"), "--max-old-space-size=4096")).toBe(`--max-old-space-size=4096 ${runtime}`)

    write("app/.pnp.loader.mjs", "export {}\n")

    expect(pnpNodeOptions(at("app"))).toBe(
      `${runtime} --experimental-loader ${pathToFileURL(at("app", ".pnp.loader.mjs")).href}`
    )
  })

  it("gives Node nothing for a project installed with node_modules", () => {
    expect(pnpNodeOptions(at("app", "legacy"), "--inspect")).toBeUndefined()
    expect(pnpNodeOptions(root)).toBeUndefined()
  })
})
