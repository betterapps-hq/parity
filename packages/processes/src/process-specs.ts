import type { Address, ProcessErrorCode, ProcessInfo, ProcessSpec, Run } from "@parity-app/extension-api"

/*
 * The rules for what a process may be, kept free of Node so they're tested on their own (docs/proposals/processes.md):
 * checking a spec, matching its run against the manifest's `permissions.processes`, filling in `{port}`, the
 * environment each kind of run gets, and how Windows starts a command it found.
 */

/** What a refusal carries to an extension's host besides its message. */
export interface ProcessErrorDetails {
  code: ProcessErrorCode
}

/** Why `start` or `adopt` refused, with the code an extension gets. */
export class ProcessError extends Error {
  readonly code: ProcessErrorCode

  constructor(code: ProcessErrorCode, message: string) {
    super(message)
    this.name = "ProcessError"
    this.code = code
  }

  /** What crosses to an extension's host with the message, so its error has the code too. */
  get details(): ProcessErrorDetails {
    return { code: this.code }
  }
}

/** The longest an `output` ready check's pattern may be, and how much of each line it's matched against. */
export const readyPatternLength = 200
export const matchedLineLength = 4000

/** Refuses a spec that breaks a rule its schema can't say, with `process_spec_invalid`. */
export function checkSpec(spec: ProcessSpec): void {
  const refuse = (message: string) => {
    throw new ProcessError("process_spec_invalid", `${spec.name || spec.id}: ${message}`)
  }

  if (!/^[A-Za-z0-9][\w.:-]{0,99}$/.test(spec.id)) {
    refuse("its id must be letters, digits, dots, colons, dashes and underscores, at most 100")
  }

  const args = spec.args ?? []

  if (args.some((arg) => /[\r\n]/.test(arg))) {
    refuse("an argument holds a newline")
  }

  if (!spec.port && args.some((arg) => arg.includes("{port}"))) {
    refuse("`{port}` needs a port")
  }

  if (spec.ready && !spec.port && ("http" in spec.ready || "tcp" in spec.ready)) {
    refuse("an http or tcp ready check needs a port")
  }

  if (spec.ready && "http" in spec.ready && !spec.ready.http.startsWith("/")) {
    refuse("an http ready check's path starts with /")
  }

  if (spec.ready && "output" in spec.ready) {
    readyPattern(spec.ready.output, refuse)
  }

  if (spec.lifetime === "task" && (spec.ready || spec.restart === "onCrash")) {
    refuse("a task has no ready check and isn't restarted")
  }

  if (spec.cwd !== undefined && !insideProject(spec.cwd)) {
    refuse("its folder must be inside the project")
  }

  if (spec.timeoutMs !== undefined && !(spec.timeoutMs > 0)) {
    refuse("its time limit must be more than 0")
  }
}

/** An `output` ready check's pattern, or `refuse` called for one that's too long or isn't a pattern. */
export function readyPattern(source: string, refuse: (message: string) => never): RegExp {
  if (source.length > readyPatternLength) {
    refuse(`its ready pattern is longer than ${readyPatternLength} characters`)
  }

  try {
    return new RegExp(source)
  } catch {
    return refuse("its ready pattern isn't a valid one")
  }
}

/** Whether a relative folder stays inside the project's root. */
function insideProject(cwd: string): boolean {
  if (/^([\\/]|[A-Za-z]:)/.test(cwd)) {
    return false
  }

  let depth = 0

  for (const part of cwd.split(/[\\/]+/)) {
    if (part === "..") {
      depth -= 1
    } else if (part !== "." && part !== "") {
      depth += 1
    }

    if (depth < 0) {
      return false
    }
  }

  return true
}

/** The `permissions.processes` entry a run needs, as `bin:storybook` or `exec:docker`. */
export function permissionFor(run: Run): string {
  if ("bin" in run) {
    return `bin:${run.package ?? run.bin}`
  }

  if ("script" in run) {
    return `script:${run.script}`
  }

  if ("exec" in run) {
    return `exec:${run.exec}`
  }

  return `node:${run.node}`
}

/** Whether the manifest's `permissions.processes` allows a run. */
export function permits(run: Run, allowed: readonly string[]): boolean {
  return allowed.includes(permissionFor(run))
}

/** Whether a `permissions.processes` entry is well formed: a kind of run, then what it names. */
export function isProcessPermission(entry: string): boolean {
  return /^(bin|script|exec|node):\S+$/.test(entry)
}

/** What kind of command a run is, as telemetry names it. */
export function runKind(run: Run): "bin" | "script" | "exec" | "node" {
  if ("bin" in run) {
    return "bin"
  }

  if ("script" in run) {
    return "script"
  }

  return "exec" in run ? "exec" : "node"
}

/** What a run names, without its arguments, as telemetry sends it: `storybook`, `dev`, `docker`. */
export function runCommand(run: Run): string {
  return permissionFor(run).slice(runKind(run).length + 1)
}

/** The arguments with `{port}` filled in. */
export function fillPort(args: readonly string[], port: number | undefined): string[] {
  return port === undefined ? [...args] : args.map((arg) => arg.replaceAll("{port}", String(port)))
}

/** Two specs are the same when everything that says what runs and how is the same, whatever their keys' order. */
export function sameSpec(a: ProcessSpec, b: ProcessSpec): boolean {
  return specFingerprint(a) === specFingerprint(b)
}

/** A spec as text, its fields and its variables in a fixed order, which tells two specs apart. */
export function specFingerprint(spec: ProcessSpec): string {
  const env = Object.entries(spec.env ?? {}).sort(([one], [other]) => (one < other ? -1 : 1))
  const port = spec.port ? [spec.port.prefer, spec.port.env] : undefined
  const ready = spec.ready ? [readyKey(spec.ready)] : undefined

  return JSON.stringify([
    spec.id,
    spec.name,
    spec.lifetime,
    // The run itself, not its permission: two command lines of one package are allowed alike but aren't the same.
    Object.entries(spec.run).sort(([one], [other]) => (one < other ? -1 : 1)),
    spec.args ?? [],
    spec.cwd,
    env,
    port,
    ready,
    spec.timeoutMs,
    spec.restart,
    spec.quiet,
    spec.icon,
    spec.role
  ])
}

/** A ready check as text. */
function readyKey(ready: NonNullable<ProcessSpec["ready"]>): string {
  if ("http" in ready) {
    return `http:${ready.http}`
  }

  return "tcp" in ready ? "tcp" : `output:${ready.output}`
}

/**
 * The environment a run gets. The service sets `ELECTRON_RUN_AS_NODE` for itself, which `bin` and `node` runs keep,
 * since they are Parity's Node. `script` and `exec` runs go without it, as a project's scripts may launch an Electron
 * app of their own.
 */
export function runEnvironment(run: Run, base: Record<string, string | undefined>, added: Record<string, string> = {}) {
  const env: Record<string, string> = {}
  const parity = "bin" in run || "node" in run

  for (const [key, value] of Object.entries({ ...base, ...added })) {
    if (value !== undefined && (parity || key.toUpperCase() !== "ELECTRON_RUN_AS_NODE")) {
      env[key] = value
    }
  }

  if (parity) {
    env.ELECTRON_RUN_AS_NODE = "1"
  }

  return env
}

/**
 * How Windows starts a program found on the PATH: an `.exe` or `.com` directly, a `.cmd` or `.bat` through `cmd.exe`.
 * Any other type, as `.ps1`, `.js` or `.vbs`, isn't run. On macOS and Linux every executable file runs directly.
 */
export function startsAs(path: string, platform: string): "direct" | "batch" | "unsupported" {
  if (platform !== "win32") {
    return "direct"
  }

  const extension = /\.[^.\\/]+$/.exec(path)?.[0].toLowerCase()

  if (extension === ".exe" || extension === ".com") {
    return "direct"
  }

  return extension === ".cmd" || extension === ".bat" ? "batch" : "unsupported"
}

/**
 * What an extension may see of a process. Its owner, and an extension with `observe`, see everything. Others see what's
 * running and nothing it printed: its error as a fixed phrase, without its ready check's match or its public addresses.
 */
export function visibleTo(info: ProcessInfo, viewer: { owns: boolean; observe: boolean }): ProcessInfo {
  if (viewer.owns || viewer.observe) {
    return info
  }

  const { readyMatch: _match, error, ...rest } = info
  const seen: ProcessInfo = { ...rest, addresses: info.addresses.filter((address) => !address.public) }

  if (error !== undefined) {
    seen.error = fixedPhrase(info.lifetime, error)
  }

  return seen
}

/** Why a process failed, in words that quote nothing it printed. */
function fixedPhrase(lifetime: ProcessInfo["lifetime"], error: string): string {
  if (lifetime === "task") {
    return "Failed"
  }

  return error.startsWith("Stopped by itself") ? "Stopped by itself" : "Couldn't start"
}

/**
 * Where programs are put when PATH doesn't say, as for an app the Dock started on macOS, whose PATH is only the
 * system's: Homebrew's and the usual local folders.
 */
export const usualFolders = new Map([
  ["darwin", ["/usr/local/bin", "/opt/homebrew/bin"]],
  ["linux", ["/usr/local/bin", "/usr/bin", "/snap/bin"]]
])

/** An environment's PATH with the usual folders after it, as `commandPaths` searches it. */
export function withUsualFolders(
  env: { PATH?: string; Path?: string; PATHEXT?: string },
  platform: string
): { PATH: string; PATHEXT?: string } {
  const separator = platform === "win32" ? ";" : ":"
  const path = [env.PATH ?? env.Path ?? "", ...(usualFolders.get(platform) ?? [])].filter(Boolean).join(separator)

  return env.PATHEXT === undefined ? { PATH: path } : { PATH: path, PATHEXT: env.PATHEXT }
}

/**
 * An environment whose PATH has the usual folders after its own, kept under the name it already has, so a program
 * found there, as Homebrew's pnpm, finds the Node its first line asks for too.
 */
export function withUsualPath(env: Record<string, string>, platform: string) {
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH"

  return { ...env, [key]: withUsualFolders({ PATH: env[key] ?? "" }, platform).PATH }
}

/** Whether a host is this machine: `localhost`, `127.0.0.1`, `[::1]`, or a name under `.localhost`. */
export function isLocalHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase()

  return bare === "localhost" || bare === "127.0.0.1" || bare === "::1" || bare.endsWith(".localhost")
}

/** Whether a host is on the local network: a private IPv4 or IPv6 address, or a name under `.local`. */
export function isPrivateHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase()
  const octets = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(bare)

  if (octets) {
    const [first, second] = [Number(octets[1]), Number(octets[2])]

    return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
  }

  return /^f[cd][0-9a-f]{0,2}:/.test(bare) || bare.endsWith(".local")
}

/**
 * Why Parity drops an address a provider gives, or nothing when it takes it. One on this machine may be any kind but
 * `network` and `tunnel`; one on the local network only `network`; anywhere else only a `public` one, from an extension
 * allowed to publish.
 */
export function addressRefusal(address: Omit<Address, "provider">, publish: boolean): string | undefined {
  let url: URL

  try {
    url = new URL(address.url)
  } catch {
    return `${address.url} isn't a URL`
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return `${address.url} isn't http or https`
  }

  if (isLocalHost(url.hostname)) {
    return address.kind === "network" || address.kind === "tunnel"
      ? `${address.url} is on this machine, so it isn't a ${address.kind} address`
      : undefined
  }

  if (isPrivateHost(url.hostname)) {
    return address.kind === "network" ? undefined : `${address.url} is on the local network, so it's a network address`
  }

  return address.public && publish ? undefined : `${address.url} is public, which this extension may not give`
}

/** Which kinds of address `opens` prefers, the first first. A network address only when the person picks it. */
const opensOrder: Address["kind"][] = ["name", "proxy", "container"]

/** What the person's browser opens for a server: its preferred address on this machine, else its endpoint. */
export function opensAt(addresses: readonly Address[], endpoint: string | undefined): string | undefined {
  for (const kind of opensOrder) {
    const found = addresses.find((address) => address.kind === kind && !address.public)

    if (found) {
      return found.url
    }
  }

  return endpoint
}
