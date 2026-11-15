import { constants } from "node:fs"
import { access, readFile, stat } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import type { Candidate, ProcessInfo, ProcessSpec, Run } from "@parity-app/extension-api"
import type { ExtensionProcesses, ProcessCaller, ProcessListener } from "@parity-app/extensions"
import {
  batchCommandLine,
  checkSpec,
  commandPaths,
  fillPort,
  permissionFor,
  permits,
  ProcessError,
  runCommand,
  runEnvironment,
  runKind,
  specFingerprint,
  startsAs,
  visibleTo,
  withUsualFolders,
  withUsualPath
} from "@parity-app/processes"
import { detectPackageManager } from "@parity-app/project"
import { z } from "zod"
import { logNote } from "../shared/log.ts"
import type { ProjectProcess } from "../shared/protocol.ts"
import { track } from "../shared/tracing.ts"
import { local, readPortless } from "./portless.ts"
import {
  accepts,
  adoptProcess,
  choosePort,
  knownProcess,
  type Launch,
  type ManagedProcess,
  type ManagedSpec,
  startProcess,
  stopManaged,
  stopManagedPrefixed
} from "./process-manager.ts"
import { onProcessesChanged, trackedProcesses } from "./processes.ts"

/*
 * `parity.processes` in the project service (docs/proposals/processes.md): what an extension's host asks of the process
 * manager, checked against its manifest. An extension names its processes with ids of its own; in the manager each is
 * `extension:<extension>:<project>:<id>`, and in the list extensions see, `<extension>:<id>`. What one extension may see
 * of another's, or of Parity's own, is decided here, as is how each kind of run is found.
 */

/** A project hosts were told of: its folder, and the name the processes list gives it. */
export interface ProcessProject {
  root: string
  name: string
}

/** The fields of a package's package.json that say where its command lines are. */
const binManifest = z.looseObject({
  name: z.string().optional(),
  bin: z.union([z.string(), z.record(z.string(), z.string())]).optional()
})

/** `parity.processes` for every extension, for the open projects `projectOf` knows. */
export function extensionProcesses(projectOf: (projectId: string) => ProcessProject | undefined): ExtensionProcesses {
  /** Each running host's listener, by project and extension. */
  const listeners = new Map<string, ProcessListener>()
  /** The handles whose lines and ends are forwarded to their extension's current host. */
  const forwarded = new WeakSet<ManagedProcess>()
  /** Each process an extension started or adopted, by its id in the manager, kept once it's let go for its end. */
  const handles = new Map<string, ManagedProcess>()
  /** The pattern of each one whose ready check is `output`, so a host that starts again matches it too. */
  const readyPatterns = new Map<string, string>()

  /** Sends what a process prints, and how its runs end, to whichever host its extension runs in now. */
  const forward = (caller: ProcessCaller, id: string, handle: ManagedProcess) => {
    if (forwarded.has(handle)) {
      return
    }

    forwarded.add(handle)
    handles.set(managedId(caller, id), handle)
    handle.onLines((lines) => listeners.get(keyOf(caller))?.lines(id, lines, handle.info().run))
    handle.onEnd((end) => listeners.get(keyOf(caller))?.ended(id, end))
  }

  const own = (caller: ProcessCaller, id: string) => {
    const handle = knownProcess(managedId(caller, id)) ?? handles.get(managedId(caller, id))

    if (!handle) {
      throw new Error(`No process ${id}`)
    }

    return handle
  }

  const list = (caller: ProcessCaller) => {
    const processes = trackedProcesses(caller.projectId)

    return processes.map((process) => seenBy(caller, process, processes))
  }

  const refuse = (caller: ProcessCaller, run: Run, error: ProcessError): never => {
    track("processes.refused", {
      owner: caller.extension,
      runKind: runKind(run),
      command: runCommand(run),
      code: error.code
    })

    throw error
  }

  return {
    async start(caller, spec) {
      const project = projectOf(caller.projectId)

      if (!project) {
        throw new Error(`No project ${caller.projectId} is open`)
      }

      try {
        checkSpec(spec)

        if (!permits(spec.run, caller.permissions.processes)) {
          throw new ProcessError(
            "process_not_permitted",
            `${spec.name}: its manifest's permissions.processes doesn't list ${permissionFor(spec.run)}`
          )
        }
      } catch (error) {
        if (error instanceof ProcessError) {
          refuse(caller, spec.run, error)
        }

        throw error
      }

      // `checkSpec` refused a folder outside the project's.
      const managed = managedSpec(caller, project, spec, resolve(project.root, spec.cwd ?? "."))
      const handle = await startProcess(managed)
      forward(caller, spec.id, handle)

      if (spec.ready && "output" in spec.ready) {
        readyPatterns.set(managed.id, spec.ready.output)
      }

      return seenBy(caller, handle.info())
    },
    adopt(caller, server) {
      const project = projectOf(caller.projectId)

      if (!project) {
        throw new Error(`No project ${caller.projectId} is open`)
      }

      const adopted: Parameters<typeof adoptProcess>[0] = {
        id: managedId(caller, server.id),
        name: server.name,
        owner: { kind: "adopted", by: caller.extension },
        projectId: caller.projectId,
        project: project.name,
        endpoint: server.endpoint,
        foundBy: server.foundBy
      }

      if (server.pid !== undefined) {
        adopted.pid = server.pid
      }

      const handle = adoptProcess(adopted)
      forward(caller, server.id, handle)

      return seenBy(caller, handle.info())
    },
    async find(caller, query) {
      const began = performance.now()
      const ports = [...new Set(query.ports ?? [])]
      // A server already listed, started or adopted by anyone, isn't a candidate.
      const listed = new Set(trackedProcesses(caller.projectId).flatMap((process) => process.endpoint?.port ?? []))
      const unlisted = ports.filter((port) => !listed.has(port))
      const answering = await Promise.all(unlisted.map(async (port) => ((await accepts(port)) ? [port] : [])))

      // Discovery providers come with step 3 of docs/proposals/processes.md; until then only ports are checked.
      const candidates: Candidate[] = answering.flat().map((port) => ({
        key: `port:${port}`,
        endpoint: { url: local(port), port, protocol: "http" },
        addresses: [],
        foundBy: { kind: "port" }
      }))

      track("processes.found", {
        owner: caller.extension,
        ports: ports.length,
        candidates: candidates.length,
        providers: 0,
        cached: 0,
        durationMs: Math.round(performance.now() - began)
      })

      return candidates
    },
    stop: (caller, id) => stopManaged(managedId(caller, id), "extension"),
    async restart(caller, id) {
      return seenBy(caller, await own(caller, id).restart("extension"))
    },
    async ready(caller, id) {
      return seenBy(caller, await own(caller, id).ready())
    },
    ended: (caller, id) => own(caller, id).ended(),
    report(caller, id, progress) {
      knownProcess(managedId(caller, id))?.report(progress)
    },
    summarize(caller, id, summary) {
      knownProcess(managedId(caller, id))?.summarize(summary)
    },
    markReady(caller, id, match) {
      knownProcess(managedId(caller, id))?.markReady(match)
    },
    snapshot(caller) {
      const prefix = managedId(caller, "")
      const output: Record<string, string[]> = {}
      const ready: Record<string, string> = {}

      for (const process of trackedProcesses(caller.projectId)) {
        const handle = process.id.startsWith(prefix) ? knownProcess(process.id) : undefined
        const pattern = readyPatterns.get(process.id)

        if (handle) {
          output[process.id.slice(prefix.length)] = handle.tail()
        }

        if (handle && pattern !== undefined) {
          ready[process.id.slice(prefix.length)] = pattern
        }
      }

      return { list: list(caller), output, ready }
    },
    watch(caller, listener) {
      const key = keyOf(caller)
      listeners.set(key, listener)

      const unsubscribe = onProcessesChanged((projectId) => {
        if (projectId === caller.projectId) {
          listener.changed(list(caller))
        }
      })

      return () => {
        unsubscribe()

        if (listeners.get(key) === listener) {
          listeners.delete(key)
        }
      }
    },
    reattached(caller, hostStopped) {
      const prefix = managedId(caller, "")

      const processes = trackedProcesses(caller.projectId).filter(
        (process) => process.id.startsWith(prefix) && knownProcess(process.id) !== undefined
      ).length

      track("processes.reattached", { owner: caller.extension, processes, hostStopped })
    },
    stopAll(projectId, extension) {
      void stopManagedPrefixed(`extension:${extension}:${projectId}:`, "project")
    },
    async routed() {
      const portless = await readPortless()

      return portless.routes.map((route) => ({ url: local(route.port), address: portless.address(route.hostname) }))
    }
  }
}

/** Which host listens for an extension's processes in a project. */
function keyOf(caller: ProcessCaller): string {
  return `${caller.projectId}\n${caller.extension}`
}

/** A process's id in the manager: one per extension, process and project. */
function managedId(caller: Pick<ProcessCaller, "extension" | "projectId">, id: string): string {
  return `extension:${caller.extension}:${caller.projectId}:${id}`
}

/** What the process manager starts for a spec: its run found as each run's kind is, each time it starts. */
function managedSpec(caller: ProcessCaller, project: ProcessProject, spec: ProcessSpec, cwd: string): ManagedSpec {
  const managed: ManagedSpec = {
    id: managedId(caller, spec.id),
    name: spec.name,
    lifetime: spec.lifetime,
    owner: { kind: "extension", extension: caller.extension },
    projectId: caller.projectId,
    project: project.name,
    runKind: runKind(spec.run),
    command: runCommand(spec.run),
    fingerprint: specFingerprint(spec),
    async launch() {
      const port = spec.port ? await choosePort(spec.port.prefer) : undefined
      const added = { ...spec.env }

      if (spec.port?.env && port !== undefined) {
        added[spec.port.env] = String(port)
      }

      const env = withUsualPath(runEnvironment(spec.run, process.env, added), process.platform)
      const command = await commandFor(caller, project.root, spec.run, fillPort(spec.args ?? [], port), env)
      const launch: Launch = { ...command, cwd, env }

      if (port !== undefined) {
        launch.port = port
        launch.portMoved = port !== spec.port?.prefer
      }

      logNote(`[service] starting ${spec.name} for ${project.name}${port === undefined ? "" : ` at ${local(port)}`}`)

      return launch
    }
  }

  if (spec.ready) {
    managed.ready = spec.ready
  }

  if (spec.timeoutMs !== undefined) {
    managed.timeoutMs = spec.timeoutMs
  }

  if (spec.restart) {
    managed.restart = spec.restart
  }

  if (spec.quiet !== undefined) {
    managed.quiet = spec.quiet
  }

  if (spec.icon) {
    managed.icon = spec.icon
  }

  if (spec.role) {
    managed.role = spec.role
  }

  return managed
}

/** The program a run starts and its arguments, or through `cmd.exe` the whole command line for a batch file. */
type Command = Pick<Launch, "command" | "args" | "shell">

/** Finds what a run starts, refusing with `process_not_found` or `process_unsupported` when it can't. */
async function commandFor(
  caller: ProcessCaller,
  root: string,
  run: Run,
  args: string[],
  env: Record<string, string>
): Promise<Command> {
  if ("bin" in run) {
    return { command: process.execPath, args: [await binScript(root, run.bin, run.package ?? run.bin), ...args] }
  }

  if ("node" in run) {
    return { command: process.execPath, args: [await nodeModule(caller.main, run.node), ...args] }
  }

  if ("script" in run) {
    const { agent } = await detectPackageManager(root)

    return onPath(agent, ["run", run.script, ...args], env)
  }

  return onPath(run.exec, args, env)
}

/** A package's command line, from the copy installed in the project: the script its package.json's `bin` names. */
async function binScript(root: string, bin: string, name: string): Promise<string> {
  const notFound = () => new ProcessError("process_not_found", `${name} isn't installed in the project`)
  const require = createRequire(join(root, "package.json"))
  // Its folder, looked for as Node looks for it, without its exports, which may not list package.json.
  const folders = (require.resolve.paths(name) ?? []).map((folder) => join(folder, name))
  let folder: string | undefined

  for (const candidate of folders) {
    if (await isFile(join(candidate, "package.json"))) {
      folder = candidate
      break
    }
  }

  if (!folder) {
    throw notFound()
  }

  const manifest = binManifest.safeParse(JSON.parse(await readFile(join(folder, "package.json"), "utf8")))
  const declared = manifest.success ? manifest.data.bin : undefined
  let script: string | undefined

  // A package with several command lines names each; one with a single one may name it after the package.
  if (declared instanceof Object) {
    const entries = Object.values(declared)
    script = declared[bin] ?? (entries.length === 1 ? entries[0] : undefined)
  } else {
    script = declared
  }

  if (!script || !(await isFile(join(folder, script)))) {
    throw new ProcessError("process_not_found", `${name} has no command line named ${bin}`)
  }

  return join(folder, script)
}

/** A `node` run's module, which must be inside the extension's own folder. */
async function nodeModule(main: string, path: string): Promise<string> {
  const folder = dirname(main)
  const module = resolve(folder, path)
  const inside = relative(folder, module)

  if (inside.startsWith("..") || isAbsolute(inside)) {
    throw new ProcessError("process_spec_invalid", `${path} isn't inside the extension's folder`)
  }

  if (!(await isFile(module))) {
    throw new ProcessError("process_not_found", `${path} isn't in the extension's folder`)
  }

  return module
}

/**
 * A command found on the PATH, and the usual folders after it. On Windows, an `.exe` or `.com` starts directly and a
 * `.cmd` or `.bat` through `cmd.exe`; any other type found, as `.ps1`, isn't run.
 */
async function onPath(name: string, args: string[], env: Record<string, string>): Promise<Command> {
  const platform = process.platform
  let unsupported: string | undefined

  for (const path of commandPaths(name, withUsualFolders(env, platform), platform)) {
    if (!(await runnable(path, platform))) {
      continue
    }

    const how = startsAs(path, platform)

    if (how === "direct") {
      return { command: path, args }
    }

    if (how === "batch") {
      return { command: batchCommandLine(path, args), args: [], shell: true }
    }

    unsupported ??= path
  }

  if (unsupported) {
    throw new ProcessError("process_unsupported", `${unsupported} is a type of program Parity doesn't run`)
  }

  throw new ProcessError("process_not_found", `${name} isn't on the PATH`)
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (found) => found.isFile(),
    () => false
  )
}

/** Whether a file is there and, on macOS and Linux, may be run. */
async function runnable(path: string, platform: string): Promise<boolean> {
  if (!(await isFile(path))) {
    return false
  }

  if (platform === "win32") {
    return true
  }

  return access(path, constants.X_OK).then(
    () => true,
    () => false
  )
}

/**
 * What an extension sees of a process: its id among the project's processes, without what only the window needs, and
 * only what `visibleTo` lets it see of one it doesn't own.
 */
function seenBy(caller: ProcessCaller, process: ProjectProcess, all: ProjectProcess[] = [process]): ProcessInfo {
  const { projectId: _project, project: _name, canStop: _stop, canRestart: _restart, ...info } = process

  return visibleTo(
    { ...info, id: listedId(process, all) },
    { owns: ownerOf(process) === caller.extension, observe: caller.permissions.observe }
  )
}

/** The extension that started or adopted a process, or none for Parity's own. */
function ownerOf({ owner }: ProjectProcess): string | undefined {
  if (owner.kind === "parity") {
    return undefined
  }

  return owner.kind === "extension" ? owner.extension : owner.by
}

/**
 * A process's id in the list extensions see: `<extension>:<id>` for an extension's, `parity:<role>` for Parity's own,
 * with a number after the role when the project has more than one with it.
 */
function listedId(process: ProjectProcess, all: ProjectProcess[]): string {
  const { owner } = process

  if (owner.kind === "parity") {
    const same = all.filter((each) => each.owner.kind === "parity" && each.owner.role === owner.role)

    const index = same
      .map((each) => each.id)
      .sort()
      .indexOf(process.id)

    return index > 0 ? `parity:${owner.role}-${index + 1}` : `parity:${owner.role}`
  }

  const extension = ownerOf(process) ?? ""
  const prefix = managedId({ extension, projectId: process.projectId }, "")

  return `${extension}:${process.id.startsWith(prefix) ? process.id.slice(prefix.length) : process.id}`
}
