# Proposal: processes in the extension API (PAR-1103)

Status: draft for discussion, 2026-11-14, revised after an independent review the same day. Nothing here is built. It
replaces `parity.servers`, which PAR-1089 built for Storybook alone, and the `parity.processes.run(command)` that
[developer-api.md](developer-api.md#the-project-and-its-files) mentioned. It ends with Portless as an extension, so
nothing in the app or the API names Portless.

## In one line

An extension starts, adopts and watches a project's processes through `parity.processes`, and other extensions change
how those processes run and where they're reached through four providers: addresses, discovery, environment and
launchers. Portless is one extension built on two of them.

## Why not a Portless fix

Portless is built into the app in three places today:

- **The processes list** names a server by its Portless route (`listProcesses` in `utility/processes.ts`, which sets
  `ProjectProcess.domain`).
- **Finding a running server** reads Portless's routes and asks each port whether it's the one wanted
  (`findRoutedServer` in `utility/portless.ts`). Since Storybook moved onto its extension, only adapter actions reach
  it, through `utility/tool-servers.ts`.
- **The extension API** has `parity.servers.routed()`, which returns Portless's routes.

Each is one case of something more general. A server can be reached at more places than `localhost:<port>`: a Portless
name, an HTTPS proxy, a tunnel, a container's mapped port. A server can be running already, found by Portless, by
`docker compose ps` or by a port being in use. A command can need to run inside something else: `doppler run` or a Nix
shell. If Parity knows each of these by name, every new tool is an app change. With providers, each is an extension, and
Portless is the first.

## Use cases

The API is tested against these. "How each case is done" walks through each.

| Case        | Example                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Start       | Storybook's dev server; a docs site; a second app's Vite server; `tsc --watch`                 |
| Run a task  | Vitest once, with progress and a result; a lint; a build                                       |
| Adopt       | A Storybook the person started in a terminal, which Parity uses but never stops                |
| Observe     | The status bar's processes list; an extension that waits for the builder before it measures    |
| Reach       | `https://storybook.shop.localhost` through Portless; a Cloudflare tunnel; a Docker mapped port |
| Discover    | Portless's routes; `docker compose ps`; whatever listens on port 6006                          |
| Environment | Variables from `.env.local`; a variable a test runner needs                                    |
| Wrap        | `doppler run -- <command>`; `nix develop -c <command>`                                         |
| Act on one  | "Share publicly" in a process's menu, from a tunnel extension                                  |

Running a process on another machine, as a devcontainer or SSH launcher would, isn't covered (Open questions).

## Words

- **Process:** anything Parity lists for an open project. It's a **server**, which runs until it's stopped, or a
  **task**, which runs once and ends with a result. A watcher, such as `tsc --watch`, is a server without an endpoint.
- **Run:** one start of a process, until it ends. Restarting a process begins its next run.
- **Endpoint:** where a server answers on this machine, as `http://localhost:6006`. Parity and extensions reach a server
  at its endpoint.
- **Address:** another place a server can be opened, as `https://storybook.shop.localhost`. Address providers give them.
  The person's browser opens a server's preferred address.
- **Owner:** who started a process: Parity, an extension, or nobody Parity knows (adopted, by an extension).
- **Candidate:** a server found running that nothing has adopted yet, from a discovery provider or a port check.
- **Parity's Node:** Electron's own binary run as plain Node (`ELECTRON_RUN_AS_NODE=1`), as the builder and extension
  hosts run today. The project service itself is an Electron utility process.

## Principles

- **One process manager.** Everything still goes through the project service's process manager
  (`utility/process-manager.ts`), which already starts, lists, times and stops servers and ends their trees with the
  service. Extensions describe processes as data. They never spawn anything themselves: once the host runs under Node's
  permission model (developer-api.md, Trust), it can't start child processes at all.
- **Plain data across the boundary.** As with every provider, calls take and return data, never functions. A readiness
  check is a description (`{ http: "/index.json" }`), not a callback. Where an extension needs its own logic, as
  Storybook does to tell its stories from another project's, it gets candidates and checks them itself.
- **Reach the endpoint, open the address.** Parity's own requests go to the endpoint, since Node doesn't trust local
  proxies' certificates. Anything the person opens goes to the preferred address. Keeping the two apart is what lets
  Portless sit in front of any server without the server or its extension knowing.
- **Local unless the person agreed.** An address or a discovered server is on this machine, unless it comes from an
  extension the person allowed to publish. No extension can point Open in your browser at somewhere else.
- **Changing how commands run is opt-in.** An environment provider or a launcher sees and changes every command Parity
  runs, so each is turned on per project, and asked for once for a third-party extension.
- **Nothing names a tool.** The app, the API and the processes list name kinds of thing (a name, a tunnel), never
  Portless or Docker.

## The API

### `parity.processes`

```ts
export interface Processes {
  /**
   * Starts a process, or gives the one this extension already has with the same id while it's starting or running.
   * Settles once it has spawned; `ready()` says when it's ready. Rejects with one of the codes in Errors.
   */
  start(spec: ProcessSpec): Promise<ProcessHandle>
  /**
   * Lists a server found running under this extension, so Parity uses it but never stops it. Throws `process_not_local`
   * for an endpoint not on this machine, and `process_id_taken` for an id this extension uses for a process that's
   * starting or running. It never stops anything.
   */
  adopt(server: Candidate | AdoptSpec, as: { id: string; name: string }): ProcessHandle
  /** Servers running that no process Parity lists already has: from discovery providers, and the ports asked for. */
  find(query?: FindQuery): Promise<Candidate[]>
  /** The project's processes, whoever started them, as this extension may see them (Trust). */
  list(filter?: { owner?: "mine" | "any"; lifetime?: "server" | "task" }): ProcessInfo[]
  /** A process this extension started or adopted, by its id, as after its host started again. */
  get(id: string): ProcessHandle | undefined
  /** Called with the processes that changed: their state, endpoint or addresses. */
  onDidChange(listener: (changed: ProcessInfo[]) => void): Disposable
}
```

`start` replaces `servers.serve`, `adopt` replaces `servers.adopt`, `find` replaces `servers.routed`, and
`handle.stop()` replaces `servers.stop`. `list`, `get` and `onDidChange` are new. `owner: "mine"` means processes this
extension started or adopted.

### What to run

```ts
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
  /** Its folder, relative to the project's root. The root unless said. */
  cwd?: string
  /** Variables it gets, after the service's key-free environment and the environment providers'. */
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
  /** Whether the project's launchers and environment providers apply. True unless said. */
  wrapped?: boolean
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
   * is at most 200 characters and is matched against each line's first 4,000, in the extension's host, not the service.
   */
  | { output: string }
```

**Permissions.** `permissions.processes` lists what an extension may run, one entry per run: `bin:<package>`,
`script:<name>`, `exec:<name>` or `node:<path>`. `{ bin: "vitest" }` needs `bin:vitest`;
`{ bin: "sb", package: "@storybook/cli" }` needs `bin:@storybook/cli`. The manifest check (`readExtension`) refuses a
malformed entry, and `start` refuses a run the manifest doesn't allow.

**How each run starts, on every platform:**

- **`bin`:** Parity resolves `<package>/package.json` from the project, reads its `bin` and runs that script with
  Parity's Node, as the Storybook extension resolves its own command line today (`commandLine` in
  `packages/extension-storybook/src/extension.ts`). No shell and no `.cmd` shim come into it.
- **`node`:** the module's path inside the extension's package, run with Parity's Node.
- **`script`:** the project's package manager, picked as Parity's install task picks it (`detectPackageManager` in
  `utility/libraries.ts`), with `run <script>`. It's found as an `exec` run is, so a standalone or Volta-installed
  `.exe` is spawned directly and a `.cmd` goes through `cmd.exe` with the command line `batchCommandLine` builds
  (`packages/processes`), which escapes `%`, `^`, `&` and the rest as it already does for code editors (PAR-982). It's
  extended to escape `"` in arguments and double the backslashes before one.
- **`exec`:** looked up on the PATH with `commandPaths` (`packages/processes`), which tries PATHEXT's extensions on
  Windows. An `.exe` or `.com` is spawned directly, and a `.cmd` or `.bat` goes through `cmd.exe` as a script does. Any
  other type, as `.ps1`, `.js` or `.vbs`, is refused.

**Electron's variable.** The service sets `ELECTRON_RUN_AS_NODE` for itself and what it starts (`utility/index.ts`).
`bin` and `node` runs keep it, since they are Parity's Node. `script` and `exec` runs get the environment without it, as
`libraries.ts` already does for the package manager, since a project's scripts may launch an Electron app of their own.
An argument holding a newline is refused for every run.

### A running process

```ts
export interface ProcessHandle {
  /** Its id among this extension's processes. `info.id` is its id among the project's. */
  readonly id: string
  /** The latest of what Parity knows of it. */
  readonly info: ProcessInfo
  /**
   * Settles once the current run is ready: a server passes its ready check, a task has started. While no run is
   * starting or running, rejects with the latest run's end and the end of its output.
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
```

Only an extension's own processes have handles, from `start`, `adopt` or `get`. A handle follows its process across
restarts: `ready()` and `ended()` always mean the current run, and `onDidEnd` hears every run's end.

### Errors

Each refusal is an error with a `code`. `start` rejects, or `adopt` throws, before anything runs, and
`processes.refused` records it. Once `start` has settled, anything that goes wrong fails the run instead: `ready()`
rejects, the state is `failed`, and `processes.failed` records it.

| Code                      | From    | When                                                                                                                                                                            |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process_spec_invalid`    | `start` | The spec breaks its schema: `{port}` or an `http` or `tcp` ready check without `port`, an `output` pattern that isn't a valid one or is too long, an argument holding a newline |
| `process_not_permitted`   | `start` | The manifest's `permissions.processes` doesn't allow its run                                                                                                                    |
| `process_not_found`       | `start` | The `bin` package, the script, the package manager or the executable isn't there                                                                                                |
| `process_unsupported`     | `start` | The executable is a type Parity doesn't run, as `.ps1`                                                                                                                          |
| `process_spec_differs`    | `start` | The id is starting or running with a different spec                                                                                                                             |
| `process_adopted`         | `start` | The id names a server this extension adopted that's still running                                                                                                               |
| `process_provider_failed` | `start` | An environment provider or launcher the project turned on failed, named in the error                                                                                            |
| `process_id_taken`        | `adopt` | The id is starting or running already                                                                                                                                           |
| `process_not_local`       | `adopt` | The endpoint isn't on this machine                                                                                                                                              |

A run fails, after `start` settled, when it can't spawn (`spawn`), exits before it's ready (`exited`), or isn't ready
within `timeoutMs` (`timeout`).

### What extensions can see

```ts
export interface ProcessInfo {
  /** Unique among the project's processes, as `@parity-app/extension-storybook:storybook`. */
  id: string
  name: string
  lifetime: "server" | "task"
  state: "starting" | "running" | "stopping" | "stopped" | "failed" | "passed" | "canceled"
  owner:
    | { kind: "parity"; role: ParityRole }
    | { kind: "extension"; extension: string }
    | { kind: "adopted"; by: string }
  /** Which run this is: 1, then one more each time it starts again. */
  run: number
  /** Where it answers on this machine, once a server listens. */
  endpoint?: Endpoint
  /** The other places it's reached, from address providers, the preferred one first. */
  addresses: Address[]
  /** What the person's browser opens: the preferred address, else the endpoint. Never a public address. */
  opens?: string
  icon?: IconName
  role?: string
  startedAt: number
  stoppedAt?: number
  pid?: number
  detail?: string
  progress?: { done: number; total: number }
  summary?: string
  /** Why it failed. With the end of its output only for its owner and an extension with `observe` (Trust). */
  error?: string
  /** For a server whose ready check is `output`: the text that matched in the current run. Owner and `observe` only. */
  readyMatch?: string
}

/** What one of Parity's own processes does: today's `ServerKind` and `TaskKind`. */
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
 * For a server Parity started, `http://localhost:<port>`, or `tcp` when its ready check is `tcp`. For a port check's
 * candidate, whichever of `127.0.0.1` and `[::1]` answered, as `http`. A discovery provider says its own.
 */
export interface Endpoint {
  url: string
  port: number
  protocol: "http" | "https" | "tcp"
}

export interface Address {
  url: string
  /** What the processes list shows for it, as `storybook.shop.localhost`. */
  label: string
  kind: "name" | "proxy" | "tunnel" | "container" | "network"
  /** Whether anyone on the internet can open it, as a tunnel's can. */
  public: boolean
  /** The extension whose provider gave it. */
  provider: string
}
```

An extension finds Parity's own processes by `owner.role`, never by their names, which can change. Ids are
`<extension id>:<spec id>` for an extension's, `parity:<role>` for Parity's own (`parity:builder`, `parity:typecheck`),
and `parity:tool:<adapter>:<server>` for an adapter's server. A server an adapter adopted keeps `owner.role: "tool"`.

**Today's `ProjectProcess`** (`shared/protocol.ts`) becomes the window's version of `ProcessInfo`. The window keeps a
few fields the API doesn't give, since a host belongs to one project and controls are the window's:

| `ProjectProcess`                                                          | Becomes                                                                                                                                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `name`, `lifetime`                                                  | The same. An `id` is unique within its project, so the window and the service's `processes.stop`, `processes.restart` and `processes.dismiss` key a process by `projectId` and `id` together |
| `kind`                                                                    | `owner.role` for Parity's own, `tool` and `e2e` included; `icon` and `role` for extensions'                                                                                                  |
| `status`                                                                  | `state`                                                                                                                                                                                      |
| `url`                                                                     | `endpoint.url`                                                                                                                                                                               |
| `domain`                                                                  | `addresses`, and `opens`                                                                                                                                                                     |
| `startedBy`                                                               | `owner`                                                                                                                                                                                      |
| `projectId`, `project`, `canStop`, `canRestart`                           | Kept in the window's version; not in the API's                                                                                                                                               |
| `startedAt`, `stoppedAt`, `pid`, `detail`, `progress`, `summary`, `error` | The same                                                                                                                                                                                     |

### Finding servers

```ts
export interface FindQuery {
  /** Ports to check, as Storybook's usual 6006. A server answering a connection there is a candidate. */
  ports?: number[]
  /** Whether to ask the discovery providers. True unless said. */
  discovered?: boolean
}

export interface Candidate {
  /** Unique among this call's results. Pass the candidate itself to `adopt`. */
  key: string
  endpoint: Endpoint
  /** The addresses it's known by, from the provider that found it and from the address providers. */
  addresses: Address[]
  /** What found it: a port check, or a discovery provider's extension. */
  foundBy: { kind: "port" } | { kind: "provider"; extension: string }
  name?: string
  pid?: number
  /** The folder it runs in, when the provider knows, which says whose project it's for. */
  cwd?: string
}

export interface AdoptSpec {
  endpoint: Endpoint
}
```

`find` leaves out every port a process Parity lists already answers on, whoever owns it, so a find while Storybook
starts doesn't offer Parity's own Storybook back. A port check connects to `127.0.0.1` and `[::1]`, rather than binding
the port as `choosePort` does, so a server listening on only one of them is found.

`find` doesn't decide which candidate is the right one. That needs the extension's own knowledge, as Storybook asks each
candidate's `/index.json` for its story files. The extension reaches each `endpoint`, keeps the one it wants and adopts
it.

## Providers

Providers are declared in the manifest's `contributes.providers` and registered in `activate` with
`parity.providers.register(kind, provider)`, as developer-api.md sets out. Neither `parity.providers` nor its registry
is built yet. These four are the first, before PAR-1095's renderer, builder and the rest, so the registry arrives with
them. They're added to `Providers` in `manifest.ts`:

```ts
export interface Providers {
  // …renderer, builder, styles, router, entities, connector, search
  /** Says where else a server is reached. */
  addresses?: Record<string, never>
  /** Finds servers running that Parity didn't start. */
  discovery?: Record<string, never>
  /** Adds variables to the processes Parity starts. Turned on per project. */
  environment?: Record<string, never>
  /** Runs the processes Parity starts inside another command. Turned on per project. */
  launcher?: Record<string, never>
}
```

`register` returns a `ProviderHandle`, a `Disposable` with `changed()`. An extension calls `changed()` when what it
would answer has changed, as Portless's routes do, and Parity asks again.

**Time limits and failures.** Every provider call has a time limit: 2 seconds for addresses, 5 for discovery,
environment and launchers. A call that throws, runs out of time or returns data its schema refuses:

- **Addresses or discovery:** that provider's answer is left out, and the rest go ahead.
- **Environment or a launcher:** `start` fails, naming the provider. Running without the variables or the wrapper the
  project turned on would run the wrong thing, as a server without its secrets.

Either way the failure goes to the provider's log tab and to telemetry (`processes.providerFailed`).

### Addresses

```ts
export interface AddressProvider {
  /** The other places each server is reached. Asked for every server with an endpoint, a batch at a time. */
  addresses(servers: ServerFacts[]): Promise<{ server: string; addresses: Omit<Address, "provider">[] }[]>
}

/** What an address provider is told about a server. Nothing of its output or environment. */
export interface ServerFacts {
  id: string
  name: string
  endpoint: Endpoint
  pid?: number
  /** Its folder, when Parity knows it: always for one it started, not always for one adopted. */
  cwd?: string
}
```

Parity asks when a server's endpoint is first known, and again for every server when the provider calls `changed()`.

**Only local, unless allowed to publish.** An address's URL is `http` or `https`. Its host is one of:

- **On this machine:** `localhost`, `127.0.0.1`, `[::1]` or under `.localhost`, for any kind but `network` and `tunnel`.
- **On the local network:** a private address (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fd00::/8`) or a name
  under `.local`, for `network` only.
- **Anywhere else:** only with `public: true`, from an extension with `permissions.publish`.

Parity drops any other, with `processes.providerFailed` (`reason: "refused"`). `public` means anyone on the internet can
open it.

**Which opens.** Parity ranks addresses on this machine for `opens`: a name, then a proxy, then a container's, then the
endpoint. A network address is `opens` only when the person picks Network in Settings, since it can name another
machine. A public address is never `opens`: the person opens or copies it from the process's menu.

### Discovery

```ts
export interface DiscoveryProvider {
  /** Servers running now that Parity didn't start, for the open project. */
  discover(project: { root: string }): Promise<DiscoveredServer[]>
  /** How long an answer stays good, in milliseconds. Kept until `changed()` unless said. */
  maxAgeMs?: number
}

export interface DiscoveredServer {
  /** Stable while the server runs, as `storybook.shop` for a route. */
  key: string
  /** On this machine: Parity drops a server whose endpoint isn't. */
  endpoint: Endpoint
  name?: string
  pid?: number
  cwd?: string
  /** Addresses the provider knows it by, as a route's name. The same rules as an address provider's. */
  addresses?: Omit<Address, "provider">[]
}
```

Parity asks only when an extension calls `find`. It keeps each provider's last answer until `changed()` or until it's
older than `maxAgeMs`, so a `find` is quick when nothing has changed. Candidates aren't listed in the processes list
until something adopts them, so a machine with many Portless routes or containers doesn't fill the list.

Parity's own port check isn't a provider, so finding a server on its usual port works without any extension.

### Environment

```ts
export interface EnvironmentProvider {
  /** Variables for a process about to start. */
  environment(process: LaunchFacts): Promise<Record<string, string>>
}

/** What environment providers and launchers are told about a process about to start. */
export interface LaunchFacts {
  id: string
  name: string
  lifetime: "server" | "task"
  run: Run
  cwd: string
  owner: ProcessInfo["owner"]
}
```

Variables are merged in this order, later ones winning: the service's key-free environment, the environment providers in
the order the project's settings list them, then the spec's own `env`.

**A provider's values are secrets.** Before the process starts, the service adds them to its secret scrubbing
(`shared/secret-scrubbing.ts`, which today holds the open projects' `.env` values), which passes them to telemetry with
`setSecrets`. So they're replaced in the process's output wherever it's shown or sent: its owner's log tab, `error`, and
the 50 lines telemetry sends when it fails. They never appear in `info`, and the extension that started the process
never sees them, though the process itself does.

### Launchers

```ts
export interface LauncherProvider {
  /** The command line to run instead, around the one given; or undefined to leave it as it is. */
  wrap(process: LaunchFacts, command: CommandLine): Promise<CommandLine | undefined>
}

export interface CommandLine {
  command: string
  args: string[]
  /** The merged environment, the environment providers' secrets included. */
  env: Record<string, string>
}
```

A launcher gets the resolved command line, after `{port}` is filled in and a `bin` or `node` run is resolved to Parity's
Node and a script. It returns another, as `doppler run -- <command>` or `nix develop -c <command>`. Its `command` is
resolved as an `exec` run is, on every platform. Launchers apply in the order the project's settings list them, each
wrapping the last one's result, so the first is innermost.

**What launchers wrap:** every process an extension starts, unless its spec says `wrapped: false`, and Parity's own
tasks. Never a process Parity forks with an IPC channel, as the builder and extension hosts are, since a wrapper would
cut the channel, nor a worker thread, as the props worker is. Parity's type check runs in the service rather than as a
command, so it isn't wrapped either. A `bin` or `node` run is wrapped as Parity's Node and its script, which works for a
wrapper that runs it on this machine, as Doppler and Nix do.

The process manager owns whatever it spawns, wrapped or not: Stop and the project's closing end its whole tree, and its
exit is the outermost command's. A launcher can't change a process's port or ready check.

## Where it shows

### The processes list

The status bar's processes list (`chrome/Processes.tsx`) draws the window's `ProcessInfo`:

- **An extension's process** shows its `icon` and `role`, with the extension's logo beside its name.
- **Addresses.** The row shows `opens`. Its menu lists every address under its label, each with Open in your browser and
  Copy, and a public one marked with a globe and "Anyone with the link can open it".
- **Output.** Show output opens the owner's log tab in the bottom panel, filtered to the process. Parity's own processes
  keep showing their error and summary as they do today.
- **Extensions' commands.** A new menu placement, `process`, adds an extension's commands to a process's menu, with the
  target `{ type: "process", id }`.

`CommandTarget` gains `{ type: "process"; id: string }`, and `MenuPlacement` gains `"process"`. For a process target,
Parity sets these context keys, which `when` and `enablement` test as `key` or `!key`, as menus do today
(`MenuItem.when` in `manifest.ts`):

| Key                   | Holds when the process…                                       |
| --------------------- | ------------------------------------------------------------- |
| `process.isServer`    | is a server                                                   |
| `process.hasEndpoint` | is a server whose endpoint is known                           |
| `process.isRunning`   | is running                                                    |
| `process.isMine`      | was started or adopted by the extension the menu item is from |
| `process.isParitys`   | is one of Parity's own                                        |

The manifest check (`contextNeedsPrefix` in `packages/extensions/src/manifest.ts`) refuses a `when` key without the
extension's prefix today, so it learns Parity's own keys, starting with these.

### Settings

- **The project's page** (PAR-1090) gets a Processes section with each environment provider and each launcher installed,
  off until turned on, in the order they apply. These are kept in the project's `.par` with the extension settings
  PAR-1090 adds, so a team that runs everything through Doppler turns it on once for everyone.
- **The app's settings** get Open servers at: Automatic, Name, Proxy, Network or Local, for which kind of address
  `opens` prefers. It's the person's own, since one teammate may run Portless and another not.

## Trust

For a third-party extension (PAR-1098), on top of developer-api.md's Trust:

| What                    | Declared as                                                  | Asked                                                                                                                        |
| ----------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Starting a process      | `permissions.processes`: `bin:`, `script:`, `exec:`, `node:` | Once, listing each command it may run                                                                                        |
| Reading others' output  | `permissions.observe: true`                                  | Once: "Read what other processes print"                                                                                      |
| Giving a public address | `permissions.publish: true`                                  | Once: "Share your servers on the internet"                                                                                   |
| An address provider     | `contributes.providers.addresses`                            | Not asked: its addresses must be local unless it may publish                                                                 |
| A discovery provider    | `contributes.providers.discovery`                            | Not asked: its servers must be local                                                                                         |
| An environment provider | `contributes.providers.environment`                          | Once, and turned on per project: "Adds variables to every command Parity runs"                                               |
| A launcher              | `contributes.providers.launcher`                             | Once, and turned on per project: "Runs every command Parity runs inside its own, and sees their variables, secrets included" |

`permissions` gains `observe` and `publish` in `manifest.ts`.

**What `list` shows to whom.** Every extension sees every process's name, state, owner, endpoint and local addresses,
which say what's running and nothing it printed. Only the process's owner, and an extension with `observe`, also get:

- `error` with the end of its output. Others get `error` as a fixed phrase, "Couldn't start" or "Stopped by itself".
- `readyMatch`.
- Public addresses, which the provider that gave them sees too.

The window sees everything.

**Outside Node's permission model.** A process an extension starts isn't bound by its host's Node permissions: an `exec`
or `script` run is a program of its own, and a `node` run is a separate Parity's Node without the host's flags. The
prompt lists each command, so the person sees what it can run. A launcher sees every command line and environment, which
its prompt says.

Parity's own and built-in extensions run with what they declare.

## How each case is done

Examples write `activate(parity)` as a plain export. PAR-1102's `defineExtension` would wrap it.

### Storybook: start, adopt and open

```ts
async function serve(storybook: DetectedStorybook): Promise<ProcessHandle> {
  // Ours already, started or adopted earlier, or before the host started again.
  const known = parity.processes.get("storybook")

  if (known && !["stopped", "failed"].includes(known.info.state)) return known

  const wanted = storybook.port ?? 6006
  const paths = storyPaths(storybook)

  // Without stories to check, a discovered Storybook could be any project's, so only the usual port is tried.
  const candidates = await parity.processes.find({ ports: [wanted], discovered: paths.length > 0 })
  const serving: Candidate[] = []

  for (const candidate of candidates) {
    if (servesStories(await storyIndex(candidate.endpoint.url), paths)) serving.push(candidate)
  }

  // Two worktrees can serve the same stories: the one serving this checkout's files is ours.
  const mine: Candidate[] = []

  for (const candidate of serving) {
    if (serving.length === 1 || (await servesFrom(candidate.endpoint.url, parity.project.root))) mine.push(candidate)
  }

  if (mine.length === 1) return parity.processes.adopt(mine[0], { id: "storybook", name: "Storybook" })

  return parity.processes.start({
    id: "storybook",
    name: "Storybook",
    lifetime: "server",
    run: { bin: "storybook" },
    args: ["dev", "--port", "{port}", "--no-open", "--ci", "--config-dir", storybook.configDir],
    port: { prefer: wanted },
    ready: { http: "/index.json" },
    env: { BROWSER: "none" },
    icon: "book-open",
    role: "Serves stories"
  })
}

const server = await serve(storybook)
const { opens, endpoint } = await server.ready()
// The index is read at the endpoint; the page opens at the preferred address, a Portless name when there is one.
const entries = await storyIndex(endpoint!.url)
await parity.ui.open(storyPage(opens ?? endpoint!.url, entries, storyPaths(storybook)))
```

Manifest: `"permissions": { "processes": ["bin:storybook"] }`.

Compared with today's `extension.ts`, its own command-line lookup (`commandLine`), the Portless branch and
`servers.routed` go: a routed Storybook is a candidate like any other, found by Portless's discovery provider.
`servesFrom` stays, as above. Its `running ??=` guard goes too, since `start` shares one start between two calls.

### Portless as an extension

```json
{
  "name": "@parity-app/extension-portless",
  "parity": {
    "displayName": "Portless",
    "prefix": "portless",
    "icon": { "viewBox": "0 0 24 24", "path": "…" },
    "activates": ["onStartup"],
    "permissions": { "read": ["~/.portless/**", "$PORTLESS_STATE_DIR/**"] },
    "contributes": {
      "providers": { "addresses": {}, "discovery": {} }
    }
  }
}
```

```ts
export function activate(parity: Parity) {
  // Portless's folder: PORTLESS_STATE_DIR, as Parity honours today, else its default.
  const folder = process.env.PORTLESS_STATE_DIR ?? join(homedir(), ".portless")
  let state = readState(folder) // routes.json, proxy.port and proxy.tls, as utility/portless.ts reads them

  const addresses = parity.providers.register("addresses", {
    async addresses(servers) {
      const { routes, address } = await state

      return servers.map((server) => ({
        server: server.id,
        addresses: routes
          .filter((route) => route.port === server.endpoint.port)
          .map((route) => ({ url: address(route.hostname), label: route.hostname, kind: "name", public: false }))
      }))
    }
  })

  const discovery = parity.providers.register("discovery", {
    async discover() {
      const { routes, address } = await state

      return routes.map((route) => ({
        key: route.hostname,
        name: route.hostname,
        pid: route.pid,
        endpoint: { url: `http://localhost:${route.port}`, port: route.port, protocol: "http" },
        addresses: [{ url: address(route.hostname), label: route.hostname, kind: "name", public: false }]
      }))
    }
  })

  // Routes come and go as servers start and stop.
  parity.subscriptions.push(
    parity.files.watch(join(folder, "routes.json"), () => {
      state = readState(folder)
      addresses.changed()
      discovery.changed()
    }),
    addresses,
    discovery
  )
}
```

Portless's addresses are under `.localhost`, so they're local and need no `publish`. `permissions.read` names both
Portless's default folder and `$PORTLESS_STATE_DIR`, since step 3 lets a read path start with a variable.

What leaves the app: `utility/portless.ts`, the Portless lookup in `listProcesses`, `findRoutedServer` (and the rest of
`utility/tool-servers.ts` once no adapter action uses it), `ProjectProcess.domain`, and `servers.routed()`. `readState`
and the dead-route check move into the extension, with their tests. When PAR-1090's extension settings land, a
`portless.stateFolder` setting can sit before the variable.

Without Portless installed, `routes.json` doesn't exist, both providers answer nothing, and the extension costs an idle
host. A `detect` module (developer-api.md, The manifest) that checks for the folder would keep it from starting, and is
the better default once `detect` modules exist.

### A tunnel: an action on a process, and a public address

A Cloudflare tunnel extension adds Share publicly to a server's menu:

```json
"permissions": { "processes": ["exec:cloudflared"], "publish": true },
"contributes": {
  "commands": [{ "id": "tunnel.share", "title": "Share publicly", "icon": "globe" }],
  "menus": { "process": [{ "command": "tunnel.share", "when": "process.hasEndpoint" }] },
  "providers": { "addresses": {} }
}
```

```ts
const shared = new Map<string, string>() // server id → its public address

const addresses = parity.providers.register("addresses", {
  async addresses(servers) {
    return servers.map((server) => ({
      server: server.id,
      addresses: shared.has(server.id)
        ? [{ url: shared.get(server.id)!, label: "Public link", kind: "tunnel", public: true }]
        : []
    }))
  }
})

parity.commands.register("tunnel.share", async (target) => {
  if (target?.type !== "process") return

  const server = parity.processes.list().find((each) => each.id === target.id)

  if (!server?.endpoint) return
  if (!(await parity.ui.confirm(`Share ${server.name} publicly?`, { detail: "Anyone with the link can open it." })))
    return

  const tunnel = await parity.processes.start({
    id: `tunnel:${server.id}`,
    name: `${server.name} tunnel`,
    lifetime: "server",
    run: { exec: "cloudflared" },
    args: ["tunnel", "--url", server.endpoint.url],
    ready: { output: "https://[a-z0-9-]+\\.trycloudflare\\.com" },
    restart: "onCrash",
    wrapped: false
  })

  // Each run gets a new address, kept while it runs.
  tunnel.onDidChange((info) => {
    if (info.state === "running" && info.readyMatch) shared.set(server.id, info.readyMatch)
    else shared.delete(server.id)

    addresses.changed()
  })

  await tunnel.ready()
})
```

The tunnel is a process of its own, listed beside the server, stopped from the list like any other. After its host
starts again, the extension gets each tunnel back with `get` and its address from `info.readyMatch`. Its address shows
on the server it shares, in the menu, never as `opens`.

### Docker Compose: discovery from a task

```ts
parity.providers.register("discovery", {
  // Containers start and stop without telling anyone.
  maxAgeMs: 10_000,
  async discover({ root }) {
    const ps = await parity.processes.start({
      id: "compose-ps",
      name: "List containers",
      lifetime: "task",
      run: { exec: "docker" },
      args: ["compose", "ps", "--format", "json"],
      wrapped: false,
      quiet: true
    })

    if ((await ps.ended()).outcome !== "passed") return []

    return publishedPorts(ps.output.tail()).map((port) => ({
      key: `${port.service}:${port.published}`,
      name: port.service,
      cwd: root,
      endpoint: { url: `http://localhost:${port.published}`, port: port.published, protocol: "http" }
    }))
  }
})
```

Manifest: `"permissions": { "processes": ["exec:docker"] }, "contributes": { "providers": { "discovery": {} } }`.
`quiet` keeps each run out of the processes list and telemetry unless it fails. Two `find`s at once share one run.

### Environment from `.env` files

```ts
parity.providers.register("environment", {
  async environment(process) {
    const files = [".env", ".env.local"].map((name) => join(process.cwd, name))
    const read = await Promise.all(files.map((file) => parity.files.read(file).catch(() => "")))

    return Object.assign({}, ...read.map(parseDotenv))
  }
})
```

Manifest: `"permissions": { "read": [".env", ".env.*"] }, "contributes": { "providers": { "environment": {} } }`. It
applies once the person turns it on in the project's settings.

### Doppler: a launcher

```ts
parity.providers.register("launcher", {
  async wrap(process, command) {
    return { command: "doppler", args: ["run", "--", command.command, ...command.args], env: command.env }
  }
})
```

Manifest: `"contributes": { "providers": { "launcher": {} } }`. The process manager spawns what `wrap` returns, so the
launcher needs no `permissions.processes` for `doppler`: the prompt for a launcher already says it runs every command
inside its own.

### Tests as a task

```ts
const run = await parity.processes.start({
  id: "vitest",
  name: "Unit tests",
  lifetime: "task",
  run: { bin: "vitest" },
  args: ["run", "--reporter=json"],
  icon: "flask-conical",
  role: "Runs unit tests"
})

run.output.onLines((lines) => {
  const counts = countTests(lines)
  run.report({ detail: `${counts.done} of ${counts.total} tests`, done: counts.done, total: counts.total })
})

const end = await run.ended()
run.summarize(end.outcome === "passed" ? "All tests pass" : `${failing(run.output.tail())} failing`)
```

### Waiting for the builder

```ts
const isBuilder = (each: ProcessInfo) => each.owner.kind === "parity" && each.owner.role === "builder"

parity.processes.onDidChange((changed) => {
  const builder = changed.find(isBuilder)

  if (builder?.state === "running" && builder.endpoint) measureRoutes(builder.endpoint.url)
})
```

## Lifecycle

- **One start per id.** While a process is starting or running, a second `start` with the same id and spec gives the
  same process, as `tool-servers.ts` keeps a promise per server today. Today's `servers.serve` doesn't: two calls at
  once both pass its check, and the second's `startServer` stops the first, since `startServer` begins by stopping any
  server with its id; only Storybook's own `running ??=` guard keeps that from happening. A different spec under a
  running id rejects with `process_spec_differs`, so a caller that wants different arguments stops it first. Once a
  process has ended, its id can be started again, and the new process takes the ended one's place in the list. A `start`
  while its id is stopping waits for the stop, then starts.
- **A process belongs to its owner and the project.** It stops when the project closes, when its extension's tool is no
  longer detected, when the extension is turned off or uninstalled, and when the service exits. Main ends its tree if
  the service crashes, as it does today (PAR-1019).
- **A host that stops doesn't stop its processes.** A crash, a restart while stuck, being left stopped after three
  crashes, and a reload during development all leave them running. When the host starts again,
  `parity.processes.get(id)` gives back each process it owns, and `processes.reattached` records it. While a host is
  left stopped, its processes stay in the list with Stop, and its commands on them are hidden. This changes
  developer-api.md, and today's code: `extensionHosts` calls `servers.stopAll` whenever a host stops (`detach` in
  `packages/extensions/src/hosts.ts`), which moves to the project's closing and the extension's removal.
- **An adopted server is let go, never stopped,** by Stop, the project's closing or the extension's stopping.
- **An adopted server that goes away** is noticed: every 5 seconds Parity checks its pid when it knows one, as
  Portless's dead-route check does, or else connects to its endpoint. After two failed checks in a row it's `stopped`,
  its run ends with `how: "gone"`, and `processes.lost` records it.
- **A server that crashes** is listed as failed with the end of its output, or started again when its spec says
  `restart: "onCrash"`, up to three times a minute.

## Telemetry

Every event follows [telemetry.md](../telemetry.md): a `defineEvent` in `@parity-app/telemetry` with a zod schema,
`.describe()` on every attribute, a level, `sentBy` and `when`, and a row in the generated catalog. All are in one area,
`processes`, beside the existing `process.memory`, which is about the app's own memory and stays.

- **Replaced:** `server.started` and `server.failed`, by `processes.started` and `processes.failed`.
- **Kept:** `builder.started`, `builder.ready`, `builder.crashed` and `builder.restarted`. The builder is listed through
  the manager as a process with `owner.role: "builder"`, but no `processes.*` event is sent for it, so its events aren't
  doubled.
- **Settings:** changing the Processes settings sends the existing `setting.changed`, with `setting` as
  `processes.environment`, `processes.launchers` (each value the list of extension ids turned on, as JSON) or
  `processes.opens`. Its `when` widens from "A preference or the telemetry level is changed" to take in a project's
  settings. No new settings event.

**What's never sent:** a command's arguments, a variable's value, a launcher's command line, or a public address.
Arguments and variables can hold keys, and a tunnel's address opens the person's server to anyone. Output and messages
go through the service's scrubbing first, which holds the environment providers' values as well as `.env` values. A
process's `name` and an extension's id go as written, as telemetry.md's "send it as it is, except secrets" says.

**Volume:** a `quiet` task sends only `processes.failed` or a failed `processes.taskFinished`. `processes.found` keeps 1
in 10. Parity's own tasks that run on every change, as the type check, send `processes.taskFinished` only when the
outcome differs from the last run's. The install task sends no `processes.*` event, since `library.added` and
`library.failed` already cover it.

Common attributes, where an event lists them:

| Attribute    | Type                                                | Meaning                                                                         |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `lifetime`   | `"server" \| "task"`                                | Whether it runs until it's stopped or once                                      |
| `name`       | `string`                                            | Its name, as the processes list shows it                                        |
| `owner`      | `string`                                            | `parity`, or the id of the extension that started or adopted it                 |
| `role`       | `string`                                            | For Parity's own, its `ParityRole`; else the role its spec gives, or empty      |
| `runKind`    | `"bin" \| "script" \| "exec" \| "node" \| "parity"` | What kind of command it runs; `parity` for Parity's own                         |
| `command`    | `string`                                            | The package, script, executable or module it runs, as `storybook`; no arguments |
| `durationMs` | `number`                                            | How long it took, in milliseconds                                               |

### Sent by the service

| Event                      | Level | When                                                                                                                    | Attributes beyond the common ones                                                                                                                                                                          |
| -------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `processes.started`        | info  | A process Parity started is ready: a server passes its ready check, a task has spawned                                  | common; `ready`: `"http" \| "tcp" \| "output" \| "none"`; `portMoved`: whether the port it asked for was taken; `launchers` and `environments`: how many applied; `run`: its run number                    |
| `processes.failed`         | warn  | A run fails before it's ready                                                                                           | common; `reason`: `"exited" \| "timeout" \| "spawn"`; `exitCode`; `signal`; `output`: its last 50 lines, scrubbed                                                                                          |
| `processes.crashed`        | warn  | A running server stops by itself                                                                                        | common without `durationMs`; `uptimeMs`; `exitCode`; `signal`; `restarting`: whether `onCrash` starts it again; `output`: its last 50 lines, scrubbed                                                      |
| `processes.stopped`        | info  | A process is stopped on purpose                                                                                         | common without `durationMs`; `uptimeMs`; `by`: `"person" \| "extension" \| "project" \| "undetected" \| "service" \| "removed"`                                                                            |
| `processes.restarted`      | info  | A process starts its next run                                                                                           | common; `by`: `"person" \| "extension" \| "crash"`; `outcome`: `"ok" \| "error"`                                                                                                                           |
| `processes.taskFinished`   | info  | A task ends, and its owner has summarized it or 5 seconds have passed. `warn` when it failed                            | common; `outcome`: `"passed" \| "failed" \| "canceled"`; `how`: `"exited" \| "timeout" \| "stopped"`; `exitCode`; `reported`: whether its owner set progress or a summary by then                          |
| `processes.adopted`        | info  | An extension adopts a running server                                                                                    | `name`; `owner`; `foundBy`: `"port" \| "provider" \| "endpoint"`; `provider`: the discovery provider's extension, when one found it                                                                        |
| `processes.lost`           | warn  | An adopted server goes away                                                                                             | `name`; `owner`; `adoptedForMs`; `checkedBy`: `"pid" \| "connect"`                                                                                                                                         |
| `processes.reattached`     | info  | A host that started again gets back the processes it owns                                                               | `owner`; `processes`: how many; `hostStopped`: `"crash" \| "stuck" \| "reload"`                                                                                                                            |
| `processes.refused`        | warn  | `start` or `adopt` is refused, before anything runs                                                                     | `owner`; `runKind`; `command`; `code`: one of Errors' codes; `provider`: the extension whose environment or launcher failed, for `process_provider_failed`                                                 |
| `processes.found`          | info  | An extension's `find` returns. Keeps 1 in 10                                                                            | `owner`; `ports`: how many it asked about; `candidates`; `providers`: how many were asked; `cached`: how many answered from their last answer; `durationMs`                                                |
| `processes.providerFailed` | warn  | A provider call throws, runs out of time, returns data its schema refuses, or gives an address or server Parity refuses | `provider`: the extension's id; `kind`: `"addresses" \| "discovery" \| "environment" \| "launcher"`; `reason`: `"error" \| "timeout" \| "invalid" \| "refused"`; `durationMs`; `message`: scrubbed; `code` |
| `processes.providerSlow`   | info  | A provider call takes over half its time limit but answers                                                              | `provider`; `kind`; `durationMs`                                                                                                                                                                           |

A provider's failure in one of Parity's own extensions is also a Sentry issue, since it's Parity's bug. A third-party
extension's is only the event, with its id, and a line in its log tab.

### Sent by the renderer

| Event                     | Level | When                                                         | Attributes                                                                                                                                   |
| ------------------------- | ----- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `processes.listOpened`    | info  | The person opens the processes list                          | `servers`, `tasks`, `failed`: how many of each it shows; `extensions`: how many extensions own them                                          |
| `processes.addressOpened` | info  | The person opens a server in their browser                   | `owner`; `kind`: `"local" \| "name" \| "proxy" \| "tunnel" \| "container" \| "network"`; `provider`; `from`: `"list" \| "menu" \| "command"` |
| `processes.addressCopied` | info  | The person copies one of a server's addresses                | `owner`; `kind`; `provider`; `public`                                                                                                        |
| `processes.outputShown`   | info  | The person opens a process's output                          | `owner`; `state`: its state then                                                                                                             |
| `processes.commandRun`    | info  | The person runs an extension's command from a process's menu | `extension`; `command`: the command's id; `lifetime` and `owner` of the process it ran on                                                    |

### Spans

`processes.start` covers a `start` call from the request to the run being ready, as a child of whatever span the call
came from (an extension's command, through its host). Its children are `processes.environment` and `processes.wrap`, one
per provider, `processes.port` while a port is chosen, and `processes.ready` while the ready check is asked.
`processes.find` covers a `find` call, with a `processes.discover` child per provider. Provider spans carry `provider`
and `kind`.

## Code

- **`@parity-app/processes`,** the existing pure package (no Node or Electron, packages.md), gains the model: checking a
  `ProcessSpec`, matching a `Run` against `permissions.processes`, filling `{port}`, merging environments in order,
  chaining launchers, checking that addresses and endpoints are local, ranking addresses into `opens`, keeping
  providers' answers with their ages, and stripping `ProcessInfo` for an extension that may not see everything. It
  already has `commandPaths` and `batchCommandLine`. Its tests cover each.
- **The project service** keeps spawning, ports, ready checks, adopted servers' checks and output (`process-manager.ts`,
  `processes.ts`), taking a resolved command line from the model, and answers the host's process and provider methods.
- **`@parity-app/extension-api`** gains `Processes`, `ProcessHandle`, `ProcessInfo`, `ProviderHandle` and the four
  providers, `observe` and `publish` in `Permissions`, the `process` placement and target, and loses `Servers`.
- **`@parity-app/extensions`** routes `parity.processes`, `parity.providers` and provider calls between host and
  service, drops `servers.*`, and stops processes only on the project's closing and the extension's removal.
- **The window** draws its `ProcessInfo` in `Processes.tsx`, adds the `process` placement and its context keys, and the
  settings.

## Order of work

1. **The model and the manager.** The model in `@parity-app/processes`; the process manager takes a `ProcessSpec`, a
   ready check and a promise per id; `ProjectProcess` becomes the window's `ProcessInfo`; Parity's own builder and tasks
   listed through it; the `processes.*` events replace `server.*`.
2. **`parity.processes`** in the API and the host, with `start`, `adopt`, `find` (ports only), `list`, `get`, output,
   the visibility rules, adopted servers' checks, and processes outliving a host. Storybook moves onto it, and
   `parity.servers` goes, except `servers.routed`, which stays until step 3 so Storybook keeps opening at its Portless
   name. Steps 2 and 3 can ship together instead.
3. **Address and discovery providers,** with `parity.providers.register` and its registry, the processes list's
   addresses, and Portless as an extension. Neither `parity.files` nor reading outside the project exists yet, so this
   step adds `parity.files.watch` and `parity.files.read`, and lets `permissions.read` name a path under `~/`, limited
   to the paths declared. `utility/portless.ts` and `domain` go.
4. **The `process` menu placement,** its context keys and `permissions.publish`, tried with a tunnel extension kept in
   `examples/`.
5. **Environment providers and launchers,** with the project's Processes settings (needs PAR-1090) and the permission
   prompts (with PAR-1098).

Steps 1 to 3 finish PAR-1103. Steps 4 and 5 are their own issues. Nothing in steps 1 to 3 waits on PAR-1102's
`defineExtension` or PAR-1090's settings.

## Open questions

- **Output from others.** `observe` is all or nothing. A tool that only needs the builder's output could ask for it by
  role instead.
- **Ports a launcher changes.** A launcher that moves a server to another port, as some proxies' own commands do, would
  break the endpoint. This proposal forbids it; a launcher that needs it would say the port in its result.
- **Remote machines.** An endpoint is on this machine, and a `bin` run is Parity's Node, which doesn't exist inside a
  devcontainer or on an SSH host. Running there needs a launcher that says where the process runs, how its port is
  forwarded and how a `bin` is resolved there.

## Decided

- **One manager, providers around it.** Tools that change where servers are reached, what runs, or what's running are
  providers, never app code.
- **Extensions find, Parity reaches.** `find` returns candidates; deciding which is right stays with the extension.
- **Local unless allowed to publish.** Addresses and discovered servers are on this machine unless the extension may
  publish, and `opens` is never public.
- **A host that stops leaves its processes running,** which changes developer-api.md.
- **Environment providers and launchers are off until a project turns them on,** and their failures stop the start.
- **Telemetry never carries arguments, variables or public addresses,** and every event is in the `processes` area.
