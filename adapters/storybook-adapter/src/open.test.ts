import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import type { ActionContext, ToolServer } from "@parity-app/core"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { openStorybook, storyIndex } from "./open.ts"

let server: Server | undefined

/** A Storybook that answers `/index.json` with `body`. */
async function serve(body: string): Promise<string> {
  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" })
    response.end(body)
  })
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done))

  // SAFETY: a server listening on a TCP port gives its address as an object, not a pipe's path.
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

afterEach(async () => {
  await new Promise((done) => (server ? server.close(done) : done(undefined)))
  server = undefined
})

describe("storyIndex", () => {
  it("gives each story and docs page, leaving out entries of a kind it doesn't know or can't read", async () => {
    const base = await serve(
      JSON.stringify({
        v: 5,
        entries: {
          "button--docs": { id: "button--docs", type: "docs", importPath: "./src/button.mdx", tags: ["docs"] },
          "button--primary": { id: "button--primary", type: "story", importPath: "./src/button.stories.tsx" },
          "intro--page": { id: "intro--page", type: "page", importPath: "./intro.mdx" },
          "card--broken": { id: "card--broken", type: "story" }
        }
      })
    )

    expect((await storyIndex(base)).map((entry) => entry.id)).toEqual(["button--docs", "button--primary"])
  })

  it.each([
    { name: "isn't JSON", body: "<html>Storybook is starting</html>", error: /JSON/ },
    { name: "isn't an object", body: "[]", error: "/index.json: expected an object" },
    {
      name: "has entries that aren't an object",
      body: JSON.stringify({ entries: [] }),
      error: "/index.json/entries: expected an object"
    }
  ])(
    "rejects an index that $name, so the Storybook isn't taken for one serving the project",
    async ({ body, error }) => {
      const base = await serve(body)
      await expect(storyIndex(base)).rejects.toThrow(error)
    }
  )
})

describe("openStorybook", () => {
  const index = JSON.stringify({
    entries: {
      "button--docs": { id: "button--docs", type: "docs", importPath: "./src/button.stories.tsx" },
      "button--primary": { id: "button--primary", type: "story", importPath: "./src/button.stories.tsx" },
      "card--plain": { id: "card--plain", type: "story", importPath: "./src/card.stories.tsx" }
    }
  })

  /** A project with a story file for Button and one for Card, whose Storybook answers at `base` once it's served. */
  function context(base: string, component?: string) {
    const served: { server: ToolServer; fresh: boolean }[] = []

    const files = new Map([
      [
        "src/button.stories.tsx",
        'import { Button } from "./button"\nexport default { component: Button }\nexport const Primary = {}\n'
      ],
      [
        "src/card.stories.tsx",
        'import { Card } from "./card"\nexport default { component: Card }\nexport const Plain = {}\n'
      ]
    ])

    const actionContext: ActionContext = {
      project: {
        root: "/app",
        pkg: { scripts: { storybook: "storybook dev -p 6100" } },
        read: () => Promise.resolve(undefined)
      },
      source: {
        files: (match) => Promise.resolve([...files.keys()].filter((path) => match.test(path))),
        read: (path) => Promise.resolve(files.get(path)),
        componentFor: (_file, _specifier, name) => Promise.resolve(name)
      },
      detection: { found: true, config: ".config/sb/main.ts", summary: "" },
      component,
      servers: {
        serve: (server, options) => {
          served.push({ server, fresh: !!options?.fresh })

          return Promise.resolve({ url: base, address: base })
        }
      }
    }

    return { actionContext, served }
  }

  it("opens a component's docs page, served by its Storybook with the project's config and port", async () => {
    const base = await serve(index)
    const { actionContext, served } = context(base, "Button")

    expect(await openStorybook(actionContext)).toEqual({ open: `${base}/?path=/docs/button--docs` })
    expect(served).toHaveLength(1)
    expect(served[0]!.server).toMatchObject({ name: "Storybook", package: "storybook", port: 6100 })
    expect(served[0]!.server.args(6101)).toEqual([
      "dev",
      "--port",
      "6101",
      "--no-open",
      "--ci",
      "--config-dir",
      ".config/sb"
    ])
    expect(await served[0]!.server.serves(base)).toBe(true)
  })

  it("opens Storybook's home without a component, and its first story for one without docs", async () => {
    const base = await serve(index)

    expect(await openStorybook(context(base).actionContext)).toEqual({ open: base })
    expect(await openStorybook(context(base, "Card").actionContext)).toEqual({
      open: `${base}/?path=/story/card--plain`
    })
  })

  it("refuses a component without stories", async () => {
    const base = await serve(index)

    await expect(openStorybook(context(base, "Badge").actionContext)).rejects.toThrow("Badge has no stories")
  })
})
