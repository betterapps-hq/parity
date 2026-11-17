import { readFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { extname, isAbsolute, relative, resolve } from "node:path"

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

/**
 * The app's page. It doesn't reload itself after a build: Parity starts its frames again after a code change
 * (route-frames.md, PAR-1264).
 */
export interface AppPage {
  /** The page as the canvas gets it, or nothing when the app has none. */
  html(): Promise<string | undefined>
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

/**
 * Whether an origin is this server's own under a `*.localhost` name (PAR-1260): the canvas loads a project's pages from
 * `http://<project>.localhost:<port>`, so each project's pages get a process of their own, and their chunks load from
 * the build's public path on 127.0.0.1 with CORS.
 */
export function isPageOrigin(origin: string, port: number): boolean {
  try {
    const url = new URL(origin)

    return url.protocol === "http:" && url.hostname.endsWith(".localhost") && url.port === String(port)
  } catch {
    return false
  }
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

  if (
    origin &&
    (options.allowedOrigins.includes(origin) ||
      options.allowedOrigins.includes("*") ||
      isPageOrigin(origin, options.port))
  ) {
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

  // A page's own load with no file at its path is a route's (`/users/alice.smith` too): the app's page draws it, its
  // router reading the path. A script or stylesheet that isn't there stays missing.
  const page = !body && opensPage(request) ? await options.page?.html() : undefined

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

/** Whether a request loads a page into a window or frame, as the browser says, rather than a file for a page. */
function opensPage(request: IncomingMessage): boolean {
  const destination = request.headers["sec-fetch-dest"]

  return destination === undefined
    ? (request.headers.accept ?? "").includes("text/html")
    : destination === "document" || destination === "iframe"
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
