import type { ProcessErrorCode, ProcessSpec, Run } from "@parity-app/extension-api"

/*
 * The rules for what a process may be, kept free of Node so they're tested on their own (docs/proposals/processes.md):
 * checking a spec, matching its run against the manifest's `permissions.processes`, filling in `{port}`, the
 * environment each kind of run gets, and how Windows starts a command it found.
 */

/** Why `start` or `adopt` refused, with the code an extension gets. */
export class ProcessError extends Error {
  readonly code: ProcessErrorCode

  constructor(code: ProcessErrorCode, message: string) {
    super(message)
    this.name = "ProcessError"
    this.code = code
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
  return specKey(a) === specKey(b)
}

/** A spec as text, its fields and its variables in a fixed order. */
function specKey(spec: ProcessSpec): string {
  const env = Object.entries(spec.env ?? {}).sort(([one], [other]) => (one < other ? -1 : 1))
  const port = spec.port ? [spec.port.prefer, spec.port.env] : undefined
  const ready = spec.ready ? [readyKey(spec.ready)] : undefined

  return JSON.stringify([
    spec.id,
    spec.name,
    spec.lifetime,
    permissionFor(spec.run),
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
