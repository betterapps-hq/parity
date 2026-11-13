import { defaultModeSettings, type ProjectRoute, resolveMode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  pageFrameName,
  pageLinkLine,
  pageLinksLit,
  pageName,
  type PageNode,
  pageTree,
  placePages,
  routeLayers,
  routeScreens,
  samplePath
} from "./route-boards.ts"

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

/** A tree as each page's route id, with the pages under it. */
function pageIds(tree: readonly PageNode[]): unknown[] {
  return tree.map((node) => (node.children.length === 0 ? node.route.id : [node.route.id, pageIds(node.children)]))
}

const layout = { origin: "http://127.0.0.1:5173", x: 0, y: 0, width: 1000, height: 800, gap: 100, levelGap: 300 }

describe("pageTree", () => {
  it("hangs each layout's pages from its index, with the root's index at the top", () => {
    expect(pageIds(pageTree(example))).toEqual([
      [
        "/",
        ["/pricing", "/projects/", "/projects/$projectId", ["/settings/", ["/settings/billing", "/settings/profile"]]]
      ]
    ])
  })

  it("hangs a layout's pages from the page above when it has no index", () => {
    const routes = [
      route("__root__", "/", undefined),
      route("/", "/", "__root__", true),
      route("/_auth", "/", "__root__"),
      route("/_auth/team", "/team", "/_auth")
    ]

    expect(pageIds(pageTree(routes))).toEqual([["/", ["/_auth/team"]]])
  })

  it("is a forest when the root has no index, and empty without routes", () => {
    expect(pageIds(pageTree([route("__root__", "/", undefined), route("/a", "/a", "__root__")]))).toEqual(["/a"])
    expect(pageTree([])).toEqual([])
  })
})

describe("placePages", () => {
  it("centers each page over the pages under it, a level below", () => {
    const placed = placePages(pageTree(example.slice(0, 7)), layout)

    expect(placed.map(({ route, x, y, parent }) => [route.id, x, y, parent])).toEqual([
      ["/", 1100, 0, undefined],
      ["/pricing", 0, 1100, "/"],
      ["/settings/", 1650, 1100, "/"],
      ["/settings/billing", 1100, 2200, "/settings/"],
      ["/settings/profile", 2200, 2200, "/settings/"]
    ])
  })

  it("gives each page its URL with a sample for each param", () => {
    const urls = placePages(pageTree(example), layout).map((page) => page.url)

    expect(urls).toContain("http://127.0.0.1:5173/projects/projectId")
    expect(urls).toContain("http://127.0.0.1:5173/settings")
  })
})

describe("samplePath", () => {
  it("fills each param with its name and leaves a splat empty", () => {
    expect(samplePath({ path: "/team/$teamId/files/$" })).toBe("/team/teamId/files/")
  })
})

describe("routeScreens", () => {
  const screens = routeScreens(
    [
      route("__root__", "/", undefined),
      { ...route("/", "/", "__root__", true), component: "App" },
      { ...route("/pricing", "/pricing", "__root__"), component: "Pricing" }
    ],
    defaultModeSettings,
    { ...layout, bottom: -400 }
  )

  it("makes a screen for each page, named for its component, with the screen it hangs from, ending above the designs", () => {
    expect(screens.map(({ screen, url, parent }) => [screen.id, screen.name, screen.position, url, parent])).toEqual([
      ["route:/", "App", { x: 0, y: -2600 }, "http://127.0.0.1:5173/", undefined],
      ["route:/pricing", "Pricing", { x: 0, y: -1500 }, "http://127.0.0.1:5173/pricing", "route:/"]
    ])
  })

  it("makes each viewport's frame as tall as its screen", () => {
    expect(screens[0]?.screen.frames).toEqual({
      desktop: { height: 800 },
      tablet: { height: 1024 },
      mobile: { height: 844 }
    })
  })
})

describe("pageName", () => {
  it("writes a page's component in words, else its path's last part, else Home", () => {
    expect(pageName({ component: "ProjectDetail", path: "/projects/$projectId" })).toBe("Project detail")
    expect(pageName({ path: "/settings" })).toBe("Settings")
    expect(pageName({ path: "/team/$teamId" })).toBe("Team")
    expect(pageName({ path: "/" })).toBe("Home")
  })
})

describe("routeLayers", () => {
  it("nests a Route layer for each route that draws the page, the root's outermost", () => {
    const routes = [
      { ...route("__root__", "/", undefined), component: "RootLayout" },
      { ...route("/settings", "/settings", "__root__"), component: "SettingsLayout" },
      { ...route("/settings/billing", "/settings/billing", "/settings"), component: "Billing" }
    ]

    expect(routeLayers(routes, routes[2]!)).toEqual({
      type: "route",
      id: "route:__root__",
      name: "RootLayout",
      route: "__root__",
      component: "RootLayout",
      children: [
        {
          type: "route",
          id: "route:%2Fsettings",
          name: "SettingsLayout",
          route: "/settings",
          component: "SettingsLayout",
          children: [
            {
              type: "route",
              id: "route:%2Fsettings%2Fbilling",
              name: "Billing",
              route: "/settings/billing",
              component: "Billing",
              children: []
            }
          ]
        }
      ]
    })
  })

  it("names a route without a component by its path", () => {
    const routes = [route("__root__", "/", undefined), route("/settings/", "/settings", "__root__", true)]

    expect(routeLayers(routes, routes[1]!).name).toBe("/")
  })
})

describe("pageFrameName", () => {
  const mode = (id: string) =>
    resolveMode(
      defaultModeSettings,
      defaultModeSettings.modes.find((each) => each.id === id)!
    )

  it("names a frame with its mode's classes, attributes and scheme", () => {
    expect(JSON.parse(pageFrameName(mode("desktop-dark")).slice("parity:".length))).toEqual({
      classes: ["dark"],
      attributes: { lang: "en", dir: "ltr" },
      scheme: "dark"
    })
    expect(JSON.parse(pageFrameName(mode("desktop-light")).slice("parity:".length))).toMatchObject({ scheme: "light" })
  })
})

describe("pageLinkLine", () => {
  const above = { x: 0, y: 0, w: 1280, h: 800 }
  const below = { x: 1440, y: 1900, w: 1280, h: 800 }

  it("curves across above the lower page's title, then drops straight down to the middle of its top edge", () => {
    // Up close a title is 42 screen pixels tall, and the curve ends 8 above it.
    expect(pageLinkLine(above, below, 1)).toBe("M 640 800 C 640 1325, 2080 1325, 2080 1850 L 2080 1900")
  })

  it("turns down further above the page zoomed out, where its title takes more of the canvas", () => {
    // At 10% a name draws at 60%, so a title is 25.2 screen pixels tall: 252 pixels of the canvas, and 8 screen
    // pixels are 80. The curve ends at 1568.
    expect(pageLinkLine(above, below, 0.1)).toMatch(/2080 1568(\.\d+)? L 2080 1900$/)
  })

  it("curves all the way to the page once its title reaches up to the page above", () => {
    expect(pageLinkLine(above, below, 0.02)).toBe("M 640 800 C 640 1350, 2080 1350, 2080 1900")
  })
})

describe("pageLinksLit", () => {
  // The example's tree: App holds Pricing and Settings, and Settings holds Billing and Profile.
  const links = [
    { from: "app", to: "pricing" },
    { from: "app", to: "settings" },
    { from: "settings", to: "billing" },
    { from: "settings", to: "profile" }
  ]

  it("lights a page's way up to the top of the tree and the lines to the pages right under it", () => {
    expect(pageLinksLit(links, ["settings"])).toEqual(new Set(["settings", "billing", "profile"]))
    expect(pageLinksLit(links, ["billing"])).toEqual(new Set(["billing", "settings"]))
  })

  it("lights what each of several pages lights, as a selected page and a hovered one", () => {
    expect(pageLinksLit(links, ["pricing", "profile"])).toEqual(new Set(["pricing", "profile", "settings"]))
  })

  it("lights nothing for no page, or a page outside the tree", () => {
    expect(pageLinksLit(links, [undefined, "a design"])).toEqual(new Set())
  })
})
