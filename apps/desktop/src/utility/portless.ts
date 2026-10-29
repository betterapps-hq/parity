import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

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

/** One of a project's servers as Buildkit's dev-domains names it. */
export interface DevDomain {
  service: string
  hostname: string
  origin: string
}

export interface DevDomains {
  /** The project's own dev-domains command line, which starts a server under its name. */
  cli: string
  endpoints: DevDomain[]
}

/**
 * The names a project gives its servers through Buildkit's dev-domains, in the checkout it's in: a worktree's differ from
 * the main checkout's. Asks the project's own copy, so its configuration decides. Without one, there are none.
 */
export async function projectDomains(root: string): Promise<DevDomains | undefined> {
  const cli = packageBin(root, "@buildkitgg/dev-domains", "dev-domains")
  if (!cli) return undefined
  const output = await runNode(cli, ["urls", "--cwd", root], root).catch((error: unknown) => {
    console.warn(`[service] dev-domains couldn't name ${root}'s servers: ${String(error)}`)
    return undefined
  })
  if (output === undefined) return undefined
  try {
    const parsed = JSON.parse(output) as unknown
    const endpoints = (Array.isArray(parsed) ? parsed : []).filter(
      (endpoint): endpoint is DevDomain =>
        typeof endpoint?.service === "string" &&
        typeof endpoint.hostname === "string" &&
        typeof endpoint.origin === "string"
    )
    return { cli, endpoints }
  } catch {
    return undefined
  }
}

/**
 * The endpoint that serves the project's Storybook, by dev-domains' names for them: `stories`, or `<package>-stories`
 * in a workspace, where the package's own comes first.
 */
export function storybookEndpoint(endpoints: DevDomain[], packageName: string): DevDomain | undefined {
  const stories = endpoints.filter((endpoint) => /(^|-)(stories|storybook)$/.test(endpoint.service))
  if (stories.length <= 1) return stories[0]
  const own = packageName.replace(/^@[^/]+\//, "").toLowerCase()
  return stories.find((endpoint) => endpoint.service.startsWith(`${own}-`))
}

/**
 * A Storybook already running for the project through Portless, by its route, where `serves` says it's the project's.
 * With the project's dev-domains names, only those are looked at: they're its checkout's own, while a worktree's
 * Storybook would serve the same files. Without them, it's the only routed one that serves the project, as more than
 * one can't be told apart.
 */
export async function findRoutedStorybook(
  portless: PortlessState,
  domains: DevDomain[] | undefined,
  serves: (base: string) => Promise<boolean>
): Promise<{ url: string; address: string } | undefined> {
  const named = domains
    ? portless.routes.filter((route) => domains.some((domain) => domain.hostname === route.hostname))
    : portless.routes
  // Several names can route to one server.
  const ports = [...new Set(named.map((route) => route.port))]
  const serving = await Promise.all(ports.map(async (port) => ((await serves(local(port))) ? port : undefined)))
  const found = serving.filter((port) => port !== undefined)
  if (found.length === 0 || (!domains && found.length > 1)) return undefined
  const route = named.find((candidate) => candidate.port === found[0])!
  const origin = domains?.find((domain) => domain.hostname === route.hostname)?.origin
  return { url: local(route.port), address: origin ?? portless.address(route.hostname) }
}

/** Where Parity reaches a routed server itself: its own port, as Node doesn't trust Portless's certificates. */
export function local(port: number): string {
  return `http://localhost:${port}`
}

/** A package's command line as the project would run it, found as Node finds the package from the project's folder. */
function packageBin(root: string, name: string, command: string): string | undefined {
  for (let folder = root; ; folder = dirname(folder)) {
    const manifest = join(folder, "node_modules", name, "package.json")
    if (existsSync(manifest)) {
      const { bin } = JSON.parse(readFileSync(manifest, "utf8")) as { bin?: string | Record<string, string> }
      const file = typeof bin === "string" ? bin : bin?.[command]
      return file ? join(dirname(manifest), file) : undefined
    }
    if (dirname(folder) === folder) return undefined
  }
}

/** Runs a script with Parity's own Node, as Electron runs as plain Node here, and gives what it printed. */
function runNode(script: string, args: string[], cwd: string, timeout = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      timeout
    })
    let output = ""
    let errors = ""
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on("data", (chunk: Buffer) => (errors = (errors + chunk.toString()).slice(-1000)))
    child.on("error", reject)
    child.on("exit", (code) => (code === 0 ? resolve(output) : reject(new Error(errors.trim() || `exit code ${code}`))))
  })
}
