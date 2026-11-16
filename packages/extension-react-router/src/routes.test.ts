import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { Route } from "@parity-app/extension-api"
import { describe, expect, it } from "vite-plus/test"
import type { ProjectFiles } from "./config.ts"
import { appDirectoryOf, fullPath, moduleFacts, readRoutes, segmentsOf } from "./routes.ts"

/** The names of the params a route's URL takes, in order. */
function params(route: Pick<Route, "segments">): string[] {
  return route.segments.flatMap((segment) => (segment.type === "static" ? [] : [segment.name]))
}

/** Reads files from a folder by their path from it, as the extension reads a project's through Parity. */
function folderFiles(root: string): ProjectFiles {
  return {
    read: (path) => readFile(join(root, path), "utf8").catch(() => undefined),
    list: (folder) =>
      readdir(join(root, folder), { withFileTypes: true }).then(
        (entries) => entries.map((entry) => ({ name: entry.name, folder: entry.isDirectory() })),
        () => []
      )
  }
}

/** Reads files from a record of their texts by path. */
function recordFiles(files: Record<string, string>): ProjectFiles {
  return {
    read: (path) => Promise.resolve(files[path]),
    list: (folder) =>
      Promise.resolve(
        [
          ...new Set(
            Object.keys(files)
              .filter((path) => path.startsWith(`${folder}/`))
              .map((path) => path.slice(folder.length + 1).split("/")[0] ?? "")
          )
        ].map((name) => ({ name, folder: Object.keys(files).some((path) => path.startsWith(`${folder}/${name}/`)) }))
      )
  }
}

/** The fields of a route the first test compares. */
function pick({ id, path, parent, file, index }: Route) {
  return { id, path, parent, file, index }
}

describe("readRoutes", () => {
  it("reads the validation project's routes, each parent before its children", async () => {
    const found = await readRoutes(folderFiles(join(import.meta.dirname, "../../../fixtures/react-router-framework")))

    expect(found.mode).toBe("framework")
    expect(found.unread).toEqual([])
    expect(found.routes.slice(0, 9).map((route) => ({ ...pick(route), params: params(route) }))).toEqual([
      { id: "root", path: "/", parent: undefined, file: "app/root.tsx", params: [], index: false },
      {
        id: "layouts/marketing",
        path: "/",
        parent: "root",
        file: "app/layouts/marketing.tsx",
        params: [],
        index: false
      },
      {
        id: "routes/home",
        path: "/",
        parent: "layouts/marketing",
        file: "app/routes/home.tsx",
        params: [],
        index: true
      },
      {
        id: "routes/pricing",
        path: "/pricing",
        parent: "layouts/marketing",
        file: "app/routes/pricing.tsx",
        params: [],
        index: false
      },
      {
        id: "routes/about",
        path: "/:lang?/about",
        parent: "layouts/marketing",
        file: "app/routes/about.tsx",
        params: ["lang"],
        index: false
      },
      {
        id: "layouts/projects",
        path: "/projects",
        parent: "root",
        file: "app/layouts/projects.tsx",
        params: [],
        index: false
      },
      {
        id: "routes/projects/index",
        path: "/projects",
        parent: "layouts/projects",
        file: "app/routes/projects/index.tsx",
        params: [],
        index: true
      },
      {
        id: "routes/projects/project",
        path: "/projects/:projectId",
        parent: "layouts/projects",
        file: "app/routes/projects/project.tsx",
        params: ["projectId"],
        index: false
      },
      {
        id: "layouts/settings",
        path: "/settings",
        parent: "root",
        file: "app/layouts/settings.tsx",
        params: [],
        index: false
      }
    ])
    // The settings come from file names, in the order React Router's flatRoutes gives them, longest name first.
    expect(
      found.routes
        .slice(9)
        .map(
          (route) =>
            `${route.id} ${route.path}${route.index ? " (index)" : ""} < ${route.parent} [${params(route).join(",")}]`
        )
    ).toEqual([
      "settings/($team).billing /settings/:team?/billing < layouts/settings [team]",
      "settings/members_.invite /settings/members/invite < layouts/settings []",
      "settings/_secure /settings < layouts/settings []",
      "settings/_secure.security /settings/security < settings/_secure []",
      "settings/files.$ /settings/files/* < layouts/settings [*]",
      "settings/members /settings/members < layouts/settings []",
      "settings/members.$memberId /settings/members/:memberId < settings/members [memberId]",
      "settings/members._index /settings/members (index) < settings/members []",
      "settings/profile /settings/profile < layouts/settings []",
      "settings/_index /settings (index) < layouts/settings []",
      "routes/docs /docs/* < root [*]",
      "routes/not-found /* < root [*]"
    ])
    // A route with routes inside is a layout, or a group when it adds nothing to the URL.
    expect(found.routes.filter((route) => route.kind !== "page").map((route) => `${route.id} ${route.kind}`)).toEqual([
      "root root",
      "layouts/marketing group",
      "layouts/projects layout",
      "layouts/settings layout",
      "settings/_secure group",
      "settings/members layout"
    ])
  })

  it("reads what each of the example's route modules says: its component and whether it loads data", async () => {
    const found = await readRoutes(folderFiles(join(import.meta.dirname, "../../../fixtures/react-router-framework")))
    const byId = new Map(found.routes.map((route) => [route.id, route]))

    expect(byId.get("root")).toMatchObject({ component: "App", loads: false, guards: false })
    expect(byId.get("routes/projects/project")).toMatchObject({ component: "Project", loads: true })
    expect(byId.get("settings/_secure.security")).toMatchObject({ component: "Security", loads: false })
  })

  it("reads routes.ts from the folder react-router.config names", async () => {
    const found = await readRoutes(
      recordFiles({
        "react-router.config.ts": `export default { appDirectory: "./source", ssr: false }`,
        "source/root.tsx": `export default function Root() {}`,
        "source/routes.ts": `import { index } from "@react-router/dev/routes"\nexport default [index("home.tsx")]`,
        "source/home.tsx": `export default function Home() {}`
      })
    )

    expect(found.routes.map((route) => [route.id, route.file, route.component])).toEqual([
      ["root", "source/root.tsx", "Root"],
      ["home", "source/home.tsx", "Home"]
    ])
  })

  it("reads resource routes, which have no default export, whichever way one is written, as API routes, but keeps one with pages inside as their layout (PAR-1173, PAR-1174)", async () => {
    const found = await readRoutes(
      recordFiles({
        "app/root.tsx": `export default function Root() {}`,
        "app/routes.ts": `
          import { index, route } from "@react-router/dev/routes"
          export default [
            index("home.tsx"),
            route("api/report", "report.ts"),
            route("sitemap.xml", "sitemap.ts"),
            route("feeds", "feeds.ts", [route("rss", "rss.ts")]),
            route("account", "account.ts", [route("profile", "profile.tsx")]),
            route("about", "about.tsx"),
            route("legal", "legal.tsx"),
            route("help", "help.tsx"),
            route("faq", "faq.tsx"),
            route("blog", "blog.tsx"),
            route("missing", "missing.tsx"),
            route("cjs", "cjs.ts")
          ]
        `,
        "app/home.tsx": `export default function Home() {}`,
        "app/report.ts": `export async function loader() { return Response.json({}) }`,
        "app/sitemap.ts": `export const loader = () => new Response("<urlset />")`,
        "app/feeds.ts": `export async function loader() {}`,
        "app/rss.ts": `export async function action() {}`,
        "app/account.ts": `export async function loader() {}`,
        "app/profile.tsx": `export default function Profile() {}`,
        "app/about.tsx": `function About() {}\nexport { About as default }`,
        "app/legal.tsx": `export default () => null`,
        "app/help.tsx": `export { default } from "./pages/help"`,
        "app/faq.tsx": `export default class Faq {}`,
        // `export *` never passes a default on, so React Router finds none and serves it as a resource route.
        "app/blog.tsx": `export * from "./pages/blog"`,
        "app/cjs.ts": `export = { loader }`
      })
    )

    expect(found.routes.map((route) => [route.id, route.kind])).toEqual([
      ["root", "root"],
      ["home", "page"],
      ["report", "api"],
      ["sitemap", "api"],
      // A resource route with only resource routes inside is one too.
      ["feeds", "api"],
      ["rss", "api"],
      ["account", "layout"],
      ["profile", "page"],
      ["about", "page"],
      ["legal", "page"],
      ["help", "page"],
      ["faq", "page"],
      ["blog", "api"],
      // A module that can't be read isn't known to be a resource route, so it's a page.
      ["missing", "page"],
      ["cjs", "api"]
    ])
  })

  it("finds library mode's routes from the entry index.html names, through the files it imports", async () => {
    const found = await readRoutes(
      recordFiles({
        "index.html": `<div id="root"></div><script type="module" src="/src/main.tsx"></script>`,
        "src/main.tsx": `import { App } from "./App"\nimport "./index.css"\ncreateRoot(root).render(<App />)`,
        "src/App.tsx": `
          import { Route, Routes } from "react-router"
          import { Projects } from "./pages/Projects"
          export function App() {
            return <Routes><Route path="/" element={<Projects />}><Route path=":id" element={<Project />} /></Route></Routes>
          }
          function Project() { return null }
        `,
        "src/pages/Projects.tsx": `export function Projects() {}`
      })
    )

    expect(found.mode).toBe("library")
    expect(found.routes).toEqual([
      {
        id: "root",
        kind: "root",
        segments: [],
        path: "/",
        file: "src/App.tsx",
        index: false,
        loads: false,
        guards: false
      },
      {
        id: "0",
        kind: "layout",
        segments: [],
        path: "/",
        parent: "root",
        file: "src/pages/Projects.tsx",
        index: false,
        component: "Projects",
        loads: false,
        guards: false
      },
      {
        id: "0-0",
        kind: "page",
        segments: [{ type: "param", name: "id" }],
        path: "/:id",
        parent: "0",
        file: "src/App.tsx",
        index: false,
        component: "Project",
        loads: false,
        guards: false
      }
    ])
  })

  it("finds nothing when routes are only made while the app runs", async () => {
    const found = await readRoutes(recordFiles({ "src/main.tsx": `createRoot(root).render(<App />)` }))

    expect(found).toEqual({ routes: [], mode: "none", unread: [] })
  })
})

describe("fullPath", () => {
  it("puts a route's path under its parent's, keeps an absolute one, and gives a layout or index its parent's", () => {
    expect(fullPath("/", "pricing")).toBe("/pricing")
    expect(fullPath("/projects", ":projectId")).toBe("/projects/:projectId")
    expect(fullPath("/docs", "/docs/guides/")).toBe("/docs/guides")
    expect(fullPath("/settings", undefined)).toBe("/settings")
  })
})

describe("segmentsOf", () => {
  it("reads params, optional ones without their mark, and a splat as a catch-all named *", () => {
    expect(segmentsOf("/:lang?/projects/:projectId/files/*")).toEqual([
      { type: "param", name: "lang" },
      { type: "static", value: "projects" },
      { type: "param", name: "projectId" },
      { type: "static", value: "files" },
      { type: "catchAll", name: "*" }
    ])
    expect(segmentsOf("/")).toEqual([])
  })
})

describe("moduleFacts", () => {
  it("reads the default export's name, loaders, middleware and a loader that always redirects", () => {
    expect(
      moduleFacts(`
        export const middleware = [auth]
        export async function clientLoader() { throw redirect("/settings/profile") }
        export default function Settings() {}
      `)
    ).toEqual({ component: "Settings", loads: true, guards: true, redirect: "/settings/profile" })

    expect(moduleFacts(`const Page = () => null\nexport default Page`)).toEqual({
      component: "Page",
      loads: false,
      guards: false
    })
  })
})

describe("appDirectoryOf", () => {
  it("is app unless react-router.config names another folder", () => {
    expect(appDirectoryOf(undefined)).toBe("app")
    expect(appDirectoryOf({ text: `export default { ssr: true } satisfies Config` })).toBe("app")
    expect(appDirectoryOf({ text: `export default { appDirectory: "src/app" }` })).toBe("src/app")
  })
})
