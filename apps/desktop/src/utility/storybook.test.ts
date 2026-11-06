import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { storyIndex } from "./storybook.ts"

let server: Server | undefined

/** A Storybook that answers `/index.json` with `body`. */
async function serve(body: string): Promise<string> {
  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" })
    response.end(body)
  })
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done))
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
