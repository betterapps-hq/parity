import { describe, expect, it } from "vite-plus/test"
import {
  exportNames,
  isAppRouteFile,
  isPagesRouteFile,
  projectPageFiles,
  projectSpecifier,
  routeFolders,
  segmentLiterals
} from "./project-pages.ts"

const text = (files: { path: string; text: string }[], path: string) => files.find((file) => file.path === path)?.text

describe("the project's pages in the guest app", () => {
  it("reads routes from the root's folders, or from src/ when neither router's is at the root", () => {
    expect(routeFolders(["app", "pages", "src/app"])).toEqual({ app: "app", pages: "pages" })
    expect(routeFolders(["pages", "src/app"])).toEqual({ pages: "pages" })
    expect(routeFolders(["src/app", "src/pages"])).toEqual({ app: "src/app", pages: "src/pages" })
    expect(routeFolders([])).toEqual({})
  })

  it("mirrors the App Router's conventions, whatever their page extension, and nothing beside them", () => {
    expect(isAppRouteFile("app/blog/[slug]/page.tsx")).toBe(true)
    expect(isAppRouteFile("app/layout.js")).toBe(true)
    expect(isAppRouteFile("app/api/route.ts")).toBe(true)
    expect(isAppRouteFile("app/docs/page.page.tsx")).toBe(true)
    expect(isAppRouteFile("app/docs/page.mdx")).toBe(true)
    expect(isAppRouteFile("app/_components/Card.tsx")).toBe(false)
    expect(isAppRouteFile("app/globals.css")).toBe(false)
    expect(isAppRouteFile("app/page.d.ts")).toBe(false)
    expect(isPagesRouteFile("pages/about.tsx")).toBe(true)
    expect(isPagesRouteFile("pages/styles.module.css")).toBe(false)
  })

  it("puts App Router files in the project's route group and Pages Router files in pages/", () => {
    const files = projectPageFiles({ app: "src/app", pages: "src/pages" }, [
      { path: "src/app/layout.tsx", text: "export default function Layout() {}" },
      { path: "src/app/(shop)/cart/page.tsx", text: '"use client"\nexport default function Cart() {}' },
      { path: "src/app/globals.css", text: "body {}" },
      { path: "src/pages/_app.tsx", text: "export default function App() {}" },
      { path: "src/pages/blog/[slug].tsx", text: "export default function Post() {}" }
    ])

    expect(files.map((file) => file.path)).toEqual([
      "app/(project)/layout.tsx",
      "app/(project)/(shop)/cart/page.tsx",
      "pages/_app.tsx",
      "pages/blog/[slug].tsx"
    ])
    expect(text(files, "app/(project)/(shop)/cart/page.tsx")).toContain(
      'export { default } from "../../../../../../src/app/(shop)/cart/page"'
    )
    expect(text(files, "pages/blog/[slug].tsx")).toContain(
      'export { default } from "../../../../src/pages/blog/[slug]"'
    )
  })

  it("re-exports a route's named exports, and copies its segment config when it's a literal", () => {
    const [page] = projectPageFiles({ app: "app" }, [
      {
        path: "app/blog/page.tsx",
        text: [
          'export const dynamic = "force-dynamic"',
          "export const revalidate = compute()",
          "export async function generateMetadata() {}",
          "export type Props = {}",
          "export default async function Blog() {}"
        ].join("\n")
      }
    ])

    expect(page!.text.split("\n").slice(1)).toEqual([
      'export { default } from "../../../../../app/blog/page"',
      'export { revalidate, generateMetadata } from "../../../../../app/blog/page"',
      'export const dynamic = "force-dynamic"',
      ""
    ])
  })

  it("leaves a page's config out of the Pages Router's re-exports, as Next reads it from the page itself", () => {
    const [api, page] = projectPageFiles({ pages: "pages" }, [
      {
        path: "pages/api/upload.ts",
        text: "export const config = { api: { bodyParser: false } }\nexport default function handler() {}"
      },
      {
        path: "pages/about.tsx",
        text: "export const config = { amp: true }\nexport default function About() {}"
      }
    ])

    // An API route's config is read as it answers, for its body parser.
    expect(api!.text).toContain('export { config } from "../../../../pages/api/upload"')
    expect(page!.text).not.toContain("config")
    expect(
      projectPageFiles({ pages: "pages" }, [
        {
          path: "pages/about.tsx",
          text: "export default function About() {}\nexport async function getServerSideProps() {}"
        }
      ])[0]!.text
    ).toContain('export { getServerSideProps } from "../../../pages/about"')
  })

  it("imports the project's file without its extension, unless it's MDX", () => {
    expect(projectSpecifier("app/(project)/page.tsx", "app/page.tsx")).toBe("../../../../app/page")
    expect(projectSpecifier("app/(project)/docs/page.mdx", "app/docs/page.mdx")).toBe(
      "../../../../../app/docs/page.mdx"
    )
    expect(projectSpecifier("pages/index.page.tsx", "pages/index.page.tsx")).toBe("../../../pages/index.page")
  })

  it("reads a module's exports from declarations and lists, leaving out types and comments", () => {
    const source = [
      "// export const commented = 1",
      "export { a, b as c, type D } from './x'",
      "export type { E } from './y'",
      "export function* gen() {}",
      "export class Shape {}",
      "const f = 1",
      "export { f as default }"
    ].join("\n")

    expect(exportNames(source)).toEqual(["a", "c", "gen", "Shape", "default"])
  })

  it("reads every binding a variable statement exports: each declarator, and what a pattern destructures", () => {
    const source = [
      "export const { GET, POST: post, ...rest } = handlers",
      "export const [first, , second = 2] = pair",
      'export const PUT = handler, DELETE = make({ a: 1, b: "x, y" });',
      "export let one = 1,",
      "  two = 2",
      "export const three = {",
      "  four: 4",
      "}"
    ].join("\n")

    expect(exportNames(source)).toEqual([
      "GET",
      "post",
      "rest",
      "first",
      "second",
      "PUT",
      "DELETE",
      "one",
      "two",
      "three"
    ])
  })

  it("reads type arguments and annotations as types, not further bindings", () => {
    const source = [
      "export const GET = createHandler<Request, Response>(handler)",
      "export const POST: Handler<Request, Context> = handler",
      "export declare const ambient: string",
      "export interface Props { a: string }"
    ].join("\n")

    expect(exportNames(source)).toEqual(["GET", "POST"])
  })

  it("leaves segment config in a comment out", () => {
    const source = ["/*", 'export const dynamic = "force-static"', "*/", 'export const dynamic = "force-dynamic"'].join(
      "\n"
    )

    expect(segmentLiterals(source)).toEqual([["dynamic", '"force-dynamic"']])
    expect(segmentLiterals('// export const revalidate = 60\nexport const runtime = "edge"')).toEqual([
      ["runtime", '"edge"']
    ])
  })

  it("copies segment config whose value is a literal", () => {
    expect(
      segmentLiterals(
        [
          "export const revalidate = 60;",
          "export const runtime: string = 'edge'",
          "export const preferredRegion = ['iad1'] as const",
          "export const dynamicParams = flag",
          "export const title = 'not config'"
        ].join("\n")
      )
    ).toEqual([
      ["revalidate", "60"],
      ["runtime", "'edge'"],
      ["preferredRegion", "['iad1']"]
    ])
  })

  it("copies segment config with a comment after it, or an array over several lines, and not an expression", () => {
    expect(
      segmentLiterals(
        [
          "export const dynamic = 'force-dynamic' // reads cookies",
          "export const fetchCache = 'force-no-store' /* no cache */",
          "export const preferredRegion = [",
          "  'iad1',",
          "  'sfo1'",
          "]",
          "export const revalidate = 60 * 2"
        ].join("\n")
      )
    ).toEqual([
      ["dynamic", "'force-dynamic'"],
      ["fetchCache", "'force-no-store'"],
      ["preferredRegion", "[\n  'iad1',\n  'sfo1'\n]"]
    ])
  })

  it("says `use client` when the route's file does, as Next checks an error boundary's own file", () => {
    const [boundary] = projectPageFiles({ app: "app" }, [
      { path: "app/error.tsx", text: '// The app\'s errors.\n"use client"\nexport default function Error() {}\n' }
    ])

    expect(boundary?.text.split("\n").slice(1, 3)).toEqual([
      '"use client"',
      'export { default } from "../../../../app/error"'
    ])
  })

  it("passes on what the route's file re-exports with `export *`, and a namespace by its name", () => {
    const [handler] = projectPageFiles({ app: "app" }, [
      { path: "app/api/route.ts", text: 'export * from "./handlers"\nexport * as helpers from "./helpers"\n' }
    ])

    expect(handler?.text).toContain('export * from "../../../../../app/api/route"')
    expect(handler?.text).toContain('export { helpers } from "../../../../../app/api/route"')
  })

  it("re-exports an MDX page's Markdown, which is its default export without saying so", () => {
    const [page] = projectPageFiles({ app: "app" }, [{ path: "app/docs/page.mdx", text: "# Docs\n\nSome words.\n" }])

    expect(page?.text).toContain('export { default } from "../../../../../app/docs/page.mdx"')
  })
})
