import { defaultModeSettings, type ProjectRoute } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { routeRows, routeScreens, samplePath } from "./route-boards.ts"

function route(id: string, path: string, parent: string | undefined, index = false): ProjectRoute {
  return { id, path, parent, file: `src/routes/${id}.tsx`, params: [], index, loads: false, guards: false }
}

// The example project's routes, as the TanStack Router adapter lists them.
const example = [
  route("__root__", "/", undefined),
  route("/", "/", "__root__", true),
  route("/pricing", "/pricing", "__root__"),
  route("/settings", "/settings", "__root__"),
  route("/settings/", "/settings", "/settings", true),
  route("/settings/billing", "/settings/billing", "/settings"),
  route("/settings/profile", "/settings/profile", "/settings"),
  route("/projects/", "/projects", "__root__", true),
  route("/projects/$projectId", "/projects/$projectId", "__root__")
]

const layout = { origin: "http://127.0.0.1:5173", x: 0, y: 0, width: 1280, height: 800, gap: 100, rowGap: 300 }

describe("routeRows", () => {
  it("makes a row for each layout, with its pages, indexes first", () => {
    const rows = routeRows(example, layout)

    expect(rows.map((row) => [row.label, row.boards.map((board) => board.url)])).toEqual([
      [
        "/",
        [
          "http://127.0.0.1:5173/",
          "http://127.0.0.1:5173/projects",
          "http://127.0.0.1:5173/pricing",
          "http://127.0.0.1:5173/projects/projectId"
        ]
      ],
      [
        "/settings",
        [
          "http://127.0.0.1:5173/settings",
          "http://127.0.0.1:5173/settings/billing",
          "http://127.0.0.1:5173/settings/profile"
        ]
      ]
    ])
  })

  it("places pages side by side and rows one under another", () => {
    const [first, second] = routeRows(example, layout)

    expect(first?.boards.map(({ x, y }) => [x, y])).toEqual([
      [0, 0],
      [1380, 0],
      [2760, 0],
      [4140, 0]
    ])
    expect(second?.y).toBe(1100)
  })

  it("names a pathless layout's row by its id", () => {
    const rows = routeRows(
      [route("__root__", "/", undefined), route("/_auth", "/", "__root__"), route("/_auth/team", "/team", "/_auth")],
      layout
    )

    expect(rows.map((row) => row.label)).toEqual(["/_auth"])
  })

  it("has no rows for an app with no routes", () => {
    expect(routeRows([], layout)).toEqual([])
  })
})

describe("samplePath", () => {
  it("fills each param with its name and leaves a splat empty", () => {
    expect(samplePath({ path: "/team/$teamId/files/$" })).toBe("/team/teamId/files/")
  })
})

describe("routeScreens", () => {
  const screens = routeScreens(
    [route("__root__", "/", undefined), { ...route("/pricing", "/pricing", "__root__"), component: "Pricing" }],
    defaultModeSettings,
    { ...layout, bottom: -400 }
  )

  it("makes a locked screen for each page, named for its component, with its rows ending above the designs", () => {
    expect(
      screens.map(({ screen, url }) => [screen.id, screen.name, screen.kind, screen.locked, screen.position, url])
    ).toEqual([["route:/pricing", "Pricing", "screen", true, { x: 0, y: -1500 }, "http://127.0.0.1:5173/pricing"]])
  })

  it("makes each viewport's frame as tall as its screen", () => {
    expect(screens[0]?.screen.frames).toEqual({
      desktop: { height: 800 },
      tablet: { height: 1024 },
      mobile: { height: 844 }
    })
  })
})
