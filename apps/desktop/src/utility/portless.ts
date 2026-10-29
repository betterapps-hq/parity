import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

/** A name Portless routes to a local server: the hostname, the port behind it, and the process that claimed it. */
export interface Route {
  hostname: string
  port: number
  pid?: number
}

export interface PortlessState {
  /** The routes whose process is still running, as Portless itself counts them. */
  routes: Route[]
  /** A route's address through Portless's proxy. */
  address(hostname: string): string
}

/**
 * The names Portless gives local servers, from its state folder: each hostname and the port it routes to, and how its
 * proxy is reached. Without Portless, there are none.
 */
export async function readPortless(): Promise<PortlessState> {
  const folder = process.env.PORTLESS_STATE_DIR || join(homedir(), ".portless")
  const read = (name: string) =>
    readFile(join(folder, name), "utf8").then(
      (text) => text.trim(),
      () => ""
    )
  const [routesText, portText, tlsText] = await Promise.all(["routes.json", "proxy.port", "proxy.tls"].map(read))
  let routes: Route[] = []
  try {
    const parsed = JSON.parse(routesText || "[]") as unknown
    if (Array.isArray(parsed)) {
      routes = parsed.filter(
        (route): route is Route =>
          typeof route?.hostname === "string" && typeof route.port === "number" && alive(route.pid)
      )
    }
  } catch {
    // A half-written file reads again on the next poll.
  }
  const port = Number(portText) || 443
  const tls = tlsText === "1" || tlsText === "true"
  const standard = port === (tls ? 443 : 80)
  return {
    routes,
    address: (hostname) => `${tls ? "https" : "http"}://${hostname}${standard ? "" : `:${port}`}`
  }
}

/** A route left behind by a process that was killed isn't live. Portless keeps routes without one, numbered 0. */
function alive(pid: unknown): boolean {
  if (typeof pid !== "number" || pid === 0) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // It's running, as another user's.
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

/**
 * The server Portless routes to that `serves` says is the one wanted, found by asking each route's port, so it doesn't
 * matter what set the route up: Portless's own command line, Buildkit's dev-domains, or anything else that writes
 * Portless's routes. More than one can serve it, as a project's checkout and a worktree of it do; then `ours` says which
 * is this checkout's, and when it can't tell them apart there's none.
 */
export async function findRoutedServer(
  portless: PortlessState,
  serves: (base: string) => Promise<boolean>,
  ours: (base: string) => Promise<boolean>
): Promise<{ url: string; address: string } | undefined> {
  // Several names can route to one server.
  const ports = [...new Set(portless.routes.map((route) => route.port))]
  const serving = await passing(ports, serves)
  const mine = serving.length > 1 ? await passing(serving, ours) : serving
  if (mine.length !== 1) return undefined
  const route = portless.routes.find((candidate) => candidate.port === mine[0])!
  return { url: local(route.port), address: portless.address(route.hostname) }
}

async function passing(ports: number[], test: (base: string) => Promise<boolean>): Promise<number[]> {
  const passed = await Promise.all(ports.map((port) => test(local(port))))
  return ports.filter((_, index) => passed[index])
}

/** Where Parity reaches a routed server itself: its own port, as Node doesn't trust Portless's certificates. */
export function local(port: number): string {
  return `http://localhost:${port}`
}
