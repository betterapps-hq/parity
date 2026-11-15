import { describe, expect, it } from "vite-plus/test"
import { type LibraryRoute, readLibraryRoutes } from "./library.ts"

/** Each route as `id path component module` with its children indented. */
function outline(routes: LibraryRoute[] = [], depth = 0): string[] {
  return routes.flatMap((route) => [
    [
      `${"  ".repeat(depth)}${route.id}`,
      route.index ? "(index)" : route.path,
      route.component,
      route.module,
      route.loads ? "loads" : undefined,
      route.redirect ? `→ ${route.redirect}` : undefined
    ]
      .filter((part) => part !== undefined)
      .join(" "),
    ...outline(route.children, depth + 1)
  ])
}

describe("readLibraryRoutes", () => {
  it("reads createBrowserRouter's route objects, with React Router's ids from where each sits", () => {
    const { routes, unread } = readLibraryRoutes(
      `
      import { createBrowserRouter, Navigate } from "react-router"
      import Root from "./root"
      import { Home } from "./routes/home"
      import { Project, projectLoader } from "./routes/project"

      function Settings() { return null }

      export const router = createBrowserRouter([
        {
          path: "/",
          element: <Root />,
          children: [
            { index: true, Component: Home },
            { path: "projects/:projectId", element: <Project />, loader: projectLoader },
            { path: "settings", id: "settings", Component: Settings },
            { path: "old", element: <Navigate to="/projects" replace /> },
            { path: "reports/*", lazy: () => import("./routes/reports") },
          ],
        },
      ])
    `,
      "src/main.tsx"
    )

    expect(unread).toEqual([])
    expect(outline(routes)).toEqual([
      "0 / Root ./root",
      "  0-0 (index) Home ./routes/home",
      "  0-1 projects/:projectId Project ./routes/project loads",
      "  settings settings Settings",
      "  0-3 old → /projects",
      "  0-4 reports/* ./routes/reports"
    ])
  })

  it("reads <Route> elements in <Routes>", () => {
    const { routes } = readLibraryRoutes(
      `
      import { Route, Routes } from "react-router"
      import { Layout } from "./layout"
      import { About } from "./about"

      export function App() {
        return (
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="about" element={<About />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        )
      }
    `,
      "src/App.tsx"
    )

    expect(outline(routes)).toEqual([
      "0 Layout ./layout",
      "  0-0 (index) Home",
      "  0-1 about About ./about",
      "1 * NotFound"
    ])
  })

  it("reads createRoutesFromElements, and a route array declared in the file", () => {
    expect(
      outline(
        readLibraryRoutes(
          `
          const router = createBrowserRouter(
            createRoutesFromElements(<Route path="/" element={<Root />}><Route path="team" element={<Team />} /></Route>)
          )
        `,
          "src/main.tsx"
        ).routes
      )
    ).toEqual(["0 / Root", "  0-0 team Team"])

    expect(
      outline(
        readLibraryRoutes(
          `
          const routes = [{ path: "/", Component: Home }]
          export default function App() { return useRoutes(routes) }
        `,
          "src/App.tsx"
        ).routes
      )
    ).toEqual(["0 / Home"])
  })

  it("takes a loader's redirect only when it always runs", () => {
    const { routes } = readLibraryRoutes(
      `
      createBrowserRouter([
        { path: "/", loader: () => redirect("/projects") },
        { path: "/start", loader: async () => { throw redirect("/welcome") } },
        { path: "/guarded", loader: async () => { if (!user) throw redirect("/login"); return null } },
      ])
    `,
      "src/main.tsx"
    )

    expect(routes?.map((route) => route.redirect)).toEqual(["/projects", "/welcome", undefined])
  })

  it("names routes made while the app runs, and finds none in a file without any", () => {
    expect(readLibraryRoutes(`createBrowserRouter(routes.map(toRoute))`, "src/main.tsx")).toEqual({
      routes: [],
      unread: ["src/main.tsx makes its routes with routes.map(toRoute)"]
    })

    expect(readLibraryRoutes(`export const answer = 42`, "src/main.tsx")).toEqual({ unread: [] })
  })
})
