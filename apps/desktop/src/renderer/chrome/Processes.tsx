import {
  Accessibility,
  BookOpen,
  Braces,
  Check,
  Drama,
  ExternalLink,
  FlaskConical,
  Hammer,
  ImageDown,
  Lock,
  Package,
  RotateCw,
  SearchCheck,
  ShieldCheck,
  Square,
  WandSparkles,
  X,
  Zap
} from "lucide-react"
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ProcessStatus, ProjectProcess } from "../../shared/protocol.ts"
import { useProject } from "../canvas/context.ts"
import { Hint } from "./Hint.tsx"
import {
  dismissProcess,
  formatUptime,
  isSeen,
  markSeen,
  restartProcess,
  stopProcess,
  useNow,
  useProcesses
} from "./process-store.ts"

/**
 * Each kind's icon, the color its tile is tinted, and what it is, for a process with no address to show. Each hue sits at
 * least 25 degrees from any other, so tiles side by side don't read as the same kind: the build server is the canvas's
 * blue, Format its component purple, and Storybook keeps its pink.
 */
const kinds: Record<ProjectProcess["kind"], { icon: typeof Hammer; tint: string; role: string }> = {
  builder: { icon: Zap, tint: "var(--canvas-screen)", role: "Renders the canvas" },
  storybook: { icon: BookOpen, tint: "oklch(0.68 0.2 2)", role: "Storybook" },
  install: { icon: Package, tint: "oklch(0.76 0.15 65)", role: "Installs packages" },
  typecheck: { icon: Braces, tint: "oklch(0.66 0.15 230)", role: "Checks types" },
  test: { icon: FlaskConical, tint: "oklch(0.72 0.17 140)", role: "Runs unit tests" },
  e2e: { icon: Drama, tint: "oklch(0.68 0.17 30)", role: "Runs Playwright" },
  format: { icon: WandSparkles, tint: "var(--canvas-component)", role: "Formats files" },
  lint: { icon: SearchCheck, tint: "oklch(0.82 0.15 98)", role: "Lints files" },
  verify: { icon: ShieldCheck, tint: "oklch(0.75 0.13 175)", role: "Verifies the project" },
  build: { icon: Hammer, tint: "oklch(0.68 0.03 260)", role: "Builds the project" },
  export: { icon: ImageDown, tint: "oklch(0.74 0.12 205)", role: "Exports designs" },
  accessibility: { icon: Accessibility, tint: "oklch(0.72 0.17 330)", role: "Checks accessibility" }
}

const serverWords: Partial<Record<ProcessStatus, string>> = {
  starting: "Starting",
  stopping: "Stopping",
  stopped: "Stopped",
  failed: "Crashed"
}

const taskWords: Partial<Record<ProcessStatus, string>> = {
  stopping: "Canceling",
  passed: "Passed",
  failed: "Failed",
  canceled: "Canceled"
}

const ended = new Set<ProcessStatus>(["stopped", "failed", "passed", "canceled"])

/**
 * The status bar's processes: a light for each server Parity runs for the open projects and each task running, and a
 * flyout to see how long each has run, what tasks found, and to stop them. A task's result stays marked in the status
 * bar until the flyout has been opened.
 */
export function Processes() {
  const [open, setOpen] = useState(false)
  const processes = useProcesses(open)
  const session = useProject()
  const now = useNow(open)
  // Results that finish while the flyout is open are seen as they arrive.
  useEffect(() => {
    if (open) markSeen(processes.filter((process) => process.shape === "task" && ended.has(process.status)))
  })
  const finished = processes
    .filter((process) => process.shape === "task" && ended.has(process.status))
    .sort((a, b) => (b.stoppedAt ?? 0) - (a.stoppedAt ?? 0))
  const groups = groupProcesses(
    processes.filter((process) => !finished.includes(process)),
    session.id
  )
  const active = groups.flatMap((group) => group.processes)
  if (active.length === 0 && finished.length === 0) return null

  const crashed = active.find((process) => process.shape === "server" && process.status === "failed")
  const unseen = finished.filter((process) => !isSeen(process))
  const unseenFailure = unseen.find((process) => process.status === "failed")
  const starting = active.find((process) => process.status === "starting")
  const task = active.find((process) => process.shape === "task")
  const stoppable = active.filter((process) => process.shape === "server" && process.canStop)
  const manyProjects = new Set(processes.map((process) => process.projectId)).size > 1

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Hint label="Show what's running" hidden={open}>
          <button
            type="button"
            data-slot="processes-trigger"
            className="flex h-6 shrink-0 items-center gap-2 rounded px-1.5 hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
          >
            <span className="flex items-center gap-[3px]" aria-hidden>
              {active.slice(0, 5).map((process, index) => (
                <Light key={process.id} process={process} size={6} delay={index * 0.45} />
              ))}
              {active.length > 5 && <span className="ml-0.5 text-[10px]">+{active.length - 5}</span>}
              {unseen[0] && <Light process={unseenFailure ?? unseen[0]} size={6} />}
            </span>
            <TriggerLabel
              crashed={crashed}
              failed={unseenFailure}
              starting={starting}
              task={task}
              running={active.filter((process) => !ended.has(process.status)).length}
            />
          </button>
        </Hint>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={6}
        className="w-[27rem] gap-0 overflow-hidden rounded-xl p-0 text-xs shadow-xl"
      >
        <header className="flex items-start gap-3 px-3.5 pt-3 pb-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Processes</div>
            <div className="mt-0.5 text-muted-foreground">{summary(active)}</div>
          </div>
          {stoppable.length > 1 && (
            <ConfirmButton
              label="Stop all"
              confirm={`Stop ${stoppable.length}`}
              onConfirm={() => void Promise.all(stoppable.map(stopProcess))}
            />
          )}
        </header>
        <div className="max-h-[min(30rem,60vh)] overflow-y-auto border-t pb-1.5 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]">
          {groups.map((group) => (
            <section key={group.key} className="pt-2">
              <h3 className="px-3.5 pb-1 text-[11px] font-medium text-muted-foreground">{group.title}</h3>
              <ul>
                {group.processes.map((process) => (
                  <ProcessRow key={process.id} process={process} now={now} />
                ))}
              </ul>
            </section>
          ))}
          {finished.length > 0 && (
            <section className="pt-2">
              <h3 className="flex items-center px-3.5 pb-1 text-[11px] font-medium text-muted-foreground">
                <span className="flex-1">Last results</span>
                <button
                  type="button"
                  className="rounded px-1 font-normal hover:bg-accent hover:text-foreground"
                  onClick={() => void Promise.all(finished.map(dismissProcess))}
                >
                  Clear
                </button>
              </h3>
              <ul>
                {finished.map((process) => (
                  <ProcessRow key={process.id} process={process} now={now} showProject={manyProjects} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** What the status bar says: a crash or a failed task first, then what's starting or running, else how many run. */
function TriggerLabel({
  crashed,
  failed,
  starting,
  task,
  running
}: {
  crashed: ProjectProcess | undefined
  failed: ProjectProcess | undefined
  starting: ProjectProcess | undefined
  task: ProjectProcess | undefined
  running: number
}) {
  if (crashed) return <span style={{ color: "var(--process-failed)" }}>{crashed.name} crashed</span>
  if (failed) return <span style={{ color: "var(--process-failed)" }}>{failed.name} failed</span>
  if (starting) return <span>Starting {starting.name}</span>
  if (task) {
    return (
      <span className="tabular-nums">
        {task.name}
        {task.progress && (
          <span className="ml-1.5 text-muted-foreground">
            {task.progress.done} of {task.progress.total}
          </span>
        )}
      </span>
    )
  }
  return (
    <span>
      <strong className="font-medium text-foreground tabular-nums">{running}</strong> running
    </span>
  )
}

interface Group {
  key: string
  title: string
  processes: ProjectProcess[]
}

/** A group for each open project, the active one first: its servers, then its tasks running, oldest first. */
function groupProcesses(processes: ProjectProcess[], activeId: string): Group[] {
  const order: ProjectProcess["kind"][] = ["builder", "storybook"]
  const rank = (process: ProjectProcess) => (process.shape === "task" ? order.length : order.indexOf(process.kind))
  const sorted = [...processes].sort((a, b) => rank(a) - rank(b) || a.startedAt - b.startedAt)
  const groups = new Map<string, Group>()
  for (const process of sorted) {
    const group = groups.get(process.projectId) ?? { key: process.projectId, title: process.project, processes: [] }
    group.processes.push(process)
    groups.set(process.projectId, group)
  }
  return [...groups.values()].sort((a, b) => Number(b.key === activeId) - Number(a.key === activeId))
}

/** "2 servers and 1 task running for 1 open project", with any crash. */
function summary(processes: ProjectProcess[]): string {
  const count = (shape: ProjectProcess["shape"]) =>
    processes.filter((process) => process.shape === shape && !ended.has(process.status)).length
  const servers = count("server")
  const tasks = count("task")
  const crashed = processes.filter((process) => process.status === "failed").length
  const running = [
    servers > 0 && (servers === 1 ? "1 server" : `${servers} servers`),
    tasks > 0 && (tasks === 1 ? "1 task" : `${tasks} tasks`)
  ].filter(Boolean)
  const projects = new Set(processes.map((process) => process.projectId)).size
  const parts = [running.length > 0 ? `${running.join(" and ")} running` : "Nothing running"]
  if (crashed > 0) parts.push(`${crashed} crashed`)
  if (projects === 0) return parts.join(", ")
  return `${parts.join(", ")} for ${projects === 1 ? "1 open project" : `${projects} open projects`}`
}

/**
 * A status light. A running server's breathes; a starting or stopping one's ring turns, and so does a running task's. A
 * passed task shows a check, a failed one or a crashed server pings red, and a stopped or canceled one is hollow.
 */
export function Light({ process, size = 7, delay = 0 }: { process: ProjectProcess; size?: number; delay?: number }) {
  const { status } = process
  const box: CSSProperties = { width: size, height: size }
  const working = status === "starting" || status === "stopping" || (status === "running" && process.shape === "task")
  if (working) {
    const color = `var(--process-${status === "running" ? "running" : "starting"})`
    return (
      <span
        data-process-motion
        className="inline-block shrink-0 animate-spin rounded-full border-[1.5px]"
        style={{ ...box, borderColor: color, borderTopColor: "transparent", animationDuration: "0.9s" }}
      />
    )
  }
  if (status === "passed") {
    return (
      <Check
        className="shrink-0"
        style={{ width: size + 3, height: size + 3, color: "var(--process-running)", margin: -1.5 }}
        strokeWidth={3.5}
      />
    )
  }
  if (status === "stopped" || status === "canceled") {
    return (
      <span
        className="inline-block shrink-0 rounded-full border-[1.5px]"
        style={{ ...box, borderColor: "var(--process-stopped)" }}
      />
    )
  }
  const color = `var(--process-${status})`
  return (
    <span className="relative inline-flex shrink-0" style={box}>
      {status === "failed" && (
        <span
          data-process-motion
          className="absolute inset-0 rounded-full"
          style={{ background: color, animation: "process-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite" }}
        />
      )}
      <span
        data-process-motion
        className="relative inline-block rounded-full"
        style={{
          ...box,
          background: color,
          ["--process-light" as string]: color,
          ...(status === "running" ? { animation: `process-breathe 2.8s ease-in-out ${delay}s infinite` } : {})
        }}
      />
    </span>
  )
}

/** The kind's icon on a tile tinted its color, with the status light on its corner. */
export function KindTile({ process }: { process: ProjectProcess }) {
  const { icon: Icon, tint } = kinds[process.kind]
  const faded = process.status === "stopped" || process.status === "canceled"
  return (
    <span
      className="relative grid size-8 shrink-0 place-items-center rounded-lg transition-opacity"
      style={{
        opacity: faded ? 0.5 : 1,
        color: tint,
        background: `linear-gradient(160deg, color-mix(in oklch, ${tint} 24%, transparent), color-mix(in oklch, ${tint} 10%, transparent))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${tint} 28%, transparent), inset 0 1px 0 color-mix(in oklch, white 10%, transparent)`
      }}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      <span className="absolute -right-0.5 -bottom-0.5 grid size-[11px] place-items-center rounded-full bg-popover">
        <Light process={process} size={7} />
      </span>
    </span>
  )
}

function ProcessRow({
  process,
  now,
  showProject = false
}: {
  process: ProjectProcess
  now: number
  /** Name its project, as in the last results when more than one project is open. */
  showProject?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const done = ended.has(process.status)
  const task = process.shape === "task"
  const word = (task ? taskWords : serverWords)[process.status]
  const time =
    task && done ? ago(now - (process.stoppedAt ?? now)) : formatUptime((process.stoppedAt ?? now) - process.startedAt)
  const hasActions = process.canStop || process.canRestart || canOpen(process) || done
  return (
    <li className="group/row px-1.5" style={{ animation: "process-row-in 220ms ease-out both" }} data-process-motion>
      <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors group-hover/row:bg-accent/60">
        <KindTile process={process} />
        <div className="min-w-0 flex-1">
          <Hint label={describe(process)} wait>
            <div className="flex items-baseline gap-2">
              <span
                className={`truncate text-[13px] font-medium ${done && process.status !== "failed" && !task ? "text-muted-foreground" : "text-foreground"}`}
              >
                {process.name}
              </span>
              {word && <StatusWord status={process.status}>{word}</StatusWord>}
              {showProject && <span className="truncate text-[10.5px] text-muted-foreground">{process.project}</span>}
            </div>
          </Hint>
          {task ? <TaskLine process={process} /> : <ServerLine process={process} />}
        </div>
        <div className="grid shrink-0 [grid-template-areas:'stack'] *:[grid-area:stack]">
          <div
            className={`flex items-center justify-end tabular-nums transition-all duration-150 ${hasActions ? "group-focus-within/row:pointer-events-none group-focus-within/row:opacity-0 group-hover/row:pointer-events-none group-hover/row:opacity-0" : ""} ${confirming ? "pointer-events-none opacity-0" : ""}`}
          >
            <span className={`text-[12px] ${done ? "text-muted-foreground" : "text-foreground"}`}>{time}</span>
          </div>
          {hasActions && (
            <div
              className={`flex items-center justify-end gap-0.5 transition-all duration-150 ${confirming ? "" : "pointer-events-none translate-x-1 opacity-0 group-focus-within/row:pointer-events-auto group-focus-within/row:translate-x-0 group-focus-within/row:opacity-100 group-hover/row:pointer-events-auto group-hover/row:translate-x-0 group-hover/row:opacity-100"}`}
            >
              {confirming ? (
                <StopConfirm
                  label={task ? "Cancel" : "Stop"}
                  keep={task ? "Keep going" : "Keep running"}
                  onCancel={() => setConfirming(false)}
                  onStop={() => {
                    setConfirming(false)
                    void stopProcess(process)
                  }}
                />
              ) : (
                <>
                  {canOpen(process) && (
                    <Action
                      label="Open in your browser"
                      onClick={() => window.open(process.domain ?? process.url, "_blank")}
                    >
                      <ExternalLink />
                    </Action>
                  )}
                  {process.canRestart && (
                    <Action
                      label={task ? "Run again" : done ? "Start again" : "Restart"}
                      onClick={() => void restartProcess(process)}
                    >
                      <RotateCw />
                    </Action>
                  )}
                  {process.canStop && !done && (
                    <Action label={task ? "Cancel" : "Stop"} danger onClick={() => setConfirming(true)}>
                      <Square className="fill-current" />
                    </Action>
                  )}
                  {done && (
                    <Action label="Dismiss" onClick={() => void dismissProcess(process)}>
                      <X />
                    </Action>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/** A server's address, or why it crashed. */
function ServerLine({ process }: { process: ProjectProcess }) {
  if (process.status === "failed" && process.error) {
    const [first, ...rest] = process.error.split("\n")
    return (
      <Hint label={first} detail={rest.join("\n").trim() || undefined} wait>
        <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--process-failed)" }}>
          {first}
        </div>
      </Hint>
    )
  }
  return <Address process={process} />
}

/** What a running task is doing, with how far it has got, or what a finished one found. */
function TaskLine({ process }: { process: ProjectProcess }) {
  if (process.status === "running" || process.status === "stopping") {
    const { progress } = process
    const share = progress && progress.total > 0 ? Math.min(1, progress.done / progress.total) : undefined
    return (
      <div className="mt-0.5 flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-baseline gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{process.detail ?? kinds[process.kind].role}</span>
          {progress && (
            <span className="ml-auto shrink-0 tabular-nums">
              {progress.done} of {progress.total}
            </span>
          )}
        </div>
        {share !== undefined && (
          <span
            className="relative h-[3px] overflow-hidden rounded-full"
            style={{ background: "color-mix(in oklch, var(--muted-foreground) 16%, transparent)" }}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
              style={{
                width: `${share * 100}%`,
                background: `linear-gradient(90deg, color-mix(in oklch, ${kinds[process.kind].tint} 55%, transparent), ${kinds[process.kind].tint})`
              }}
            />
          </span>
        )}
      </div>
    )
  }
  const color = process.status === "failed" ? "var(--process-failed)" : undefined
  return (
    <Hint
      label={process.error ?? process.summary}
      detail={process.stoppedAt && `Took ${formatUptime(process.stoppedAt - process.startedAt)}`}
      wait
    >
      <div
        className={`mt-0.5 truncate text-[11px] ${color ? "" : "text-muted-foreground"}`}
        style={color ? { color } : undefined}
      >
        {process.summary ?? kinds[process.kind].role}
      </div>
    </Hint>
  )
}

function StatusWord({ status, children }: { status: ProcessStatus; children: ReactNode }) {
  const color = `var(--process-${status === "stopping" ? "starting" : status === "canceled" ? "stopped" : status})`
  const moving = status === "starting" || status === "stopping"
  return (
    <span
      data-process-motion
      className="shrink-0 text-[10.5px] font-medium"
      style={
        moving
          ? {
              color: "transparent",
              backgroundImage: `linear-gradient(90deg, ${color} 0%, ${color} 35%, color-mix(in oklch, ${color} 35%, white) 50%, ${color} 65%, ${color} 100%)`,
              backgroundSize: "200% 100%",
              backgroundClip: "text",
              animation: "process-shimmer 1.6s linear infinite"
            }
          : { color: status === "passed" ? "var(--process-running)" : color }
      }
    >
      {children}
    </span>
  )
}

/** Where it serves: its Portless name when it has one, its subdomain bright, or its local port. */
function Address({ process }: { process: ProjectProcess }) {
  if (!process.domain && !process.url) {
    return <div className="mt-0.5 text-[11px] text-muted-foreground">{kinds[process.kind].role}</div>
  }
  const content = process.domain ? <Domain domain={process.domain} url={process.url} /> : <Port url={process.url!} />
  if (!canOpen(process)) {
    return <div className="mt-0.5 flex min-w-0 items-center font-mono text-[11px]">{content}</div>
  }
  return (
    <button
      type="button"
      className="mt-0.5 flex max-w-full min-w-0 items-center rounded font-mono text-[11px] decoration-muted-foreground/40 underline-offset-2 hover:underline"
      onClick={() => window.open(process.domain ?? process.url, "_blank")}
    >
      {content}
    </button>
  )
}

function Domain({ domain, url }: { domain: string; url: string | undefined }) {
  const parsed = new URL(domain)
  const [first, ...rest] = parsed.hostname.split(".")
  const port = url ? new URL(url).port : ""
  return (
    <>
      {parsed.protocol === "https:" && (
        <Lock className="mr-1 size-2.5 shrink-0" style={{ color: "var(--process-running)" }} strokeWidth={2.5} />
      )}
      <span className="truncate">
        <span className="text-foreground">{first}</span>
        <span className="text-muted-foreground">
          .{rest.join(".")}
          {parsed.port ? `:${parsed.port}` : ""}
        </span>
      </span>
      {port && <span className="ml-1.5 shrink-0 text-muted-foreground/60">:{port}</span>}
    </>
  )
}

function Port({ url }: { url: string }) {
  const parsed = new URL(url)
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80")
  return (
    <span className="truncate">
      <span className="text-muted-foreground">{parsed.hostname}</span>
      <span className="text-foreground">:{port}</span>
    </span>
  )
}

function Action({
  label,
  onClick,
  danger,
  children
}: {
  label: string
  onClick(): void
  danger?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={`grid size-7 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-3.5 ${danger ? "hover:text-[var(--process-failed)]" : ""}`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

/** Stopping or canceling, asked once more in place: Enter does it; Escape, or moving focus away, keeps it going. */
function StopConfirm({
  label,
  keep,
  onStop,
  onCancel
}: {
  label: string
  keep: string
  onStop(): void
  onCancel(): void
}) {
  const stopRef = useRef<HTMLButtonElement>(null)
  useEffect(() => stopRef.current?.focus(), [])
  return (
    <span
      className="flex items-center gap-0.5"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onCancel()
      }}
    >
      <Button
        ref={stopRef}
        variant="destructive"
        size="xs"
        onClick={onStop}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation()
            onCancel()
          }
        }}
      >
        {label}
      </Button>
      <Action label={keep} onClick={onCancel}>
        <X />
      </Action>
    </span>
  )
}

/** A button that asks once more before it acts. */
function ConfirmButton({ label, confirm, onConfirm }: { label: string; confirm: string; onConfirm(): void }) {
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const timeout = setTimeout(() => setAsking(false), 4000)
    return () => clearTimeout(timeout)
  }, [asking])
  return (
    <Button
      variant={asking ? "destructive" : "ghost"}
      size="xs"
      onClick={() => {
        if (asking) {
          setAsking(false)
          onConfirm()
        } else setAsking(true)
      }}
    >
      {asking ? confirm : label}
    </Button>
  )
}

/** How long ago something finished: "just now", "2m ago", "1h ago". */
function ago(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  if (seconds < 10) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`
}

/** Whether it serves something worth opening: the build server only serves the canvas its modules. */
function canOpen(process: ProjectProcess): boolean {
  return process.kind === "storybook" && !!(process.domain ?? process.url) && process.status === "running"
}

function describe(process: ProjectProcess): string {
  if (process.kind === "builder")
    return `${process.name} builds ${process.project} for the canvas, inside Parity's project service. It stops when the project's tab closes.`
  if (process.shape === "task") return `${kinds[process.kind].role} for ${process.project}.`
  if (process.startedBy === "elsewhere")
    return `${process.project}'s ${process.name}, already running when Parity needed it, so Parity uses it and leaves it running.`
  return `${process.project}'s ${process.name}, started by Parity.`
}
