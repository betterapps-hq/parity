import { z } from "zod"

/*
 * Portless's state, as it leaves it in its folder: the names it routes to local servers, and how its proxy is reached.
 */

/** A name Portless routes to a local server: the hostname, the port behind it, and the process that claimed it. */
const route = z.looseObject({ hostname: z.string(), port: z.int().min(1).max(65_535), pid: z.int().optional() })

export type Route = z.infer<typeof route>

/** Portless's `proxy.port`: the port its proxy listens on. */
const proxyPort = z.coerce.number().pipe(z.int().min(1).max(65_535))

/** Portless's `proxy.tls`: whether its proxy serves HTTPS, as `1` or `true`. */
const proxyTls = z.stringbool()

export interface PortlessState {
  /** The routes whose process is still running, as Portless itself counts them. */
  routes: Route[]
  /** A route's address through Portless's proxy. */
  address: (hostname: string) => string
}

/**
 * The names Portless gives local servers, from its folder, read with `read`: each hostname and the port it routes to,
 * and how its proxy is reached. Without Portless, there are none.
 */
export async function readPortless(
  folder: string,
  read: (path: string) => Promise<string>,
  running: (pid: number) => boolean = alive
): Promise<PortlessState> {
  const text = (name: string) =>
    read(inFolder(folder, name)).then(
      (found) => found.trim(),
      () => ""
    )

  const [routesText, portText, tlsText] = await Promise.all(["routes.json", "proxy.port", "proxy.tls"].map(text))

  // A half-written file reads again when it next changes. Each route is read on its own, so one Portless wrote in a
  // newer shape loses only itself.
  const routes = listed(routesText).flatMap((value) => {
    const read = route.safeParse(value)

    return read.success && (read.data.pid === undefined || read.data.pid === 0 || running(read.data.pid))
      ? [read.data]
      : []
  })

  const port = proxyPort.safeParse(portText).data ?? 443
  const tls = proxyTls.safeParse(tlsText).data ?? false
  const standard = port === (tls ? 443 : 80)

  return {
    routes,
    address: (hostname) => `${tls ? "https" : "http"}://${hostname}${standard ? "" : `:${port}`}`
  }
}

/** A file in Portless's folder. */
export function inFolder(folder: string, name: string): string {
  return `${folder.replace(/[/\\]+$/, "")}/${name}`
}

/** The items of `routes.json`, or none when it isn't a JSON list. */
function listed(text: string): unknown[] {
  try {
    const parsed = z.array(z.unknown()).safeParse(JSON.parse(text || "[]"))

    return parsed.data ?? []
  } catch {
    return []
  }
}

/** Whether a process is running. A route left by one that was killed isn't live; one running as another user is. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM"
  }
}
