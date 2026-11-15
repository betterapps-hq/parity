import { readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { readExtension } from "@parity-app/extensions"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { isPage, projectRoutes, routeOf } from "./extension.ts"
import { readRoutes } from "./routes.ts"

describe("the TanStack Router extension", () => {
  it("has a manifest Parity accepts, and gives its supported versions by its peer dependency", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.activates).toEqual(["onDetect"])
    // A router around every frame, so components with a link draw on their own (PAR-1152).
    expect(found.manifest.contributes.providers?.router?.decorators?.map(({ wrap }) => wrap.component)).toEqual([
      "RouterContextProvider"
    ])
    expect(found.manifest.contributes.nodeTypes?.map((type) => type.id)).toEqual(["route"])
    expect(found.versions).toEqual({ packages: ["@tanstack/react-router"], range: "^1.0.0" })
    // It reads the route tree and route files through Parity's files API, wherever the router's config puts them.
    expect(found.manifest.permissions?.read).toEqual(["**"])
  })

  it("offers Open in browser only for routes", () => {
    const { menus } = readExtension(packageJson).manifest.contributes

    for (const items of Object.values(menus ?? {})) {
      expect(items).toEqual([{ command: "tanstack-router.open", when: "node.type == route" }])
    }
  })
})

describe("isPage", () => {
  const route = { file: "src/routes/x.tsx", index: false, loads: false, guards: false }

  it("counts every route but the root, which only holds the others", () => {
    expect(isPage({ ...route, id: "__root__", kind: "root", segments: [], path: "/" })).toBe(false)

    expect(
      isPage({
        ...route,
        id: "/projects/$projectId",
        kind: "page",
        segments: [
          { type: "static", value: "projects" },
          { type: "param", name: "projectId" }
        ],
        path: "/projects/$projectId",
        parent: "__root__"
      })
    ).toBe(true)
  })
})

describe("routeOf", () => {
  const page = { owner: "tanstack-router", type: "route", key: "/settings" }

  it("opens the page it was run for", () => {
    expect(routeOf({ type: "route", key: "/settings" }, [])).toEqual(page)
  })

  it("opens the page selected when it's run from Search actions", () => {
    expect(routeOf(undefined, [{ owner: "design", type: "design", key: "app.par#home" }, page])).toEqual(page)
  })

  it("opens nothing for a component or a layer", () => {
    expect(routeOf({ type: "component", key: "Button" }, [page])).toBeUndefined()
  })
})

describe("projectRoutes", () => {
  const example = join(import.meta.dirname, "../../../examples/shadcn-vite")

  it("reads the routes through Parity's files API, a round at a time, as from the files themselves", async () => {
    const asked: string[] = []

    const read = async (path: string) => {
      asked.push(path)

      return readFile(join(example, path), "utf8")
    }

    const routes = await projectRoutes(read)

    const sync = readRoutes((path) => {
      try {
        return readFileSync(join(example, path), "utf8")
      } catch {
        return undefined
      }
    })

    expect(routes).toEqual(sync)
    expect(routes.length).toBeGreaterThan(1)
    // Each file is asked for once, however many rounds it takes.
    expect(new Set(asked).size).toBe(asked.length)
  })

  it("reads code-based routes a round at a time too, as app H's (PAR-1156)", async () => {
    const appH = join(import.meta.dirname, "../../../examples/rsbuild-chakra")
    const routes = await projectRoutes((path) => readFile(join(appH, path), "utf8"))

    expect(routes.map(({ id, file }) => [id, file])).toEqual([
      ["__root__", "src/components/AppShell.tsx"],
      ["/", "src/routes/Home.tsx"],
      ["/settings", "src/routes/Settings.tsx"]
    ])
  })

  it("has no routes when there's no route tree", async () => {
    const read = () => Promise.reject(new Error("missing"))

    expect(await projectRoutes(read)).toEqual([])
  })
})
