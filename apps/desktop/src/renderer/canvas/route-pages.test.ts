import { defaultModeSettings, type ProjectRoute } from "@parity-app/core"
import { createProjectDoc } from "@parity-app/multiplayer"
import { loroReplicas } from "@parity-app/multiplayer-loro"
import { describe, expect, it } from "vite-plus/test"
import { copiesOf, copyLayers, routePageDesign, routePages, routePageTarget, setCopyLayers } from "./route-pages.ts"

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
