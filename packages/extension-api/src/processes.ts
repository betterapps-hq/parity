import type { Disposable } from "./api.ts"
import type { IconName } from "./manifest.ts"

/*
 * A project's processes, as Parity lists them and extensions start, adopt and watch them (docs/proposals/processes.md).
 * Every process goes through the project service's process manager. An extension describes one as data and never
 * spawns anything itself.
 */

/** A project's processes, as an extension starts, adopts, finds and watches them. */
export interface Processes {
  /**
   * Starts a process, or gives the one this extension already has with the same id while it's starting or running.
   * Settles once spawning has been tried; `ready()` says when it's ready. Rejects with an error whose `code` is a
   * `ProcessErrorCode`.
   */
  start(spec: ProcessSpec): Promise<ProcessHandle>
  /**
   * Lists a server found running under this extension, so Parity uses it but never stops it. Throws `process_not_local`
   * for an endpoint not on this machine, and `process_id_taken` for an id this extension uses for a process that's
   * starting, running or stopping. It never stops anything.
   */
  adopt(server: Candidate | AdoptSpec, as: { id: string; name: string }): ProcessHandle
  /** Servers running that no process Parity lists already has, on the ports asked for. */
  find(query?: FindQuery): Promise<Candidate[]>
  /** The project's processes, whoever started them, as this extension may see them. */
  list(filter?: { owner?: "mine" | "any"; lifetime?: "server" | "task" }): ProcessInfo[]
  /** A process this extension started or adopted, by its id, as after its host started again. */
  get(id: string): ProcessHandle | undefined
  /** Called with the processes that changed: their state, endpoint or addresses. */
  onDidChange(listener: (changed: ProcessInfo[]) => void): Disposable
}

/** A process this extension started or adopted. It follows its process across restarts. */
export interface ProcessHandle {
  /** Its id among this extension's processes. `info.id` is its id among the project's. */
  readonly id: string
  /** The latest of what Parity knows of it. */
  readonly info: ProcessInfo
  /**
   * Settles once the current run is ready: a server passes its ready check, a task has started. While no run is
   * starting or running, rejects with why the latest one ended.
   */
  ready(): Promise<ProcessInfo>
  /** Settles once the current run ends, or at once with the latest run's end while none is starting or running. */
  ended(): Promise<ProcessEnd>
  /** Called as each run ends, this one and any after a restart. */
  onDidEnd(listener: (end: ProcessEnd) => void): Disposable
  /** Stops it and every process it started. An adopted one is let go, not stopped. */
  stop(): Promise<void>
  /** Starts its next run with the same spec, and settles once that run is ready. */
  restart(): Promise<ProcessInfo>
  /** What it printed, the latest lines last (200 unless said), and each batch of lines as it's printed. */
  readonly output: { tail(lines?: number): string[]; onLines(listener: (lines: string[]) => void): Disposable }
  /** For a task: what it's doing and how far it's got, as the processes list shows while it runs. */
  report(progress: { detail?: string; done?: number; total?: number }): void
  /** For a task: what it found, as `3 failing tests in 2 files`, set while it runs or until its next run starts. */
  summarize(summary: string): void
  onDidChange(listener: (info: ProcessInfo) => void): Disposable
}

/** Which servers `find` looks for. */
export interface FindQuery {
  /** Ports to check, as Storybook's usual 6006. A server answering a connection there is a candidate. */
  ports?: number[]
  /** Whether to ask the discovery providers. True unless said. */
  discovered?: boolean
}

/** A server found running that nothing has adopted yet. */
export interface Candidate {
  /** Unique among this call's results. Pass the candidate itself to `adopt`. */
  key: string
  endpoint: Endpoint
  /** The addresses it's known by. */
  addresses: Address[]
  /** What found it: a port check, or a discovery provider's extension. */
  foundBy: { kind: "port" } | { kind: "provider"; extension: string }
  name?: string
  pid?: number
  /** The folder it runs in, when the provider knows, which says whose project it's for. */
  cwd?: string
}

/** A server to adopt that wasn't found by `find`. */
export interface AdoptSpec {
  endpoint: Endpoint
}

/** What to run, and how Parity knows it's ready. */
export interface ProcessSpec {
  /** Names it among this extension's processes. */
  id: string
  /** What the processes list calls it, as `Storybook`. */
  name: string
  lifetime: "server" | "task"
  /** What it runs. Each must be allowed by the manifest's `permissions.processes`. */
  run: Run
  /** Its arguments. `{port}` becomes the port Parity chose. */
  args?: string[]
  /** Its folder, relative to the project's root and inside it. The root unless said. */
  cwd?: string
  /** Variables it gets, after the service's key-free environment. */
  env?: Record<string, string>
  /** For a server that listens: the port it asks for, and how it's told the one chosen. */
  port?: PortSpec
  /** For a server: how Parity knows it's ready. Without it, a server is ready once it has started. */
  ready?: ReadyCheck
  /**
   * How long it may take, in milliseconds: for a server, to be ready, three minutes unless said; for a task, to end, no
   * limit unless said.
   */
  timeoutMs?: number
  /** Whether a server that stops by itself is started again, up to three times a minute. */
  restart?: "never" | "onCrash"
  /**
   * For a short task, as one a provider runs: listed only once it has run for a second, gone as soon as it passes, and
   * reported to telemetry only when it fails.
   */
  quiet?: boolean
  /** How the processes list shows it: an icon from the kit's set, and what it does in a few words. */
  icon?: IconName
  role?: string
}

export type Run =
  /** A package's command line, from the project's own install, run with Parity's Node. `package` is `bin` unless said. */
  | { bin: string; package?: string }
  /** One of the project's `package.json` scripts, through the project's package manager. */
  | { script: string }
  /** An executable on the PATH, as `docker` or `cloudflared`. */
  | { exec: string }
  /** A Node module inside the extension's own package, run with Parity's Node. */
  | { node: string }

export interface PortSpec {
  /** The port it asks for. The next free one is chosen when it's taken. */
  prefer: number
  /** A variable that tells it the port, as `PORT`, besides `{port}` in its arguments. */
  env?: string
}

export type ReadyCheck =
  /** Answers this path at its endpoint with a status below 400. */
  | { http: string }
  /** Accepts a connection on its port. */
  | { tcp: true }
  /**
   * Prints a line matching this pattern, as a tunnel prints its address. The match is kept as `readyMatch`. The pattern
   * is at most 200 characters and is matched against each line's first 4,000.
   */
  | { output: string }

/** How a run ended. */
export interface ProcessEnd {
  /** Which run ended. */
  run: number
  /** Stopped on purpose; a task exited; a server stopped by itself; it took too long; or an adopted server went away. */
  how: "stopped" | "exited" | "crashed" | "timeout" | "gone"
  /** For a task: passed with exit code 0, failed otherwise or on a timeout, canceled when it was stopped. */
  outcome?: "passed" | "failed" | "canceled"
  exitCode?: number
  signal?: string
}

/** Where a process is in its life. A server runs until it's stopped; a task runs once, then passes or fails. */
export type ProcessState = "starting" | "running" | "stopping" | "stopped" | "failed" | "passed" | "canceled"

/** Who started a process: Parity, an extension, or nobody Parity knows, adopted by an extension. */
export type ProcessOwner =
  | { kind: "parity"; role: ParityRole; adopted?: boolean }
  | { kind: "extension"; extension: string }
  | { kind: "adopted"; by: string }

/** A process, as Parity lists it. */
export interface ProcessInfo {
  id: string
  name: string
  lifetime: "server" | "task"
  state: ProcessState
  owner: ProcessOwner
  /** Which run this is: 1, then one more each time it starts again. */
  run: number
  /** Where it answers on this machine, once a server listens. */
  endpoint?: Endpoint
  /** The other places it's reached, the preferred one first. */
  addresses: Address[]
  /** What the person's browser opens: the preferred address, else the endpoint. Never a public address. */
  opens?: string
  icon?: IconName
  role?: string
  /** When the current run started, in milliseconds since 1970. */
  startedAt: number
  /** When it stopped or finished, once it has. */
  stoppedAt?: number
  pid?: number
  /** What a running task is doing, as "Checking 34 component files". */
  detail?: string
  /** How far a running task has got, when it knows. */
  progress?: { done: number; total: number }
  /** What a finished task found, as "3 errors in 2 files". */
  summary?: string
  /** Why it failed. */
  error?: string
  /** For a server whose ready check is `output`: the text that matched in the current run. */
  readyMatch?: string
}

/** What one of Parity's own processes does. */
export type ParityRole =
  | "builder"
  | "install"
  | "typecheck"
  | "test"
  | "e2e"
  | "format"
  | "lint"
  | "verify"
  | "build"
  | "export"
  | "accessibility"
  /** A server Parity runs for a tool, where no other role fits. */
  | "tool"

/**
 * Where a server answers on this machine. For a server Parity started, `http://localhost:<port>`, or `tcp` when its
 * ready check is `tcp`.
 */
export interface Endpoint {
  url: string
  port: number
  protocol: "http" | "https" | "tcp"
}

/** Another place a server can be opened. */
export interface Address {
  url: string
  /** What the processes list shows for it, as `storybook.shop.localhost`. */
  label: string
  kind: "name" | "proxy" | "tunnel" | "container" | "network"
  /** Whether anyone on the internet can open it, as a tunnel's can. */
  public: boolean
  /** Who gave it: an extension's id, or `parity`. */
  provider: string
}

/** Why `start` or `adopt` refused, before anything ran. */
export type ProcessErrorCode =
  | "process_spec_invalid"
  | "process_not_permitted"
  | "process_not_found"
  | "process_unsupported"
  | "process_spec_differs"
  | "process_adopted"
  | "process_provider_failed"
  | "process_id_taken"
  | "process_not_local"
