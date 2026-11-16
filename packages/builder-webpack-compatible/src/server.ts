import { readFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { extname, isAbsolute, relative, resolve } from "node:path"
import { pageEventsPath } from "./app-pages.ts"

/*
 * Serves the guest's build to the canvas: the modules the builder writes for the page, the files the bundler wrote, and
 * the app's page at its routes' paths, on 127.0.0.1 only. Nothing else: no dev server of the tool's, no file system in
 * memory.
 */

const loopback = "127.0.0.1"

const types = new Map([
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".cjs", "text/javascript"],
  [".css", "text/css"],
  [".json", "application/json"],
  [".map", "application/json"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"]
])

/** What the server answers with that the bundler didn't write: a module's source, or nothing to serve a file. */
export type ServedModule = (url: URL) => Promise<string | undefined>

export interface GuestServerOptions {
  port: number
  /** The bundler's output folder, absolute. */
  output: string
  /** Folders served as they are where the output has no such file, absolute. */
  folders?: readonly string[]
  /** Origins allowed to load the guest: the canvas's. */
  allowedOrigins: readonly string[]
  /** Settles once the build is done, so nothing half-written is served. */
  ready(): Promise<void>
  module: ServedModule
  /** The app's page, served at a path that names no file, as a route's is (PAR-1076). */
  page?: AppPage
}

/** The app's page, and what tells it to reload. */
export interface AppPage {
  /** The page as the canvas gets it, or nothing when the app has none. */
  html(): Promise<string | undefined>
  /** Calls `reload` after each build that changes something, until the function it gives back is called. */
  listen(reload: () => void): () => void
}

/** Starts the server. Its origin is `http://127.0.0.1:<port>`. */
export function serveGuest(options: GuestServerOptions): Promise<Server> {
  const server = createServer((request, response) => {
    void answerOrFail(options, request, response)
  })

  return new Promise((resolvePromise, reject) => {
    server.once("error", reject)
    server.listen(options.port, loopback, () => resolvePromise(server))
  })
}

/** Answers a request, or says why it couldn't, as a component that doesn't build. */
async function answerOrFail(
  options: GuestServerOptions,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    await answer(options, request, response)
  } catch (error) {
    if (!response.headersSent) {
      response.statusCode = 500
      response.setHeader("Content-Type", "text/plain")
    }

    response.end(error instanceof Error ? error.message : String(error))
  }
}

async function answer(options: GuestServerOptions, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const origin = request.headers.origin

  if (origin && (options.allowedOrigins.includes(origin) || options.allowedOrigins.includes("*"))) {
    response.setHeader("Access-Control-Allow-Origin", origin)
    response.setHeader("Vary", "Origin")
  }

  if (request.method === "OPTIONS") {
    response.statusCode = 204
    response.end()

    return
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405
    response.end()

    return
  }

  const url = new URL(request.url ?? "/", `http://${loopback}`)

  // Opened before the build is done, so a page loaded during the first build hears about the next.
  if (options.page && url.pathname === pageEventsPath) {
    listenForReloads(options.page, request, response)

    return
  }

  await options.ready()
  const source = await options.module(url)

  if (source !== undefined) {
    response.setHeader("Content-Type", "text/javascript")
    response.setHeader("Cache-Control", "no-store")
    response.end(source)

    return
  }

  let file: string | undefined
  let body: Buffer | undefined

  for (const folder of [options.output, ...(options.folders ?? [])]) {
    file = servedFile(folder, url.pathname)
    body = file ? await readFile(file).catch(() => undefined) : undefined

    if (body) {
      break
    }
  }

  // A route's path names no file: the app's page draws it, its router reading the path.
  const page = !body && extname(url.pathname) === "" ? await options.page?.html() : undefined

  if (page !== undefined) {
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    response.setHeader("Cache-Control", "no-store")
    response.end(page)

    return
  }

  if (!body) {
    response.statusCode = 404
    response.end()

    return
  }

  response.setHeader("Content-Type", types.get(extname(file!).toLowerCase()) ?? "application/octet-stream")
  response.setHeader("Cache-Control", "no-store")
  response.end(body)
}

/** Keeps a page's event stream open, sending a message each time a build changes something, until the page goes. */
function listenForReloads(page: AppPage, request: IncomingMessage, response: ServerResponse): void {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive"
  })
  response.write(": listening\n\n")
  const stop = page.listen(() => response.write("data: reload\n\n"))
  request.once("close", stop)
}

/** The output file a request's path names, or nothing for one outside the output folder. */
export function servedFile(output: string, pathname: string): string | undefined {
  let decoded: string

  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return undefined
  }

  const file = resolve(output, `.${decoded}`)
  const inside = relative(output, file)

  return inside && !inside.startsWith("..") && !isAbsolute(inside) ? file : undefined
}

/** A port nothing on 127.0.0.1 is using: the one the system gives a listener asking for any, closed again. */
export function freePort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const listener = createServer()
    listener.once("error", reject)
    listener.listen(0, loopback, () => {
      // SAFETY: a listener on a TCP port, once listening, has an address object; only pipes give a string.
      const { port } = listener.address() as AddressInfo
      listener.close(() => resolvePromise(port))
    })
  })
}

/** Whether nothing on 127.0.0.1 is using a port. */
export function portFree(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const listener = createServer()
    listener.once("error", () => resolvePromise(false))
    listener.listen(port, loopback, () => listener.close(() => resolvePromise(true)))
  })
}
