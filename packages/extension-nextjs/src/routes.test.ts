import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import type { Route } from "@parity-app/extension-api"
import { describe, expect, it } from "vite-plus/test"
import { pickFolders, readRoutes, routerFolders, sourceFiles } from "./routes.ts"

/** A project's routes from its files, each given by its path and, for a page or a layout, its text. */
function routesOf(tree: Record<string, string>): Route[] {
  const files = Object.keys(tree)
  const folders = pickFolders(files)
  const texts = Object.fromEntries(sourceFiles(files, folders).map((file) => [file, tree[file] ?? ""]))

  return readRoutes(files, folders, texts)
}

/** A project folder's files under its router folders, with their texts, as the extension reads them. */
function folderTree(root: string): Record<string, string> {
  const files = [...routerFolders.app, ...routerFolders.pages].flatMap((folder) =>
    existsSync(join(root, folder))
      ? readdirSync(join(root, folder), { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => relative(root, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
      : []
  )

  return Object.fromEntries(files.map((file) => [file, readFileSync(join(root, file), "utf8")]))
}

/** Each route by its id, with only the fields a test looks at. */
function summary(routes: Route[], ...fields: (keyof Route)[]) {
  return routes.map((route) => Object.fromEntries([["id", route.id], ...fields.map((field) => [field, route[field]])]))
}

describe("pickFolders", () => {
  it("finds the App Router's and the Pages Router's folders at the project's root", () => {
    expect(pickFolders(["app/page.tsx", "pages/about.tsx"])).toEqual({ app: "app", pages: "pages" })
  })

  it("finds them in src/ when neither is at the root", () => {
    expect(pickFolders(["src/app/page.tsx", "src/pages/about.tsx"])).toEqual({ app: "src/app", pages: "src/pages" })
  })

  it("ignores src/ once a router folder is at the root, as Next.js does", () => {
    expect(pickFolders(["pages/index.tsx", "src/app/page.tsx"])).toEqual({ pages: "pages" })
  })

  it("finds nothing in a folder without a route file", () => {
    expect(pickFolders(["app/globals.css", "pages/README.md"])).toEqual({})
  })
})

describe("readRoutes for the App Router", () => {
  const app = {
    "app/layout.tsx": "export default function RootLayout({ children }) { return children }",
    "app/page.tsx": "export default function Home() { return <main /> }",
    "app/not-found.tsx": "",
    "app/globals.css": "",
    "app/about/page.tsx": "export default function About() {}",
    "app/blog/layout.tsx": "export default function BlogLayout({ children }) { return children }",
    "app/blog/page.tsx": "export default async function BlogIndex() { const posts = await getPosts() }",
    "app/blog/loading.tsx": "",
    "app/blog/[slug]/page.tsx":
      "import { notFound } from 'next/navigation'\nexport default function Post() { notFound() }",
    "app/blog/[slug]/error.tsx": "",
    "app/docs/[...slug]/page.tsx": "",
    "app/shop/[[...filters]]/page.tsx": "",
    "app/(marketing)/layout.tsx": "export default function MarketingLayout({ children }) { return children }",
    "app/(marketing)/pricing/page.tsx": "const Pricing = () => null\nexport default Pricing",
    "app/(legal)/terms/page.tsx": "",
    "app/_components/Nav.tsx": "",
    "app/_components/page.tsx": "",
    "app/api/health/route.ts": "",
    "app/about/page.test.tsx": ""
  }

  it("reads layouts, pages and groups, each parent before its children", () => {
    expect(summary(routesOf(app), "kind", "path", "parent", "index")).toEqual([
      { id: "app/layout", kind: "root", path: "/", parent: undefined, index: false },
      { id: "app/page", kind: "page", path: "/", parent: "app/layout", index: true },
      { id: "app/(marketing)/layout", kind: "group", path: "/", parent: "app/layout", index: false },
      { id: "app/about/page", kind: "page", path: "/about", parent: "app/layout", index: false },
      { id: "app/blog/layout", kind: "layout", path: "/blog", parent: "app/layout", index: false },
      { id: "app/blog/page", kind: "page", path: "/blog", parent: "app/blog/layout", index: true },
      { id: "app/(legal)/terms/page", kind: "page", path: "/terms", parent: "app/layout", index: false },
      {
        id: "app/(marketing)/pricing/page",
        kind: "page",
        path: "/pricing",
        parent: "app/(marketing)/layout",
        index: false
      },
      { id: "app/blog/[slug]/page", kind: "page", path: "/blog/[slug]", parent: "app/blog/layout", index: false },
      { id: "app/docs/[...slug]/page", kind: "page", path: "/docs/[...slug]", parent: "app/layout", index: false },
      {
        id: "app/shop/[[...filters]]/page",
        kind: "page",
        path: "/shop/[[...filters]]",
        parent: "app/layout",
        index: false
      }
    ])
  })

  it("writes params, catch-alls and optional catch-alls as segments, leaving groups out of the URL", () => {
    const segments = Object.fromEntries(routesOf(app).map((route) => [route.id, route.segments]))

    expect(segments["app/blog/[slug]/page"]).toEqual([
      { type: "static", value: "blog" },
      { type: "param", name: "slug" }
    ])
    expect(segments["app/docs/[...slug]/page"]).toEqual([
      { type: "static", value: "docs" },
      { type: "catchAll", name: "slug" }
    ])
    expect(segments["app/shop/[[...filters]]/page"]).toEqual([
      { type: "static", value: "shop" },
      { type: "optionalCatchAll", name: "filters" }
    ])
    expect(segments["app/(marketing)/pricing/page"]).toEqual([{ type: "static", value: "pricing" }])
    expect(segments["app/(marketing)/layout"]).toEqual([])
  })

  it("names each route's file, component, and whether it loads or can refuse", () => {
    const routes = Object.fromEntries(routesOf(app).map((route) => [route.id, route]))

    expect(routes["app/layout"]).toMatchObject({ file: "app/layout.tsx", component: "RootLayout", loads: false })
    expect(routes["app/blog/page"]).toMatchObject({ component: "BlogIndex", loads: true, guards: false })
    expect(routes["app/blog/[slug]/page"]).toMatchObject({ component: "Post", loads: false, guards: true })
    expect(routes["app/(marketing)/pricing/page"]).toMatchObject({ component: "Pricing" })
    expect(routes["app/docs/[...slug]/page"]?.component).toBeUndefined()
  })

  it("gives loading, error and not-found files to their folder's layout, else its page", () => {
    const states = Object.fromEntries(
      routesOf(app)
        .filter((route) => route.stateFiles)
        .map((route) => [route.id, route.stateFiles])
    )

    expect(states).toEqual({
      "app/layout": { notFound: "app/not-found.tsx" },
      "app/blog/layout": { loading: "app/blog/loading.tsx" },
      "app/blog/[slug]/page": { error: "app/blog/[slug]/error.tsx" }
    })
  })

  it("leaves out private folders, route handlers and files that aren't routes", () => {
    const files = routesOf(app).map((route) => route.file)

    expect(files.some((file) => file.includes("_components") || file.includes("api/") || file.includes(".test."))).toBe(
      false
    )
  })

  it("reads src/app, and names a root layout Next.js would write itself by its folder", () => {
    expect(summary(routesOf({ "src/app/page.tsx": "" }), "kind", "file", "parent", "index")).toEqual([
      { id: "src/app", kind: "root", file: "src/app", parent: undefined, index: false },
      { id: "src/app/page", kind: "page", file: "src/app/page.tsx", parent: "src/app", index: true }
    ])
  })

  it("gives a parallel route's slot to every route in it, and leaves @children out of the slots", () => {
    const routes = routesOf({
      "app/layout.tsx": "",
      "app/dashboard/layout.tsx": "",
      "app/dashboard/page.tsx": "",
      "app/dashboard/@team/page.tsx": "",
      "app/dashboard/@team/settings/page.tsx": "",
      "app/dashboard/@team/default.tsx": "",
      "app/dashboard/@children/inbox/page.tsx": ""
    })

    expect(summary(routes, "path", "parent", "slot")).toEqual([
      { id: "app/layout", path: "/", parent: undefined, slot: undefined },
      { id: "app/dashboard/layout", path: "/dashboard", parent: "app/layout", slot: undefined },
      { id: "app/dashboard/page", path: "/dashboard", parent: "app/dashboard/layout", slot: undefined },
      { id: "app/dashboard/@team/page", path: "/dashboard", parent: "app/dashboard/layout", slot: "team" },
      {
        id: "app/dashboard/@children/inbox/page",
        path: "/dashboard/inbox",
        parent: "app/dashboard/layout",
        slot: undefined
      },
      {
        id: "app/dashboard/@team/settings/page",
        path: "/dashboard/settings",
        parent: "app/dashboard/layout",
        slot: "team"
      }
    ])
  })

  it("leaves out a layout with no page under it, or only a parallel route's, moving what's inside it up", () => {
    const routes = routesOf({
      "app/layout.tsx": "",
      "app/page.tsx": "",
      "app/drafts/layout.tsx": "",
      "app/inbox/layout.tsx": "",
      "app/inbox/@preview/page.tsx": ""
    })

    expect(summary(routes, "parent", "slot")).toEqual([
      { id: "app/layout", parent: undefined, slot: undefined },
      { id: "app/page", parent: "app/layout", slot: undefined },
      { id: "app/inbox/@preview/page", parent: "app/layout", slot: "preview" }
    ])
  })

  it("points an intercepting route at the page it shows in place of, by the URL it matches", () => {
    const routes = routesOf({
      "app/layout.tsx": "",
      "app/photo/[id]/page.tsx": "",
      "app/feed/page.tsx": "",
      "app/feed/(..)photo/[id]/page.tsx": "",
      "app/feed/@modal/(.)comments/page.tsx": "",
      "app/shop/items/(...)photo/[id]/page.tsx": "",
      "app/shop/items/(..)(..)feed/page.tsx": ""
    })

    expect(
      summary(
        routes.filter((route) => route.intercepts !== undefined),
        "path",
        "intercepts",
        "slot"
      )
    ).toEqual([
      { id: "app/feed/(..)photo/[id]/page", path: "/photo/[id]", intercepts: "app/photo/[id]/page", slot: undefined },
      { id: "app/feed/@modal/(.)comments/page", path: "/feed/comments", intercepts: "/feed/comments", slot: "modal" },
      { id: "app/shop/items/(..)(..)feed/page", path: "/feed", intercepts: "app/feed/page", slot: undefined },
      {
        id: "app/shop/items/(...)photo/[id]/page",
        path: "/photo/[id]",
        intercepts: "app/photo/[id]/page",
        slot: undefined
      }
    ])
  })
})

describe("readRoutes for the Turbopack example app", () => {
  it("reads its src/app routes: a group's home page, a nested layout, a catch-all and loading files", () => {
    const routes = routesOf(folderTree(join(import.meta.dirname, "../../../fixtures/nextjs-turbopack")))

    expect(summary(routes, "kind", "path", "parent", "index", "component", "stateFiles")).toEqual([
      {
        id: "src/app/layout",
        kind: "root",
        path: "/",
        parent: undefined,
        index: false,
        component: "RootLayout",
        stateFiles: { notFound: "src/app/not-found.tsx" }
      },
      {
        id: "src/app/(dashboard)/layout",
        kind: "group",
        path: "/",
        parent: "src/app/layout",
        index: false,
        component: "DashboardLayout",
        stateFiles: { loading: "src/app/(dashboard)/loading.tsx" }
      },
      {
        id: "src/app/(dashboard)/page",
        kind: "page",
        path: "/",
        parent: "src/app/(dashboard)/layout",
        index: true,
        component: "Dashboard",
        stateFiles: undefined
      },
      {
        id: "src/app/projects/layout",
        kind: "layout",
        path: "/projects",
        parent: "src/app/layout",
        index: false,
        component: "ProjectsLayout",
        stateFiles: undefined
      },
      {
        id: "src/app/docs/[...slug]/page",
        kind: "page",
        path: "/docs/[...slug]",
        parent: "src/app/layout",
        index: false,
        component: "Doc",
        stateFiles: undefined
      },
      {
        id: "src/app/projects/[id]/page",
        kind: "page",
        path: "/projects/[id]",
        parent: "src/app/projects/layout",
        index: false,
        component: "Project",
        stateFiles: { loading: "src/app/projects/[id]/loading.tsx" }
      }
    ])
  })
})

describe("readRoutes for the Pages Router", () => {
  const pages = {
    "pages/_app.tsx": "export default function App({ Component, pageProps }) {}",
    "pages/_document.tsx": "",
    "pages/_error.tsx": "",
    "pages/404.tsx": "",
    "pages/index.tsx": "export default function Home() {}",
    "pages/about.tsx": "",
    "pages/blog/index.tsx": "export const getStaticProps = async () => ({ props: {} })\nexport default Blog",
    "pages/blog/[slug].tsx":
      "export async function getServerSideProps() { return { notFound: true } }\nexport default function Post() {}",
    "pages/docs/[...slug].tsx": "",
    "pages/shop/[[...filters]].tsx": "",
    "pages/api/hello.ts": "",
    "pages/api.ts": "",
    "pages/about.module.css": ""
  }

  it("reads each file as a page under _app, its path without index", () => {
    expect(summary(routesOf(pages), "kind", "path", "parent", "index")).toEqual([
      { id: "pages/_app", kind: "root", path: "/", parent: undefined, index: false },
      { id: "pages/index", kind: "page", path: "/", parent: "pages/_app", index: true },
      { id: "pages/about", kind: "page", path: "/about", parent: "pages/_app", index: false },
      { id: "pages/blog/index", kind: "page", path: "/blog", parent: "pages/_app", index: false },
      { id: "pages/blog/[slug]", kind: "page", path: "/blog/[slug]", parent: "pages/_app", index: false },
      { id: "pages/docs/[...slug]", kind: "page", path: "/docs/[...slug]", parent: "pages/_app", index: false },
      {
        id: "pages/shop/[[...filters]]",
        kind: "page",
        path: "/shop/[[...filters]]",
        parent: "pages/_app",
        index: false
      }
    ])
  })

  it("gives _app the 404 and error pages, and reads what each page loads", () => {
    const routes = Object.fromEntries(routesOf(pages).map((route) => [route.id, route]))

    expect(routes["pages/_app"]).toMatchObject({
      file: "pages/_app.tsx",
      component: "App",
      stateFiles: { error: "pages/_error.tsx", notFound: "pages/404.tsx" }
    })
    expect(routes["pages/blog/index"]).toMatchObject({ component: "Blog", loads: true, guards: false })
    expect(routes["pages/blog/[slug]"]).toMatchObject({ component: "Post", loads: true, guards: true })
    expect(routes["pages/blog/[slug]"]?.segments).toEqual([
      { type: "static", value: "blog" },
      { type: "param", name: "slug" }
    ])
  })

  it("names the root by its folder without an _app", () => {
    expect(summary(routesOf({ "src/pages/index.jsx": "" }), "kind", "file")).toEqual([
      { id: "src/pages", kind: "root", file: "src/pages" },
      { id: "src/pages/index", kind: "page", file: "src/pages/index.jsx" }
    ])
  })
})

describe("readRoutes for a project with both routers", () => {
  it("holds the Pages Router's pages in _app, a group inside the App Router's root layout", () => {
    const routes = routesOf({
      "app/layout.tsx": "",
      "app/page.tsx": "",
      "app/dashboard/page.tsx": "",
      "pages/_app.tsx": "",
      "pages/404.tsx": "",
      "pages/legacy/[id].tsx": "",
      "pages/about.tsx": ""
    })

    expect(summary(routes, "kind", "path", "parent", "stateFiles")).toEqual([
      { id: "app/layout", kind: "root", path: "/", parent: undefined, stateFiles: undefined },
      { id: "app/page", kind: "page", path: "/", parent: "app/layout", stateFiles: undefined },
      { id: "app/dashboard/page", kind: "page", path: "/dashboard", parent: "app/layout", stateFiles: undefined },
      { id: "pages/_app", kind: "group", path: "/", parent: "app/layout", stateFiles: { notFound: "pages/404.tsx" } },
      { id: "pages/about", kind: "page", path: "/about", parent: "pages/_app", stateFiles: undefined },
      { id: "pages/legacy/[id]", kind: "page", path: "/legacy/[id]", parent: "pages/_app", stateFiles: undefined }
    ])
  })

  it("puts the Pages Router's pages under the root itself without an _app", () => {
    const routes = routesOf({ "src/app/layout.tsx": "", "src/app/page.tsx": "", "src/pages/about.tsx": "" })

    expect(summary(routes, "parent")).toEqual([
      { id: "src/app/layout", parent: undefined },
      { id: "src/app/page", parent: "src/app/layout" },
      { id: "src/pages/about", parent: "src/app/layout" }
    ])
  })

  it("gives no routes without a page in either folder", () => {
    expect(routesOf({ "app/globals.css": "", "src/components/Button.tsx": "" })).toEqual([])
  })
})
