import type { IconName } from "./manifest.ts"

/*
 * A project's processes, as Parity lists them and extensions start, adopt and watch them (docs/proposals/processes.md).
 * Every process goes through the project service's process manager. An extension describes one as data and never
 * spawns anything itself.
 */

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
  /** A server an adapter started, until `packages/adapters` is gone. */
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
