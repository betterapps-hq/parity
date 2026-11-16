import { createServer } from "node:http"
import { isText } from "@parity-app/core/values/evaluate"
import { type HandBack, handBackHtml } from "../shared/hand-back-page.ts"
import type { Redirect } from "./account.ts"

/**
 * Listens on a free loopback port for one sign-in's hand-back, as a `pnpm dev` copy does instead of the `parity://`
 * scheme, which the system only registers for an installed app. WorkOS's sandbox allows any port on
 * `http://127.0.0.1:*\/auth/callback`. Once the code is traded, the browser gets a page saying whether that worked.
 */
export async function listenOnLoopback(take: (link: string) => Promise<HandBack | "not-mine">): Promise<Redirect> {
  /** The address it listens on, known once it does; the link is read against it, port and all. */
  let origin = "http://127.0.0.1"

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", origin)

    if (request.method !== "GET" || url.pathname !== "/auth/callback") {
      response.writeHead(404).end()

      return
    }

    void take(url.href).then(
      (outcome) => {
        if (outcome === "not-mine") {
          response.writeHead(404).end()

          return
        }

        response
          .writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
          .end(handBackHtml(outcome))
      },
      () => response.writeHead(500).end(handBackHtml("problem"))
    )
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()

  if (!address || isText(address)) {
    throw new Error("The sign-in listener has no port")
  }

  origin = `http://127.0.0.1:${address.port}`

  return {
    uri: `${origin}/auth/callback`,
    close: () => {
      // The request being answered finishes; nothing new is taken.
      server.close()
      server.closeIdleConnections()
    }
  }
}
