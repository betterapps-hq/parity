# Proposal: processes in the extension API (PAR-1103)

Status: draft for discussion, 2026-11-14. Nothing here is built. It replaces `parity.servers` in
[developer-api.md](developer-api.md#the-project-and-its-files), which PAR-1089 built for Storybook alone, and the
`parity.processes.run(command)` that page mentions. It ends with Portless as an extension, so nothing in the app or the
API names Portless.

## In one line

An extension starts, adopts and watches a project's processes through `parity.processes`, and other extensions change
how those processes run and where they're reached through four providers: addresses, discovery, environment and
launchers. Portless is one extension built on two of them.

## Why not a Portless fix

Portless is built into the app in three places today:

- **The processes list** names a server by its Portless route (`listProcesses` in `utility/processes.ts`, which sets
  `ProjectProcess.domain`).
- **Finding a running server** reads Portless's routes and asks each port whether it's the one wanted
  (`findRoutedServer` in `utility/portless.ts`, used by `utility/tool-servers.ts`).
- **The extension API** has `parity.servers.routed()`, which returns Portless's routes.

Each is one case of something more general. A server can be reached at more places than `localhost:<port>`: a Portless
name, an HTTPS proxy, a tunnel, a container's mapped port. A server can be running already, found by Portless, by
`docker compose ps` or by a port being in use. A command can need to run inside something else: `doppler run`, a Nix
shell, a devcontainer. If Parity knows each of these by name, every new tool is an app change. With providers, each is
an extension, and Portless is the first.

## Use cases

The API below is tested against these. Each section after it says how they're done.

| Case        | Example                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Start       | Storybook's dev server; a docs site; a second app's Vite server; `tsc --watch`                 |
| Run a task  | Vitest once, with progress and a result; a lint; a build                                       |
| Adopt       | A Storybook the person started in a terminal, which Parity uses but never stops                |
| Observe     | The status bar's processes list; an extension that waits for the builder before it measures    |
| Reach       | `https://storybook.shop.localhost` through Portless; a Cloudflare tunnel; a Docker mapped port |
| Discover    | Portless's routes; `docker compose ps`; whatever listens on port 6006                          |
| Environment | Variables from `.env.local`; a variable a test runner needs                                    |
| Wrap        | `doppler run -- <command>`; `nix develop -c <command>`; `devcontainer exec <command>`          |
| Act on one  | "Share publicly" in a process's menu, from a tunnel extension                                  |

## Words

- **Process:** anything Parity lists for an open project. It's a **server**, which runs until it's stopped, or a
  **task**, which runs once and ends with a result. A watcher, such as `tsc --watch`, is a server without an endpoint.
- **Endpoint:** where a server answers on this machine, as `http://localhost:6006`. Parity and extensions reach a server
  at its endpoint.
- **Address:** another place a server can be opened, as `https://storybook.shop.localhost`. Address providers give them.
  The person's browser opens a server's preferred address.
- **Owner:** who started a process: Parity, an extension, or nobody Parity knows (adopted).
- **Candidate:** a server found running that nothing has adopted yet, from a discovery provider or a port check.

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
- **Changing how commands run is opt-in.** An environment provider or a launcher sees and changes every command Parity
  runs, so each is turned on per project, and asked for once for a third-party extension.
- **Nothing names a tool.** The app, the API and the processes list name kinds of thing (a name, a tunnel), never
  Portless or Docker.

## The API

### `parity.processes`

```ts
export interface Processes {
  /** Starts a process, or gives the one this extension started with the same id while it's still running. */
  start(spec: ProcessSpec): Promise<ProcessHandle>
  /** Lists a server found running under this extension, so Parity uses it but never stops it. */
  adopt(server: Candidate | AdoptSpec, as: { id: string; name: string }): ProcessHandle
  /** Servers running that nothing has adopted: from discovery providers, and from checking the ports asked for. */
  find(query?: FindQuery): Promise<Candidate[]>
  /** The project's processes, whoever started them, from the copy the host keeps. */
  list(filter?: { owner?: "mine" | "any"; lifetime?: "server" | "task" }): ProcessInfo[]
  /** A process this extension started or adopted, by its id, as after the host restarted. */
  get(id: string): ProcessHandle | undefined
  /** Called when any of the project's processes changes: its state, its endpoint or its addresses. */
  onDidChange(listener: (changed: ProcessInfo[]) => void): Disposable
}
```

`start` replaces `servers.serve`, `adopt` replaces `servers.adopt`, `find` replaces `servers.routed`, and
`handle.stop()` replaces `servers.stop`. `list` and `onDidChange` are new.

### What to run

```ts
export interface ProcessSpec {
  /** Names it among this extension's processes. Starting the same id again gives the running one. */
  id: string
  /** What the processes list calls it, as `Storybook`. */
  name: string
  lifetime: "server" | "task"
  /** What it runs. Each kind must be listed in the manifest's `permissions.processes`. */
  run: Run
  /** Its arguments. `{port}` becomes the port Parity chose. */
  args?: string[]
  /** Its folder, relative to the project's root. The root unless said. */
  cwd?: string
  /** Variables it gets, on top of the project service's key-free environment and the environment providers'. */
  env?: Record<string, string>
  /** For a server that listens: the port it asks for, and how it's told the one chosen. */
  port?: PortSpec
  /** For a server: how Parity knows it's ready. Without it, a server is ready once it's started. */
  ready?: ReadyCheck
  /** How long it may take to be ready, or for a task to finish, in milliseconds. Three minutes for a server. */
  timeoutMs?: number
  /** Whether a server that stops by itself is started again, up to three times a minute. */
  restart?: "never" | "onCrash"
  /** Whether the project's launchers and environment providers apply. True unless said. */
  wrapped?: boolean
  /** How the processes list shows it: an icon from the kit's set, and what it does in a few words. */
  icon?: IconName
  role?: string
}

export type Run =
  /** A package's command line, from the project's own install, run with Parity's Node: `storybook`, `vitest`. */
  | { bin: string; package?: string }
  /** One of the project's `package.json` scripts, through the project's package manager. */
  | { script: string }
  /** An executable on the PATH, as `docker` or `cloudflared`. No shell. */
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
  /** Answers this path with a status below 400. */
  | { http: string }
  /** Accepts a connection on its port. */
  | { tcp: true }
  /** Prints a line matching this pattern, as a tunnel prints its address. The match is kept as `readyMatch`. */
  | { output: string }
```

`Run` decides what `permissions.processes` must list, one entry per kind and name: `bin:storybook`, `script:test`,
`exec:cloudflared`, `node:dist/worker.js`. The manifest check (`readExtension`) refuses a malformed entry, and `start`
refuses a run the manifest doesn't list with the code `process_not_permitted`.

A `bin` runs the package's command line from the project's install with Parity's own Node, as `utility/tool-servers.ts`
does for Storybook today, so it works without the project's package manager and without a shell, and Windows's `.cmd`
shims never come into it.

### A running process

```ts
export interface ProcessHandle {
  readonly id: string
  /** The latest of what Parity knows of it. */
  readonly info: ProcessInfo
  /** Settles once a server is ready or a task has started; rejects with the end of its output when it can't start. */
  readonly ready: Promise<ProcessInfo>
  /** Settles once it has ended, with how. A server's settles when it's stopped or crashes. */
  readonly ended: Promise<ProcessEnd>
  /** Stops it and every process it started. An adopted one is let go, not stopped. */
  stop(): Promise<void>
  /** Starts it again with the same spec. */
  restart(): Promise<void>
  /** What it printed, the latest lines last, and each line as it's printed, a batch at a time. */
  readonly output: { tail(lines?: number): string[]; onLines(listener: (lines: string[]) => void): Disposable }
  /** For a task: what it's doing and how far it's got, as the processes list shows while it runs. */
  report(progress: { detail?: string; done?: number; total?: number }): void
  /** For a task: what it found, set before it ends, as `3 failing tests in 2 files`. */
  summarize(summary: string): void
  onDidChange(listener: (info: ProcessInfo) => void): Disposable
}

export interface ProcessEnd {
  how: "stopped" | "exited" | "crashed" | "timeout"
  /** For a task: passed with exit code 0, failed otherwise, or canceled when it was stopped. */
  outcome?: "passed" | "failed" | "canceled"
  exitCode?: number
  signal?: string
}
```

### What everyone can see

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
  /** Where it answers on this machine, once a server listens. */
  endpoint?: Endpoint
  /** The other places it's reached, from address providers, the preferred one first. */
  addresses: Address[]
  /** What the person's browser opens: the preferred address, else the endpoint. */
  opens?: string
  icon?: IconName
  role?: string
  startedAt: number
  stoppedAt?: number
  pid?: number
  detail?: string
  progress?: { done: number; total: number }
  summary?: string
  /** Why it failed, with the end of its output. Only its owner gets the output. */
  error?: string
  /** For a server whose ready check is `output`: the text that matched, as a tunnel's address. */
  readyMatch?: string
}

/** What one of Parity's own processes does, as its icon in the processes list says today. */
export type ParityRole =
  | "builder"
  | "install"
  | "typecheck"
  | "test"
  | "format"
  | "lint"
  | "verify"
  | "build"
  | "export"
  | "accessibility"

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

This replaces `ProjectProcess` in `shared/protocol.ts`: `domain` becomes `addresses`, `startedBy` becomes `owner`, and
`kind` becomes `icon` and `role` for extensions' processes. Parity's own keep their kinds as `owner.role`, which also
picks their icons.

### Finding servers

```ts
export interface FindQuery {
  /** Ports to check, as Storybook's usual 6006. Something listening there is a candidate. */
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

`find` doesn't decide which candidate is the right one. That needs the extension's own knowledge, as Storybook asks each
candidate's `/index.json` for its story files. The extension reaches each `endpoint`, keeps the one it wants and adopts
it.

## Providers

Providers are declared in the manifest's `providers` and registered in `activate`, as developer-api.md sets out. These
four are added to `Providers`:

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

`parity.providers.register(kind, provider)` returns a `ProviderHandle`, a `Disposable` with `changed()`. An extension
calls `changed()` when what it would answer has changed, as Portless's routes do, and Parity asks again.

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
  cwd: string
}
```

Parity asks when a server's endpoint is first known, and again for every server when the provider calls `changed()`. It
ranks the addresses for `opens`: a name, then a proxy, then a container's or network address. A public address is never
preferred on its own: the person opens or copies it from the process's menu. Project settings can pick a kind first.

### Discovery

```ts
export interface DiscoveryProvider {
  /** Servers running now that Parity didn't start, for the open project. */
  discover(project: { root: string }): Promise<DiscoveredServer[]>
}

export interface DiscoveredServer {
  /** Stable while the server runs, as `storybook.shop` for a route. */
  key: string
  endpoint: Endpoint
  name?: string
  pid?: number
  cwd?: string
  /** Addresses the provider knows it by, as a route's name. */
  addresses?: Omit<Address, "provider">[]
}
```

Parity asks only when an extension calls `find`. It keeps each provider's last answer until `changed()`, so a `find` is
quick when nothing has changed. Candidates are not listed in the processes list until something adopts them, so a
machine with many Portless routes or containers doesn't fill the list.

Parity's own port check is not a provider. `find({ ports })` asks whether anything listens on each port, as `choosePort`
does today, so finding a server on its usual port works without any extension.

### Environment

```ts
export interface EnvironmentProvider {
  /** Variables for a process about to start. Values aren't logged or sent. */
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
the order the project's settings list them, then the spec's own `env`. A provider's values are treated as secrets: they
never reach a log, telemetry, the output shown to other extensions, or the process's `info`.

### Launchers

```ts
export interface LauncherProvider {
  /** The command line to run instead, around the one given; or undefined to leave it as it is. */
  wrap(process: LaunchFacts, command: CommandLine): Promise<CommandLine | undefined>
}

export interface CommandLine {
  command: string
  args: string[]
  env: Record<string, string>
}
```

A launcher gets the resolved command line, after `{port}` is filled in and a `bin` is resolved to Parity's Node and the
package's script. It returns another, as `doppler run -- <command>` or `nix develop -c <command>`. Launchers apply in
the order the project's settings list them, each wrapping the last one's result, so the first is innermost. The process
manager still owns the process it spawns, whatever the launcher made of it: its tree is stopped on Stop and with the
project, and its exit is the outermost command's.

A launcher can't change a process's port or ready check. A launcher that needs to know the port reads it from
`command.args` or `command.env`.

## Where it shows

### The processes list

The status bar's processes list (`chrome/Processes.tsx`) draws `ProcessInfo`:

- **An extension's process** shows its `icon` and `role`, with the extension's logo beside its name.
- **Addresses.** The row shows `opens`. Its menu lists every address under its label, each with Open in your browser and
  Copy, and a public one marked with a globe and "Anyone with the link can open it".
- **Output.** Show output opens the owner's log tab in the bottom panel, filtered to the process. Parity's own processes
  keep showing their error and summary as they do today.
- **Extensions' commands.** A new menu placement, `process`, adds an extension's commands to a process's menu, with the
  target `{ type: "process", id }`. `when` and `enablement` can test the context keys `process.lifetime`,
  `process.state`, `process.hasEndpoint` and `process.owner`.

`CommandTarget` gains `{ type: "process"; id: string }`, and `MenuPlacement` gains `"process"`.

### Settings

The project page of Settings (PAR-1090) gets a Processes section:

- **Environment:** each environment provider installed, off until turned on, in the order they apply.
- **Launchers:** the same, for launchers.
- **Open servers at:** Name, Proxy, Local or Automatic, for which kind of address `opens` prefers.

These are kept in the project's `.par` with the extension settings PAR-1090 adds, so a team that runs everything through
Doppler turns it on once for everyone.

## Trust

For a third-party extension (PAR-1098), on top of developer-api.md's Trust:

| What                    | Declared as                                                  | Asked                                                                            |
| ----------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Starting a process      | `permissions.processes`: `bin:`, `script:`, `exec:`, `node:` | Once, listing each command it may run                                            |
| Others' output          | `permissions.observe: true`                                  | Once: "Read what other processes print"                                          |
| An address provider     | `providers.addresses`                                        | Not asked: it's told ports and names, and only adds links                        |
| A discovery provider    | `providers.discovery`                                        | Not asked                                                                        |
| An environment provider | `providers.environment`                                      | Once, and turned on per project: "Adds variables to every command Parity runs"   |
| A launcher              | `providers.launcher`                                         | Once, and turned on per project: "Runs every command Parity runs inside its own" |

`list` gives every extension every process's name, state, endpoint and addresses, which say what's running but nothing
it printed. Output and `error` text go only to the owner, and to an extension with `observe`. Parity's own and built-in
extensions run with what they declare.

## How each case is done

### Storybook: start, adopt and open

```ts
const wanted = storybook.port ?? 6006
const paths = storyPaths(storybook)

// A Storybook already running for this project: on its usual port, or at a name a discovery provider knows.
for (const candidate of await parity.processes.find({ ports: [wanted] })) {
  if (await servesStories(candidate.endpoint.url, paths)) {
    return parity.processes.adopt(candidate, { id: "storybook", name: "Storybook" })
  }
}

const server = await parity.processes.start({
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

const { opens, endpoint } = await server.ready
// The index is read at the endpoint; the page opens at the preferred address, a Portless name when there is one.
const page = storyPage(opens ?? endpoint!.url, await storyIndex(endpoint!.url), paths)
await parity.ui.open(page)
```

Manifest: `"permissions": { "processes": ["bin:storybook"] }`.

Compared with today's `extension.ts`, the Portless branch and `servers.routed` go: a routed Storybook is a candidate
like any other, found by Portless's discovery provider. Two worktrees serving the same stories still need telling apart,
so `servesFrom` stays in the extension as a second check when more than one candidate passes.

### Portless as an extension

```json
{
  "name": "@parity-app/extension-portless",
  "parity": {
    "displayName": "Portless",
    "prefix": "portless",
    "icon": { "viewBox": "0 0 24 24", "path": "…" },
    "activates": ["onStartup"],
    "providers": { "addresses": {}, "discovery": {} },
    "permissions": { "read": ["~/.portless/**"] },
    "contributes": {
      "settings": {
        "portless.stateFolder": {
          "type": "string",
          "scope": "app",
          "title": "Portless's folder",
          "default": ""
        }
      }
    }
  }
}
```

```ts
// defineExtension is PAR-1102's; parity.settings is PAR-1090's.
export default defineExtension({
  activate(parity) {
    const folder = parity.settings.get("portless.stateFolder") || defaultFolder()
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
})
```

What leaves the app: `utility/portless.ts`, the Portless lookup in `listProcesses`, `findRoutedServer` in
`tool-servers.ts`, `ProjectProcess.domain`, and `servers.routed()`. `readState` and the dead-route check move into the
extension, with their tests.

Two things this needs that the API doesn't have yet, both small: `permissions.read` taking a path outside the project
(`~/`), and `parity.files.watch` on such a path. Without Portless installed, `routes.json` doesn't exist, both providers
answer nothing, and the extension costs a host that's idle. A `detect` module (developer-api.md, The manifest) that
checks for the folder would keep it from starting at all, and is the better default once `detect` modules exist.

### A tunnel: an action on a process, and a public address

A Cloudflare tunnel extension adds Share publicly to a server's menu:

```json
"contributes": {
  "commands": [{ "id": "tunnel.share", "title": "Share publicly", "icon": "globe" }],
  "menus": { "process": [{ "command": "tunnel.share", "when": "process.hasEndpoint" }] }
},
"providers": { "addresses": {} },
"permissions": { "processes": ["exec:cloudflared"] }
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
    wrapped: false
  })

  shared.set(server.id, (await tunnel.ready).readyMatch!)
  addresses.changed()
  tunnel.ended.then(() => shared.delete(server.id) && addresses.changed())
})
```

The tunnel is a process of its own, listed beside the server, stopped from the list like any other. Its address shows on
the server it shares.

### Docker Compose: discovery from a task

```ts
parity.providers.register("discovery", {
  async discover({ root }) {
    const ps = await parity.processes.start({
      id: "compose-ps",
      name: "List containers",
      lifetime: "task",
      run: { exec: "docker" },
      args: ["compose", "ps", "--format", "json"],
      wrapped: false
    })

    if ((await ps.ended).outcome !== "passed") return []

    return publishedPorts(ps.output.tail()).map((port) => ({
      key: `${port.service}:${port.published}`,
      name: port.service,
      cwd: root,
      endpoint: { url: `http://localhost:${port.published}`, port: port.published, protocol: "http" }
    }))
  }
})
```

Manifest: `"providers": { "discovery": {} }, "permissions": { "processes": ["exec:docker"] }`. Each run of this task
shows in the processes list while it runs, which Open questions takes up.

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

Manifest: `"providers": { "environment": {} }, "permissions": { "read": [".env", ".env.*"] }`. It applies once the
person turns it on in the project's settings.

### Doppler: a launcher

```ts
parity.providers.register("launcher", {
  async wrap(process, command) {
    return { command: "doppler", args: ["run", "--", command.command, ...command.args], env: command.env }
  }
})
```

Manifest: `"providers": { "launcher": {} }`. The process manager spawns what `wrap` returns, so the launcher needs no
`permissions.processes` for `doppler`: the prompt for a launcher already says it runs every command inside its own.

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

const end = await run.ended
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

An extension finds Parity's own processes by `owner.role`, never by their names or words, which can change.

## Lifecycle

- **A process belongs to its owner and the project.** It stops when the project closes, when its extension is turned off
  or uninstalled, and when the service exits. Main ends its tree if the service crashes, as it does for Storybook today
  (PAR-1019).
- **A host crash doesn't stop it.** developer-api.md has an extension's processes stop with its host. A crashing
  Storybook extension shouldn't take a Storybook that's been running for an hour with it. When the host starts again,
  `parity.processes.get(id)` gives back each process it owns.
- **Starting an id that's running gives the running one,** as `servers.serve` does today, so two commands at once share
  one server.
- **An adopted server is let go, never stopped,** by Stop, the project's closing or the extension's stopping.
- **A server that crashes** is listed as failed with the end of its output, or started again when its spec says
  `restart: "onCrash"`, up to three times a minute.

## Telemetry

Every event follows [telemetry.md](../telemetry.md): a zod schema in `@parity-app/telemetry`, `.describe()` on every
attribute, listed in the generated catalog. These replace `server.started` and `server.failed`.

Nothing here sends a command's arguments, a variable's value, a launcher's command line, or a public address: arguments
and variables can hold keys, and a tunnel's address opens the person's server to anyone. Output is sent only where it
says, after the scrubber in `@parity-app/telemetry` has removed secrets. A process's `name` and an extension's id go as
written, as telemetry.md's "send it as it is, except secrets" says.

Common attributes, where an event says it has them:

| Attribute    | Type                                                | Meaning                                                                         |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `lifetime`   | `"server" \| "task"`                                | Whether it runs until it's stopped or once                                      |
| `name`       | `string`                                            | Its name, as the processes list shows it                                        |
| `owner`      | `string`                                            | `parity`, or the extension's id that started or adopted it                      |
| `run`        | `"bin" \| "script" \| "exec" \| "node" \| "parity"` | What kind of command it runs; `parity` for Parity's own                         |
| `command`    | `string`                                            | The package, script, executable or module it runs, as `storybook`; no arguments |
| `durationMs` | `number`                                            | How long it took, in milliseconds                                               |

### Sent by the service

| Event                      | Level | When                                                                                   | Attributes beyond the common ones                                                                                                                                                                                                 |
| -------------------------- | ----- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process.started`          | info  | A process Parity started is ready: a server passes its ready check, a task has spawned | common; `ready`: `"http" \| "tcp" \| "output" \| "none"`; `portMoved`: whether the port it asked for was taken; `launchers`: how many wrapped it; `environments`: how many added variables; `attempt`: 1, or more after a restart |
| `process.failed`           | warn  | A process Parity started can't start                                                   | common; `reason`: `"exited" \| "timeout" \| "spawn" \| "launcher" \| "environment"`; `exitCode`; `signal`; `output`: its last 50 lines, scrubbed                                                                                  |
| `process.crashed`          | warn  | A running server stops by itself                                                       | common without `durationMs`; `uptimeMs`; `exitCode`; `signal`; `restarting`: whether `onCrash` starts it again; `output`: its last 50 lines, scrubbed                                                                             |
| `process.stopped`          | info  | A process is stopped on purpose                                                        | common without `durationMs`; `uptimeMs`; `by`: `"person" \| "extension" \| "project" \| "service" \| "uninstall"`                                                                                                                 |
| `process.restarted`        | info  | A process is started again                                                             | common; `by`: `"person" \| "extension" \| "crash"`; `outcome`: `"ok" \| "error"`                                                                                                                                                  |
| `task.finished`            | info  | A task ends. `warn` when it failed                                                     | common; `outcome`: `"passed" \| "failed" \| "canceled" \| "timeout"`; `exitCode`; `reported`: whether its owner set progress or a summary                                                                                         |
| `process.adopted`          | info  | An extension adopts a running server                                                   | `name`; `owner`; `foundBy`: `"port" \| "provider" \| "endpoint"`; `provider`: the discovery provider's extension, when one found it                                                                                               |
| `process.refused`          | warn  | `start` is refused because the manifest doesn't permit the run                         | `owner`; `run`; `command`                                                                                                                                                                                                         |
| `processes.found`          | info  | An extension's `find` returns. Kept: 1 in 10                                           | `owner`; `ports`: how many it asked about; `candidates`; `providers`: how many were asked; `cached`: how many answered from their last answer; `durationMs`                                                                       |
| `processes.providerFailed` | warn  | A provider call throws, times out after 5 seconds, or returns data its schema refuses  | `provider`: the extension's id; `kind`: `"addresses" \| "discovery" \| "environment" \| "launcher"`; `reason`: `"error" \| "timeout" \| "invalid"`; `durationMs`; `message`; `code`                                               |
| `processes.providerSlow`   | info  | A provider call takes over 1 second but answers                                        | `provider`; `kind`; `durationMs`                                                                                                                                                                                                  |

A provider's failure in one of Parity's own extensions is also a Sentry issue, since it's Parity's bug. A third-party
extension's is only the event, with its id, and a line in its log tab.

### Sent by the window

| Event                      | Level | When                                                                                                          | Attributes                                                                                                                                   |
| -------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `processes.opened`         | info  | The person opens the processes list                                                                           | `servers`, `tasks`, `failed`: how many of each it shows; `fromExtensions`: how many extensions own them                                      |
| `process.addressOpened`    | info  | The person opens a server in their browser                                                                    | `owner`; `kind`: `"local" \| "name" \| "proxy" \| "tunnel" \| "container" \| "network"`; `provider`; `from`: `"list" \| "menu" \| "command"` |
| `process.addressCopied`    | info  | The person copies one of a server's addresses                                                                 | `owner`; `kind`; `provider`; `public`                                                                                                        |
| `process.outputShown`      | info  | The person opens a process's output                                                                           | `owner`; `state`: its state then                                                                                                             |
| `process.commandRun`       | info  | The person runs an extension's command from a process's menu                                                  | `extension`; `command`: the command's id; `lifetime` and `owner` of the process it ran on                                                    |
| `processes.settingChanged` | info  | The person turns an environment provider or launcher on or off, or reorders them, or picks where servers open | `setting`: `"environment" \| "launcher" \| "opens"`; `provider`, when it names one; `on`; `position`                                         |

### Spans

`process.start` covers a `start` call from the request to `ready`, as a child of whatever span the call came from (an
extension's command, through its host). Its children are `process.environment` and `process.wrap`, one per provider,
`process.port` while a port is chosen, and `process.ready` while the ready check is asked. `processes.find` covers a
`find` call, with a `processes.discover` child per provider. Provider spans carry `provider` and `kind`.

## Code

- **`@parity-app/process-model`,** a new package with no Node or Electron (packages.md): checking a `ProcessSpec`,
  matching a `Run` against `permissions.processes`, filling `{port}`, merging environments in order, chaining launchers,
  ranking addresses into `opens`, and keeping providers' last answers. Its tests cover each.
- **The project service** keeps spawning, ports, ready checks and output (`process-manager.ts`, `processes.ts`), now
  taking a resolved command line from the model, and answers the host's process methods.
- **`@parity-app/extension-api`** gains `Processes`, `ProcessHandle`, `ProcessInfo` and the four providers, and loses
  `Servers`.
- **`@parity-app/extensions`** routes `parity.processes` and provider calls between host and service, and drops
  `servers.*`.
- **The window** draws `ProcessInfo` in `Processes.tsx`, adds the `process` placement, and the Settings section.

## Order of work

1. **The model and the manager.** `@parity-app/process-model`; the process manager takes a `ProcessSpec` and a ready
   check; `ProjectProcess` becomes `ProcessInfo` with `owner` and `addresses`; Parity's own builder and tasks listed
   through it. The new telemetry events replace `server.*`.
2. **`parity.processes`** in the API and the host, with `start`, `adopt`, `find` (ports only), `list`, `get` and output.
   Storybook moves onto it, and `parity.servers` goes.
3. **Address and discovery providers,** the processes list's addresses, and Portless as an extension, with
   `permissions.read` and `files.watch` outside the project. `utility/portless.ts` and `domain` go.
4. **The `process` menu placement** and its context keys, tried with a tunnel extension kept in `examples/`.
5. **Environment providers and launchers,** with the project's Processes settings (after PAR-1090) and the permission
   prompts (with PAR-1098).

Steps 1 to 3 finish PAR-1103. Steps 4 and 5 are their own issues.

## Open questions

- **Short tasks a provider runs,** as `docker compose ps` for discovery: listing each run would flicker in the processes
  list. A `quiet: true` spec field that lists a task only after it's run for a second, and drops it once it passes, is
  the likely answer.
- **Output from others.** `observe` is all or nothing. A tool that only needs the builder's output could ask for it by
  role instead.
- **Ports a launcher changes.** A launcher that moves a server to another port, as some proxies' own commands do, would
  break the endpoint. This proposal forbids it; a launcher that needs it would say the port in its result.
- **Remote machines.** An endpoint is on this machine. A devcontainer or SSH launcher may put the server somewhere
  Parity reaches only through a forwarded port, which is a `container` address today but may need to be the endpoint.

## Decided

- **One manager, providers around it.** Tools that change where servers are reached, what runs, or what's running are
  providers, never app code.
- **Extensions find, Parity reaches.** `find` returns candidates; deciding which is right stays with the extension.
- **A host crash leaves its processes running,** which changes developer-api.md.
- **Environment providers and launchers are off until a project turns them on.**
- **Telemetry never carries arguments, variables or public addresses.**
