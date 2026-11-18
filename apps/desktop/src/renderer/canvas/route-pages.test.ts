import { defaultModeSettings, type ProjectRoute } from "@parity-app/core"
import { createProjectDoc, setPosition, updateView } from "@parity-app/multiplayer"
import { loroReplicas } from "@parity-app/multiplayer-loro"
import { describe, expect, it } from "vite-plus/test"
import {
  copiesOf,
  copyLayers,
  followPageViews,
  routePageDesign,
  routePages,
  routePagesFile,
  routePageTarget,
  setCopyLayers
} from "./route-pages.ts"

function route(id: string, path: string, parent: string | undefined): ProjectRoute {
  return {
    id,
    kind: parent === undefined ? "root" : "page",
    segments: path
      .split("/")
      .filter((part) => part !== "")
      .map((value) => ({ type: "static", value })),
    path,
    parent,
    file: `src/routes/${id}.tsx`,
    index: false,
    loads: false,
    guards: false
  }
}

describe("routePageTarget (PAR-1095)", () => {
  it("finds a route's page by the design key routePageDesign gives, as Open in browser does", () => {
    const [pages] = routePages({
      id: "shop",
      routes: [route("__root__", "/", undefined), route("/pricing", "/pricing", "__root__")],
      guestUrl: "http://localhost:5173/",
      documents: [],
      modes: { settings: defaultModeSettings, custom: false },
      sources: {}
    })

    const key = routePageDesign("shop", "/pricing")
    const container = pages?.document.containers.find((design) => key?.endsWith(`#${design.id}`))

    expect(container && routePageTarget("shop", container)).toEqual({
      route: "/pricing",
      url: "http://localhost:5173/pricing"
    })
  })
})

describe("copyLayers (PAR-1262)", () => {
  it("keeps a copy's layers for its own project, never another's with the same route", () => {
    const open = () =>
      loroReplicas.open({
        files: [{ path: "app.par", document: { version: 4, containers: [] } }],
        main: "app.par",
        modes: defaultModeSettings
      })

    const shop = createProjectDoc(open().a, { undoLimit: 10, main: "app.par" })
    const blog = createProjectDoc(open().a, { undoLimit: 10, main: "app.par" })
    const design = "pricing"
    const layers = [{ id: "0", type: "layout" as const, name: "main", children: [] }]

    setCopyLayers(shop, design, layers)

    expect(copiesOf(copyLayers.get(), shop).get(design)).toEqual(layers)
    expect(copiesOf(copyLayers.get(), blog).get(design)).toBeUndefined()
  })
})

describe("followPageViews (PAR-1317)", () => {
  const info = {
    id: "boards",
    guestUrl: "http://localhost:5173/",
    documents: [],
    modes: { settings: defaultModeSettings, custom: false },
    sources: {}
  }

  const routes = [
    route("__root__", "/", undefined),
    route("/login", "/login", "__root__"),
    route("/pricing", "/pricing", "__root__"),
    route("/signup", "/signup", "__root__")
  ]

  const opened = () => {
    const [pages] = routePages({ ...info, routes })

    const replicas = loroReplicas.open({
      files: [{ path: "app.par", document: { version: 4, containers: [] } }, pages!],
      main: "app.par",
      modes: defaultModeSettings
    })

    const doc = createProjectDoc(replicas.a, { undoLimit: 10, main: "app.par" })
    const stop = followPageViews(doc, info, () => routes)

    const box = (id: string) => {
      const design = doc.design(`${routePagesFile}#route:${id}`)!

      return { x: design.position.x }
    }

    return { doc, stop, box }
  }

  it("moves the pages beside one aside when it shows more modes side by side, and back when it shows fewer", () => {
    const { doc, stop, box } = opened()
    const login = box("/login").x
    const signup = box("/signup").x
    // Login, Pricing and Sign up sit side by side, 1280 wide with 160 between them.
    expect([login, box("/pricing").x, signup]).toEqual([login, login + 1440, login + 2880])

    updateView(doc, `${routePagesFile}#route:/login`, "Show modes", (view) => ({
      ...view,
      modes: ["desktop-dark", "tablet-light", "mobile-light"]
    }))

    // Login's board now holds four frames side by side, so Pricing starts past its right edge.
    const wide = box("/pricing").x - box("/login").x - 160
    expect(wide).toBeGreaterThan(2 * 1280)
    expect(box("/signup").x - box("/pricing").x).toBe(1440)

    updateView(doc, `${routePagesFile}#route:/login`, "Hide modes", ({ modes: _, ...view }) => view)

    expect([box("/login").x, box("/pricing").x, box("/signup").x]).toEqual([login, login + 1440, signup])
    stop()
  })

  it("leaves a page the person moved where they put it, when the new layout doesn't move it", () => {
    const { doc, stop, box } = opened()
    const key = `${routePagesFile}#route:/signup`
    setPosition(doc, key, { x: 9000, y: 0 })

    // Sign up is the last page, so showing more of its own modes moves nothing beside it.
    updateView(doc, key, "Show modes", (view) => ({ ...view, modes: ["desktop-dark"] }))

    expect(box("/signup").x).toBe(9000)
    stop()
  })
})
