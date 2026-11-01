// Starts an isolated copy of Parity for the end-to-end tests, the way scripts/perf.ts starts one: its own UI and
// DevTools ports, profile, agent file and detection cache, with the code frozen at start, on a copy of the example
// project made for the run. A copy of Parity a person already has open, and the example itself, are left alone.
import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import { createWriteStream } from "node:fs"
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"

const appDir = resolve(import.meta.dirname, "..")
const repoDir = resolve(appDir, "../..")
const example = join(repoDir, "examples/shadcn-vite")
/** The suite's own ports, beside the app's usual 5310 and 9333. */
const suitePorts = { ui: 5385, debug: 9385 }

/** What a test needs to reach the copy. */
export interface Launched {
  uiPort: number
  debugPort: number
  project: string
  /** The app's own output, which a test that can't reach the app quotes. */
  log: string
}

export interface RunningApp extends Launched {
  /** The folder holding the project copy, the profile and the log, removed by `stop`. */
  dir: string
  log: string
  stop(): Promise<void>
}

/**
 * Starts the copy and waits until its window has loaded; `App.connect` waits for the designs to draw. It runs on 5385
 * and 9385, or on ports the system gives out when those are taken, so the suite runs beside a person's own copy, other
 * sessions' and another run.
 */
export async function launch(): Promise<RunningApp> {
  await enlargeRunnerDisplay()
  const dir = await mkdtemp(join(tmpdir(), "parity-e2e-"))
  const project = await copyExample(dir)
  const profile = join(dir, "profile")
  await mkdir(profile)
  const uiPort = await freePort(suitePorts.ui)
  const debugPort = await freePort(suitePorts.debug)
  const log = join(dir, "app.log")
  const output = createWriteStream(log)
  const runner = spawn(process.execPath, [join(appDir, "scripts/dev.ts"), project], {
    cwd: appDir,
    env: {
      ...appEnvironment(),
      PARITY_UI_PORT: String(uiPort),
      PARITY_UI_FROZEN: "1",
      PARITY_DEBUG_PORT: String(debugPort),
      PARITY_USER_DATA: profile,
      // Agents find the app through this file, so the copy keeps its own and agents keep working with the person's.
      PARITY_AGENT_FILE: join(profile, "agent.json"),
      PARITY_CACHE_DIR: join(dir, "cache"),
      // The same size every run, and a window that keeps drawing while other windows cover it.
      PARITY_WINDOW_SIZE: `${pageSize.width}x${pageSize.height}`
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  runner.stdout?.pipe(output)
  runner.stderr?.pipe(output)
  const stop = async () => {
    await stopProcess(runner)
    output.end()
    await removeCopy(dir, project)
    // A copy on another port bundles into a folder and caches dependencies of its own, kept only for the suite's port.
    if (uiPort !== suitePorts.ui) {
      for (const folder of [join(appDir, "out", String(uiPort)), join(appDir, `node_modules/.vite-${uiPort}`)]) {
        await rm(folder, { recursive: true, force: true, maxRetries: 5 })
      }
    }
  }
  try {
    await waitForWindow(uiPort, debugPort, runner)
  } catch (error) {
    const tail = (await readFile(log, "utf8").catch(() => "")).split("\n").slice(-30).join("\n")
    await stop()
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nThe app's last output:\n${tail}`)
  }
  return { uiPort, debugPort, project, dir, log, stop }
}

/** The page size every test is written for, which `App.connect` checks the window got. */
export const pageSize = { width: 1440, height: 900 }

/**
 * Sets a Windows CI runner's display to 1920 by 1080. GitHub's Windows runners start at 1024 by 768, where a 1440 by
 * 900 window is shrunk to fit: the canvas narrows, the inspector covers points the tests click, and seven tests fail.
 * Only on CI, so a person's own screen is never changed.
 */
async function enlargeRunnerDisplay(): Promise<void> {
  if (process.platform !== "win32" || !process.env.CI) return
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(setDisplay, "utf16le").toString("base64")],
    { encoding: "utf8", windowsHide: true }
  )
  console.log(`Runner display: ${(result.stdout || result.stderr).trim()}`)
}

/** ChangeDisplaySettings through PowerShell, printing the size before and after and the call's result (0 is success). */
const setDisplay = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Display {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
    public int dmFields, dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels;
    public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
    public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
  }
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] static extern bool EnumDisplaySettings(string device, int mode, ref DEVMODE devMode);
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] static extern int ChangeDisplaySettings(ref DEVMODE devMode, int flags);
  public static string Set(int width, int height) {
    var mode = new DEVMODE();
    mode.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
    EnumDisplaySettings(null, -1, ref mode);
    string before = mode.dmPelsWidth + "x" + mode.dmPelsHeight;
    mode.dmPelsWidth = width;
    mode.dmPelsHeight = height;
    mode.dmFields = 0x80000 | 0x100000;
    int result = ChangeDisplaySettings(ref mode, 0);
    return before + " -> " + width + "x" + height + ", result " + result;
  }
}
'@
[Display]::Set(1920, 1080)
`

/**
 * This process's environment, less what Vitest sets for its own tests (`VITEST`, `TEST`, `NODE_ENV=test`), so the app
 * and its servers run as they do under `pnpm dev`.
 */
function appEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const name of Object.keys(env)) {
    if (name.startsWith("VITEST") || name === "TEST") delete env[name]
  }
  if (env.NODE_ENV === "test") delete env.NODE_ENV
  return env
}

/**
 * The suite's own port when nothing is listening on it, or else one the system gives out, which nothing else expects to
 * have: other copies of Parity, such as other sessions', are started on ports near the suite's.
 */
async function freePort(preferred: number): Promise<number> {
  if (await free(preferred)) return preferred
  for (let tries = 0; tries < 20; tries++) {
    const port = await systemPort()
    if (await free(port)) return port
  }
  throw new Error("No free port")
}

/** Whether nothing listens on a port: Vite listens on localhost, which can be either address, and DevTools on 127.0.0.1. */
async function free(port: number): Promise<boolean> {
  return (await canListen(port, "127.0.0.1")) && (await canListen(port, "::1"))
}

function canListen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once("error", (error: NodeJS.ErrnoException) =>
      // A machine without IPv6 has nothing listening there either.
      resolve(error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")
    )
    server.listen(port, host, () => server.close(() => resolve(true)))
  })
}

function systemPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() =>
        address && typeof address === "object" ? resolve(address.port) : reject(new Error("No port"))
      )
    })
  })
}

/**
 * Copies the example into the run's folder, adding what the tests need: components that ignore their props, and a
 * Members design that draws them. Installed packages are linked one by one rather than copied, so the copy's own
 * builder caches go in its own folder.
 */
async function copyExample(dir: string): Promise<string> {
  const root = join(dir, basename(example))
  const modules = join(example, "node_modules")
  await cp(example, root, { recursive: true, filter: (path) => path !== modules })
  await mkdir(join(root, "node_modules"))
  // Each package links to its real folder. pnpm's own links are relative, and on Windows a relative link reached
  // through a junction resolves from the junction's path rather than its target's: a linked `@tailwindcss` folder made
  // `@tailwindcss/vite` point into the temporary folder, where nothing is, and the project couldn't load its config.
  // A junction on Windows needs no special rights; elsewhere the type is ignored and it's a plain symlink.
  const link = async (from: string, to: string) => symlink(await realpath(from), to, "junction")
  for (const name of await readdir(modules)) {
    // Caches such as .vite-parity belong to whoever runs the example itself.
    if (name.startsWith(".") && name !== ".bin") continue
    if (!name.startsWith("@")) {
      await link(join(modules, name), join(root, "node_modules", name))
      continue
    }
    await mkdir(join(root, "node_modules", name))
    for (const scoped of await readdir(join(modules, name))) {
      await link(join(modules, name, scoped), join(root, "node_modules", name, scoped))
    }
  }
  await writeFile(join(root, "src/components/member-row.tsx"), memberRow)
  const file = join(root, "shadcn-vite.par")
  const document = JSON.parse(await readFile(file, "utf8")) as { containers: unknown[] }
  document.containers.push(membersDesign)
  await writeFile(file, `${JSON.stringify(document, null, 2)}\n`)
  return root
}

/** Takes the links out before the folder, so removing it can't reach the packages they point to. */
async function removeCopy(dir: string, project: string): Promise<void> {
  const modules = join(project, "node_modules")
  for (const name of await readdir(modules).catch(() => [])) {
    if (name.startsWith(".") && name !== ".bin") continue
    if (!name.startsWith("@")) {
      await unlink(join(modules, name)).catch(() => undefined)
      continue
    }
    // A scope is a folder of its own, holding a link for each of its packages.
    for (const scoped of await readdir(join(modules, name)).catch(() => [])) {
      await unlink(join(modules, name, scoped)).catch(() => undefined)
    }
  }
  await rm(dir, { recursive: true, force: true, maxRetries: 5 })
}

/**
 * Waits until the window has loaded its page, as the DevTools protocol lists it. Playwright isn't used here: Vitest's
 * global setup runs under a module runner whose stack trace hook fails on Playwright's errors.
 */
async function waitForWindow(uiPort: number, debugPort: number, runner: ChildProcess): Promise<void> {
  const deadline = Date.now() + 180_000
  let exited = false
  runner.once("exit", () => (exited = true))
  while (Date.now() < deadline) {
    if (exited) throw new Error("The app stopped while starting")
    const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      .then((response) => response.json())
      .catch(() => [])
    if (Array.isArray(pages) && pages.some((page) => isWindow(page, uiPort))) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error("The app's window didn't load within three minutes")
}

/** The app's own window, as the protocol lists it, rather than the offscreen renderer or a tool. */
export function isWindow(page: unknown, uiPort: number): boolean {
  if (typeof page !== "object" || page === null || !("url" in page) || typeof page.url !== "string") return false
  return page.url.startsWith(`http://localhost:${uiPort}`) && !page.url.includes("render")
}

/** Stops the runner and everything it started: Electron, its service and the servers. */
async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || !child.pid) return
  const exited = new Promise((resolve) => child.once("exit", resolve))
  // The runner stops Electron when it ends, but on Windows only a tree kill ends them all at once.
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
  else child.kill()
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))])
}

/**
 * Components the canvas has to find from React's tree: a row that takes a member and renders none of its other props,
 * a pair of elements with nothing around them, and a field that passes its props to the input inside it.
 */
const memberRow = `import type * as React from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

export interface Member {
  name: string
  role: string
}

/** One member of a team: it takes the member and nothing else, so it renders none of the props it's given. */
export function MemberRow({ member }: { member: Member }) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <Avatar>
        <AvatarFallback>{member.name.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <span className="flex-1 text-sm font-medium">{member.name}</span>
      <Badge variant="secondary">{member.role}</Badge>
    </div>
  )
}

/** A member's name and role, with no element around them. */
export function MemberNames({ member }: { member: Member }) {
  return (
    <>
      <span className="text-sm font-medium">{member.name}</span>
      <span className="text-xs text-muted-foreground">{member.role}</span>
    </>
  )
}

/** A labelled email field, which passes its props to the input inside it. */
export function EmailField(props: React.ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1.5 rounded-md border p-2 text-sm">
      Email
      <Input type="email" {...props} />
    </label>
  )
}
`

const member = (id: string, name: string, role: string) => ({
  id,
  name,
  type: "component",
  component: "MemberRow",
  props: { member: { name, role } }
})

/** Three rows that ignore their props, a fragment and a field, in a column, to the left of everything else. */
const membersDesign = {
  id: "members",
  name: "Members",
  kind: "screen",
  frames: { desktop: { width: 480 } },
  position: { x: -1200, y: 0 },
  root: {
    id: "page",
    name: "Page",
    type: "layout",
    style: { gap: 3, padding: [6, 6], background: "background", foreground: "foreground" },
    children: [
      member("ada", "Ada Lovelace", "Admin"),
      member("lin", "Lin Yu", "Editor"),
      member("grace", "Grace Hopper", "Viewer"),
      {
        id: "names",
        name: "Names",
        type: "component",
        component: "MemberNames",
        props: { member: { name: "Ada", role: "Admin" } }
      },
      {
        id: "email",
        name: "Email",
        type: "component",
        component: "EmailField",
        props: { placeholder: "you@example.com" }
      }
    ]
  },
  states: [{ id: "default", name: "Default" }],
  view: { modes: [] }
}
