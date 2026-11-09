import { describe, expect, it } from "vite-plus/test"
import { listenOnLoopback } from "./loopback.ts"

describe("listenOnLoopback", () => {
  it("hands the link back with its port, and answers with whether signing in worked", async () => {
    const taken: string[] = []

    const redirect = await listenOnLoopback(async (link) => {
      taken.push(link)

      return link.includes("state=mine") ? "signed-in" : "not-mine"
    })

    try {
      expect(redirect.uri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/)
      const mine = await fetch(`${redirect.uri}?code=1&state=mine`)
      expect(mine.status).toBe(200)
      expect(await mine.text()).toContain("You're signed in to Parity")
      expect(taken).toEqual([`${redirect.uri}?code=1&state=mine`])
      expect((await fetch(`${redirect.uri}?code=1&state=theirs`)).status).toBe(404)
      expect((await fetch(new URL("/favicon.ico", redirect.uri))).status).toBe(404)
    } finally {
      redirect.close()
    }
  })
})
