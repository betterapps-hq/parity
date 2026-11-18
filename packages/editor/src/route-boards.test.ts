import { defaultModeSettings, type ProjectRoute, resolveMode, type RouteSegment } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  pageFrameUrl,
  pageGroupBox,
  pageMode,
  landedElsewhere,
  pageLinkLine,
  pageLinkPieces,
  pageLinksLit,
  pageName,
  type PageNode,
  pageTree,
  placePages,
  projectHost,
  routeLayers,
  withCopyLayers,
  routeScreens,
  routeTree,
  samplePath
} from "./route-boards.ts"

/** A path's parts, written here as the example's router writes them: `$name` is a param and a lone `$` a catch-all. */
function segments(path: string): RouteSegment[] {
  return path
    .split("/")
    .filter((part) => part !== "")
    .map((part): RouteSegment => {
      if (part === "$") {
        return { type: "catchAll", name: "_splat" }
      }

      return part.startsWith("$") ? { type: "param", name: part.slice(1) } : { type: "static", value: part }
    })
}

function route(id: string, path: string, parent: string | undefined, index = false): ProjectRoute {
  return {
    id,
    kind: parent === undefined ? "root" : "page",
    segments: segments(path),
    path,
    parent,
    file: `src/routes/${id}.tsx`,
    index,
    loads: false,
    guards: false
  }
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

/** The example's routes with its `/settings` index's redirect, which the adapter reads from its `beforeLoad`. */
const redirecting = example.map((each) =>
  each.id === "/settings/" ? { ...each, redirect: "/settings/profile" } : each
)

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

  it("makes a layout a group around its pages when its index only redirects", () => {
    const tree = pageTree(redirecting)

    expect(pageIds(tree)).toEqual([
      [
        "/",
        ["/pricing", "/projects/", "/projects/$projectId", ["/settings", ["/settings/billing", "/settings/profile"]]]
      ]
    ])
    expect(tree[0]?.children[3]?.group).toEqual({ redirect: "/settings/profile" })
  })

  it("keeps an index that redirects but draws something as the layout's page", () => {
    const drawing = redirecting.map((each) => (each.id === "/settings/" ? { ...each, component: "Settings" } : each))

    expect(pageTree(drawing)[0]?.children[3]?.route.id).toBe("/settings/")
  })

  it("makes a layout without an index a group around its pages", () => {
    const routes = [
      route("__root__", "/", undefined),
      route("/", "/", "__root__", true),
      route("/_auth", "/", "__root__"),
      route("/_auth/team", "/team", "/_auth")
    ]

    const tree = pageTree(routes)

    expect(pageIds(tree)).toEqual([["/", [["/_auth", ["/_auth/team"]]]]])
    expect(tree[0]?.children[0]?.group).toEqual({})
  })

  it("is a forest when the root has no index, and empty without routes", () => {
    expect(pageIds(pageTree([route("__root__", "/", undefined), route("/a", "/a", "__root__")]))).toEqual(["/a"])
    expect(pageTree([])).toEqual([])
  })

  it("leaves out a parallel route's slot and an intercepting route, with the routes inside them", () => {
    const routes = [
      route("root", "/", undefined),
      route("/feed", "/feed", "root"),
      { ...route("/@modal", "/", "root"), slot: "modal" },
      route("/@modal/login", "/login", "/@modal"),
      { ...route("/(.)photo/[id]", "/photo/$id", "root"), intercepts: "/photo/[id]" },
      route("/photo/[id]", "/photo/$id", "root")
    ]

    expect(pageIds(pageTree(routes))).toEqual(["/feed", "/photo/[id]"])
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

  it("puts a group's pages side by side inside it, on its own level, and centers the page above over the group", () => {
    const routes = redirecting.filter((each) => !each.id.startsWith("/p"))
    const placed = placePages(pageTree(routes), layout)

    // The group is as wide as its two pages, 100 apart, and 48 more on each side: 2196.
    expect(placed.map(({ route, x, y, parent, group }) => [route.id, x, y, parent, group?.width])).toEqual([
      ["/", 598, 0, undefined, undefined],
      ["/settings", 0, 1100, "/", 2196],
      ["/settings/billing", 48, 1100, "/settings", undefined],
      ["/settings/profile", 1148, 1100, "/settings", undefined]
    ])
  })

  it("moves the pages beside a wider page aside, and the level under a taller page down (PAR-1317)", () => {
    // Pricing shows three more modes beside its main frame, so its board is 3200 wide and 1000 tall.
    const size = (route: ProjectRoute) =>
      route.id === "/pricing" ? { width: 3200, height: 1000 } : { width: layout.width, height: layout.height }

    const placed = placePages(pageTree(example.slice(0, 7)), { ...layout, size })

    expect(placed.map(({ route, x, y }) => [route.id, x, y])).toEqual([
      ["/", 2200, 0],
      ["/pricing", 0, 1100],
      ["/settings/", 3850, 1100],
      ["/settings/billing", 3300, 2400],
      ["/settings/profile", 4400, 2400]
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
    expect(samplePath({ segments: segments("/team/$teamId/files/$") })).toBe("/team/teamId/files/")
  })

  it("fills a param with the value given for it, written as a URL writes it", () => {
    expect(samplePath({ segments: segments("/team/$teamId/files/$") }, { teamId: "acme co", _splat: "a/b" })).toBe(
      "/team/acme%20co/files/a%2Fb"
    )
    expect(samplePath({ segments: segments("/projects/$projectId") }, { projectId: "" })).toBe("/projects/projectId")
  })

  it("leaves an optional catch-all empty without a value, and fills it with one", () => {
    const docs = {
      segments: [
        { type: "static", value: "docs" },
        { type: "optionalCatchAll", name: "slug" }
      ]
    } as const

    expect(samplePath({ segments: [...docs.segments] })).toBe("/docs/")
    expect(samplePath({ segments: [...docs.segments] }, { slug: "intro" })).toBe("/docs/intro")
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

  it("gives a page's frames no size of their own, so each is as wide as its viewport and as tall as the page", () => {
    expect(screens[0]?.screen.frames).toBeUndefined()
  })
})

describe("routeTree", () => {
  const { screens, groups } = routeTree(
    redirecting.filter((each) => !each.id.startsWith("/p")),
    { ...layout, bottom: -400 }
  )

  it("makes a group for a layout without a page, hanging from the page above, with the page its index redirects to", () => {
    expect(groups).toEqual([
      {
        id: "route:/settings",
        name: "Settings",
        path: "/settings",
        route: "/settings",
        x: 0,
        y: -1500,
        width: 2196,
        parent: "route:/",
        redirect: { screen: "route:/settings/profile", path: "/settings/profile" }
      }
    ])
  })

  it("hangs the group's pages from the group, and makes no screen for the layout", () => {
    expect(screens.map(({ screen, parent }) => [screen.id, parent])).toEqual([
      ["route:/", undefined],
      ["route:/settings/billing", "route:/settings"],
      ["route:/settings/profile", "route:/settings"]
    ])
  })

  it("names a pathless layout's group for its component, since its path is its parent's", () => {
    const routes = [
      route("__root__", "/", undefined),
      route("/", "/", "__root__", true),
      { ...route("/_auth", "/", "__root__"), component: "AuthLayout" },
      route("/_auth/team", "/team", "/_auth")
    ]

    expect(routeTree(routes, { ...layout, bottom: 0 }).groups.map(({ name, path }) => [name, path])).toEqual([
      ["Auth layout", "/"]
    ])
  })
})

describe("pageGroupBox", () => {
  const billing = { x: 48, y: 1100, w: 1280, h: 800 }
  const profile = { x: 1488, y: 1100, w: 1280, h: 2000 }

  it("goes round its pages and their titles, 48 from its sides and bottom, with its header above", () => {
    // Up close a title is 42 above its board and the header 56 above that.
    expect(
      pageGroupBox(
        [
          { box: billing, titled: true },
          { box: profile, titled: true }
        ],
        1
      )
    ).toEqual({
      x: 0,
      y: 1100 - 42 - 56,
      w: 2816,
      h: 3100 + 48 - (1100 - 98)
    })
  })

  it("goes round a group inside it at its own top, which has its name inside", () => {
    const inner = { x: 100, y: 500, w: 400, h: 400 }

    expect(pageGroupBox([{ box: inner, titled: false }], 1)).toEqual({ x: 52, y: 444, w: 496, h: 504 })
  })

  it("is no box with nothing inside", () => {
    expect(pageGroupBox([], 1)).toBeUndefined()
  })
})

describe("landedElsewhere", () => {
  it("gives the path a page landed on when it isn't the page's own", () => {
    expect(landedElsewhere("http://localhost:5173/settings", "/settings/profile")).toBe("/settings/profile")
  })

  it("gives nothing for the page's own path, with or without a trailing slash", () => {
    expect(landedElsewhere("http://localhost:5173/projects/", "/projects")).toBeUndefined()
    expect(landedElsewhere("http://localhost:5173/", "/")).toBeUndefined()
  })
})

describe("pageName", () => {
  it("writes a page's component in words, else its path's last part, else Home", () => {
    expect(pageName({ component: "ProjectDetail", segments: segments("/projects/$projectId") })).toBe("Project detail")
    expect(pageName({ segments: segments("/settings") })).toBe("Settings")
    expect(pageName({ segments: segments("/team/$teamId") })).toBe("Team")
    expect(pageName({ segments: [] })).toBe("Home")
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

describe("withCopyLayers", () => {
  it("puts what the copy drew inside the innermost route that draws the page", () => {
    const routes = [
      { ...route("__root__", "/", undefined), component: "RootLayout" },
      { ...route("/pricing", "/pricing", "__root__"), component: "Pricing" }
    ]

    const drawn = { type: "layout" as const, id: "0", name: "main", style: {}, children: [] }

    const root = withCopyLayers(routeLayers(routes, routes[1]!), [drawn])

    expect(root.type === "route" && root.children?.[0]).toMatchObject({ name: "Pricing", children: [drawn] })
  })
})

describe("pageMode", () => {
  const mode = (id: string) =>
    resolveMode(
      defaultModeSettings,
      defaultModeSettings.modes.find((each) => each.id === id)!
    )

  it("gives a mode's classes, attributes and scheme, as the app's page draws in them", () => {
    expect(pageMode(mode("desktop-dark"))).toEqual({
      classes: ["dark"],
      attributes: { lang: "en", dir: "ltr" },
      scheme: "dark"
    })
    expect(pageMode(mode("desktop-light"))).toMatchObject({ scheme: "light" })
  })
})

describe("pageFrameUrl", () => {
  it("loads a page under its project's own .localhost name, on its builder's port", () => {
    const url = pageFrameUrl("http://127.0.0.1:5173/settings?tab=team", "D:/code/copacker")

    expect(url).toMatch(/^http:\/\/p[0-9a-f]{16}\.localhost:5173\/settings\?tab=team$/)
    expect(pageFrameUrl("http://127.0.0.1:5173/", "D:/code/copacker")).toBe(url.replace("/settings?tab=team", "/"))
  })

  it("gives each project a name of its own", () => {
    expect(projectHost("D:/code/copacker")).not.toBe(projectHost("D:/code/harbor"))
    expect(projectHost("/Users/sam/app")).toMatch(/^p[0-9a-f]{16}$/)
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

  it("curves all the way to a group's top edge, as a group has its name inside it", () => {
    expect(pageLinkLine(above, below, 1, true)).toBe("M 640 800 C 640 1350, 2080 1350, 2080 1900")
  })

  it("curves all the way to the page once its title reaches up to the page above", () => {
    expect(pageLinkLine(above, below, 0.02)).toBe("M 640 800 C 640 1350, 2080 1350, 2080 1900")
  })
})

describe("pageLinkPieces", () => {
  const above = { x: 0, y: 0, w: 1280, h: 800 }
  const near = { x: 1440, y: 1900, w: 1280, h: 800 }
  const far = { x: 60000, y: 1900, w: 1280, h: 800 }

  const points = ({ path }: { path: string }) =>
    path
      .slice(2)
      .split(" L ")
      .map((pair) => pair.split(" ").map(Number))

  const length = (piece: { path: string }) =>
    points(piece).reduce(
      (sum, [x, y], i, all) => (i === 0 ? 0 : sum + Math.hypot(x - all[i - 1][0], y - all[i - 1][1])),
      0
    )

  it("draws a short line as one piece, from the board above to the top of the board below", () => {
    const pieces = pageLinkPieces(above, near, 1)

    expect(pieces).toHaveLength(1)
    expect(points(pieces[0]).at(0)).toEqual([640, 800])
    expect(points(pieces[0]).at(-1)).toEqual([2080, 1900])
  })

  it("cuts a long line into pieces 2,400 screen pixels long, a whole number of dashes, each starting where the last ends", () => {
    for (const zoom of [1, 0.6, 0.2]) {
      const pieces = pageLinkPieces(above, far, zoom)

      expect(pieces.length).toBeGreaterThan(1)

      for (const [i, piece] of pieces.slice(0, -1).entries()) {
        expect(length(piece) * zoom).toBeCloseTo(2400, 1)
        expect(points(pieces[i + 1])[0]).toEqual(points(piece).at(-1))
      }

      expect(points(pieces.at(-1) ?? { path: "" }).at(-1)).toEqual([60640, 1900])
    }
  })

  it("gives each piece the box round it", () => {
    for (const piece of pageLinkPieces(above, far, 0.6)) {
      for (const [x, y] of points(piece)) {
        expect(x).toBeGreaterThanOrEqual(piece.box.x - 0.01)
        expect(x).toBeLessThanOrEqual(piece.box.x + piece.box.w + 0.01)
        expect(y).toBeGreaterThanOrEqual(piece.box.y - 0.01)
        expect(y).toBeLessThanOrEqual(piece.box.y + piece.box.h + 0.01)
      }
    }
  })

  it("follows the curve within half a screen pixel", () => {
    // The cubic's middle, by symmetry, is halfway across and halfway down its bend.
    const [piece] = pageLinkPieces(above, near, 1)
    const middle = { x: 1360, y: 1325 }

    const closest = Math.min(
      ...points(piece)
        .slice(1)
        .map(([x, y], i) => {
          const [fx, fy] = points(piece)[i]
          const t = Math.max(
            0,
            Math.min(1, ((middle.x - fx) * (x - fx) + (middle.y - fy) * (y - fy)) / ((x - fx) ** 2 + (y - fy) ** 2))
          )

          return Math.hypot(middle.x - (fx + t * (x - fx)), middle.y - (fy + t * (y - fy)))
        })
    )

    expect(closest).toBeLessThan(0.5)
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
