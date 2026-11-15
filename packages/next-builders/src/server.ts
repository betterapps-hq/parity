import { mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { type AddressInfo, createServer as createNetServer } from "node:net"
import { dirname, join } from "node:path"
import type { NextBundler } from "./bundler.ts"
import { type GuestAppFile, guestAppFolder } from "./guest-app.ts"
import type { ProjectNext } from "./next.ts"
import { standInFolder } from "./server-modules.ts"

const loopback = "127.0.0.1"

/** The guest app's files that only some projects have, which a start that doesn't write them removes. */
const optionalGuestFiles = ["postcss.config.mjs", "tsconfig.json", "jsconfig.json"]

/**
 * Writes the guest app's files into the project's `.next/parity/`, leaving a file alone when it already says the same,
 * since Next compiles again whatever changes. Its `public/` is the project's, linked, so the project's images and fonts
 * are served as the app serves them. Returns the guest app's folder.
 */
export async function writeGuestApp(root: string, files: readonly GuestAppFile[]): Promise<string> {
  const folder = join(root, guestAppFolder)
  const written = new Set(files.map((file) => file.path))

  // The files the builder writes only for some projects, or some components, go when this start doesn't write them:
  // a PostCSS config or tsconfig the project no longer has, or a stand-in for a module that's no longer server-only.
  const standIns = await readdir(join(folder, standInFolder)).catch(() => [])
  const optional = [...optionalGuestFiles, ...standIns.map((name) => `${standInFolder}/${name}`)]

  for (const path of optional.filter((path) => !written.has(path))) {
    await rm(join(folder, path), { force: true })
  }

  for (const file of files) {
    const path = join(folder, file.path)
    const before = await readFile(path, "utf8").catch(() => undefined)

    if (before !== file.text) {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, file.text)
    }
  }

  const publicFolder = join(root, "public")
  const linked = join(folder, "public")

  if ((await isFolder(publicFolder)) && !(await isFolder(linked))) {
    await rm(linked, { recursive: true, force: true })
    // A junction on Windows, which needs no privilege there; a plain link elsewhere.
    await symlink(publicFolder, linked, "junction")
  }

  return folder
}

/** A request the builder answers itself, ahead of Next: its own routes, under `/__parity/`. */
export type OwnRoute = (request: IncomingMessage, response: ServerResponse, url: URL) => Promise<boolean>

/** The project's Next, serving the guest app on 127.0.0.1. */
export interface NextServer {
  origin: string
  /** Fetches a page or file from Next, as the browser would. */
  fetchText(path: string): Promise<{ ok: boolean; status: number; text: string }>
  close(): Promise<void>
}

/** What Next's programmatic server is made with, as much of it as the builder gives. */
interface NextOptions {
  dev: boolean
  dir: string
  hostname: string
  port: number
  turbopack?: boolean
  webpack?: boolean
}

/** Next's programmatic server, as much of it as the builder uses. */
interface NextApp {
  prepare(): Promise<void>
  getRequestHandler(): (request: IncomingMessage, response: ServerResponse) => Promise<void>
  close(): Promise<void>
}

/**
 * Starts the project's own Next in development on the guest app, with the bundler given, behind a server of the
 * builder's own on `port`, which answers its own routes first and lets any origin load what Next serves: the canvas's
 * page is on another, and loads Next's chunks, stylesheets and fonts across it.
 */
export async function startNextServer(options: {
  next: ProjectNext
  bundler: NextBundler
  folder: string
  port: number
  routes: OwnRoute
}): Promise<NextServer> {
  const { next, bundler, folder, port, routes } = options
  const origin = `http://${loopback}:${port}`
  process.env.NEXT_TELEMETRY_DISABLED = "1"

  // SAFETY: the project's `next` package exports its programmatic server as a function that makes one.
  const createNext = next.require(next.folder) as (options: NextOptions) => NextApp
  const nextOptions: NextOptions = { dev: true, dir: folder, hostname: loopback, port }

  if (bundler === "turbopack") {
    nextOptions.turbopack = true
  } else {
    nextOptions.webpack = true
  }

  const app = createNext(nextOptions)

  await app.prepare()
  const handle = app.getRequestHandler()

  /** Answers a request from the builder's own routes, else from Next, or says why it couldn't. */
  const answer = async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("access-control-allow-origin", "*")

    try {
      if (!(await routes(request, response, new URL(request.url ?? "/", origin)))) {
        await handle(request, response)
      }
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "text/plain" })
      }

      response.end(error instanceof Error ? error.message : String(error))
    }
  }

  const server = createServer((request, response) => void answer(request, response))

  await listen(server, port)

  return {
    origin,
    async fetchText(path) {
      const response = await fetch(new URL(path, origin))

      return { ok: response.ok, status: response.status, text: await response.text() }
    },
    async close() {
      await new Promise<void>((done) => server.close(() => done()))
      await app.close()
    }
  }
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((done, fail) => {
    server.once("error", fail)
    server.listen(port, loopback, () => done())
  })
}

/** A port nothing on 127.0.0.1 is using: the one the system gives a listener asking for any, closed again. */
export function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const listener = createNetServer()
    listener.once("error", fail)
    listener.listen(0, loopback, () => {
      // SAFETY: a listener on a TCP port, once listening, has an address object; only pipes give a string.
      const { port } = listener.address() as AddressInfo
      listener.close(() => done(port))
    })
  })
}

/** Whether nothing on 127.0.0.1 is using a port. */
export function portFree(port: number): Promise<boolean> {
  return new Promise((done) => {
    const listener = createNetServer()
    listener.once("error", () => done(false))
    listener.listen(port, loopback, () => listener.close(() => done(true)))
  })
}

async function isFolder(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isDirectory(),
    () => false
  )
}
