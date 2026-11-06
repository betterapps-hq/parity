import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { resolveModes } from "@parity-app/core"
import { Ban, ChevronRight, CircleX, FolderCode, Info, Search, SquareTerminal, TriangleAlert, X } from "lucide-react"
import { type ReactNode, useState, useSyncExternalStore } from "react"
import { useProject } from "../canvas/context.ts"
import { DesignIcon, designColor } from "../canvas/kinds.tsx"
import { clearConsole } from "../console-feed.ts"
import { byDesign, type ConsoleMessage, type Level, tally, useConsole } from "../console-store.ts"
import { type ContainerEntry, useContainerEntries } from "../design-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { openSource } from "./code-editor.ts"
import { Hint } from "./Hint.tsx"
import { IconButton } from "./IconButton.tsx"
import { keymap } from "./keymap.ts"
import { panelLimits, setLayout, useLayout } from "./layout.ts"
import { revealSelection } from "./reveal.ts"

/** What the console shows: one level or all, one design's messages or every design's, and the words searched for. */
interface Filter {
  level: Level | "all"
  /** A design's key, or `project` for messages no design wrote; every message when unset. */
  design?: string
  query: string
}

let filter: Filter = { level: "all", query: "" }
const listeners = new Set<() => void>()

function setFilter(change: Partial<Filter>): void {
  filter = { ...filter, ...change }
  for (const listener of listeners) listener()
}

function useFilter(): Filter {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => filter
  )
}

/** Opens the console, showing one design's messages when given, as its badge on the canvas does, or every one. */
export function showConsole(design?: string): void {
  setFilter({ design, level: "all" })
  setLayout({ console: true })
}

/**
 * The console, docked under the canvas (PAR-147): what the project's designs wrote, grouped by design, worst first
 * within each, from the same log `parity console` gives agents. It filters by level, by design and by words, and Clear
 * empties it for agents too. Each message says how often it came, the frames it came from, where in the project's
 * files it was written, and when; an error opens to its stack.
 */
export function ConsolePanel() {
  const layout = useLayout()
  const session = useProject()
  const messages = useConsole(session.id)
  const shown = useFilter()
  if (!layout.console) return null
  const designs = byDesign(messages)
  const wanted = shown.query.trim().toLowerCase()
  const groups = designs
    .filter(({ design }) => !shown.design || (design ?? "project") === shown.design)
    .map((group) => ({
      ...group,
      shown: group.messages.filter(
        (message) =>
          (shown.level === "all" || message.level === shown.level) &&
          (!wanted || message.text.toLowerCase().includes(wanted))
      )
    }))
    .filter((group) => group.shown.length > 0)
  return (
    <section
      aria-label="Console"
      className="relative flex shrink-0 flex-col border-t bg-background"
      style={{ height: layout.consoleHeight }}
    >
      <ResizeTop height={layout.consoleHeight} />
      <ConsoleHeader session={session} messages={messages} designs={designs.map((group) => group.design)} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && <NothingLogged />}
        {messages.length > 0 && groups.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">No messages match.</p>
        )}
        {groups.map((group) => (
          <DesignGroup key={group.design ?? "project"} session={session} design={group.design} {...group} />
        ))}
      </div>
    </section>
  )
}

function NothingLogged() {
  return (
    <Empty className="h-full border-0 py-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SquareTerminal />
        </EmptyMedia>
        <EmptyTitle className="text-sm">Nothing logged</EmptyTitle>
        <EmptyDescription className="text-xs">
          Messages your designs log show here. Agents read the same log with{" "}
          <code className="font-mono">parity console</code>.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function ConsoleHeader({
  session,
  messages,
  designs
}: {
  session: ProjectSession
  messages: readonly ConsoleMessage[]
  designs: (string | undefined)[]
}) {
  const shown = useFilter()
  const entries = useContainerEntries(session.store)
  const counts = tally(messages)
  const name = (design: string | undefined) => designName(entries, design)
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
      <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Console</h2>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[shown.level]}
        onValueChange={([level]) => level && setFilter({ level: level as Filter["level"] })}
        aria-label="Show"
      >
        <ToggleGroupItem value="all" className="h-7 px-2.5 text-xs">
          All
        </ToggleGroupItem>
        <ToggleGroupItem value="error" aria-label={`Errors, ${counts.errors}`} className="h-7 gap-1 px-2 text-xs">
          <CircleX className="text-destructive" /> {counts.errors}
        </ToggleGroupItem>
        <ToggleGroupItem value="warning" aria-label={`Warnings, ${counts.warnings}`} className="h-7 gap-1 px-2 text-xs">
          <TriangleAlert className="text-amber-500" /> {counts.warnings}
        </ToggleGroupItem>
        <ToggleGroupItem value="info" aria-label={`Other messages, ${counts.info}`} className="h-7 gap-1 px-2 text-xs">
          <Info className="text-muted-foreground" /> {counts.info}
        </ToggleGroupItem>
      </ToggleGroup>
      <Select<string>
        value={shown.design ?? "all"}
        onValueChange={(design) => setFilter({ design: !design || design === "all" ? undefined : design })}
      >
        <SelectTrigger size="sm" className="h-7 w-44 text-xs" aria-label="Designs shown">
          <SelectValue>
            {(value: string) =>
              value === "all" ? "Every design" : (name(value === "project" ? undefined : value) ?? value)
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Every design</SelectItem>
          {designs.map((design) => (
            <SelectItem key={design ?? "project"} value={design ?? "project"}>
              {name(design)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <InputGroup className="h-7 w-56">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          value={shown.query}
          onChange={(event) => setFilter({ query: event.currentTarget.value })}
          placeholder="Filter messages"
          aria-label="Filter messages"
          className="text-xs"
        />
      </InputGroup>
      <span className="flex-1" />
      <IconButton label="Clear the console" onClick={() => clearConsole(session)}>
        <Ban />
      </IconButton>
      <IconButton
        label="Close the console"
        shortcut={keymap.console.keys[0]}
        onClick={() => setLayout({ console: false })}
      >
        <X />
      </IconButton>
    </div>
  )
}

/** A design's messages under its name, which selects it, with its counts; the project's own last, named so. */
function DesignGroup({
  session,
  design,
  messages,
  shown
}: {
  session: ProjectSession
  design: string | undefined
  messages: ConsoleMessage[]
  shown: ConsoleMessage[]
}) {
  const entries = useContainerEntries(session.store)
  const entry = entries.find((candidate) => candidate.key === design)
  const [open, setOpen] = useState(true)
  const counts = tally(messages)
  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<section aria-label={designName(entries, design)} />}>
      <div className="sticky top-0 z-10 flex h-8 items-center gap-2 border-b bg-muted/80 pr-2 pl-1 backdrop-blur">
        <CollapsibleTrigger
          render={
            <button
              type="button"
              aria-label={designName(entries, design)}
              className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium hover:bg-accent"
            />
          }
        >
          <ChevronRight className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          {entry ? (
            <DesignIcon
              kind={entry.container.kind}
              className="size-3.5 shrink-0"
              style={{ color: designColor(entry.container.kind) }}
            />
          ) : (
            <FolderCode className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{designName(entries, design)}</span>
        </CollapsibleTrigger>
        <Counts errors={counts.errors} warnings={counts.warnings} />
        <span className="flex-1" />
        {entry ? (
          <Button
            variant="ghost"
            size="xs"
            className="text-xs"
            onClick={() => {
              session.selection.set({ design: entry.key })
              revealSelection(session)
            }}
          >
            Select
          </Button>
        ) : (
          <span className="text-[11px] text-muted-foreground">Written outside any design</span>
        )}
      </div>
      <CollapsibleContent>
        <ul>
          {shown.map((message) => (
            <MessageRow key={message.id} session={session} entry={entry} message={message} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

const levelLook: Record<Level, { icon: ReactNode; row: string; text: string; label: string }> = {
  error: {
    icon: <CircleX className="size-3.5 text-destructive" />,
    row: "bg-destructive/[0.06]",
    text: "text-destructive",
    label: "Error"
  },
  warning: {
    icon: <TriangleAlert className="size-3.5 text-amber-500" />,
    row: "bg-amber-500/[0.07]",
    text: "text-amber-700 dark:text-amber-300",
    label: "Warning"
  },
  info: { icon: <Info className="size-3.5 text-muted-foreground" />, row: "", text: "", label: "Info" },
  debug: {
    icon: <Info className="size-3.5 text-muted-foreground/60" />,
    row: "",
    text: "text-muted-foreground",
    label: "Debug"
  }
}

/**
 * One message: its level, its text, how often it came, the frames it came from, where it was written, and when. One
 * with a stack opens to show it, each call in the project's files a link to its line.
 */
function MessageRow({
  session,
  entry,
  message
}: {
  session: ProjectSession
  entry: ContainerEntry | undefined
  message: ConsoleMessage
}) {
  const look = levelLook[message.level]
  const [open, setOpen] = useState(false)
  const stack = message.stack ?? []
  const frames = message.frames ?? []
  const frameName = ({ state, mode }: { state: string; mode: string }) => {
    const stateName = entry?.container.states.find((candidate) => candidate.id === state)?.name ?? state
    const modeName = resolveModes(session.store.getModes()).find((candidate) => candidate.id === mode)?.name ?? mode
    return entry && entry.container.states.length > 1 ? `${stateName} in ${modeName}` : modeName
  }
  return (
    <li className={`border-b border-border/60 ${look.row}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start gap-2 py-1.5 pr-3 pl-2">
          {stack.length > 0 ? (
            <CollapsibleTrigger
              render={
                <button
                  type="button"
                  aria-label={open ? "Hide the stack" : "Show the stack"}
                  className="mt-px grid size-4 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                />
              }
            >
              <ChevronRight className={`size-3 transition-transform ${open ? "rotate-90" : ""}`} />
            </CollapsibleTrigger>
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <span className="mt-px shrink-0">
            {look.icon}
            <span className="sr-only">{look.label}</span>
          </span>
          <p
            className={`min-w-0 flex-1 font-mono text-xs leading-5 break-words whitespace-pre-wrap ${look.text} ${
              open ? "" : "line-clamp-2"
            }`}
          >
            {message.text}
          </p>
          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
            {message.count > 1 && (
              <Hint label={`Logged ${message.count} times`} wait>
                <Badge variant="secondary" className="h-4 min-w-5 px-1.5 text-[10px] tabular-nums">
                  {message.count}
                </Badge>
              </Hint>
            )}
            {frames.slice(0, 2).map((frame) => (
              <span
                key={`${frame.state}:${frame.mode}`}
                className="rounded-sm bg-foreground/[0.07] px-1.5 py-px text-[11px] text-muted-foreground"
              >
                {frameName(frame)}
              </span>
            ))}
            {frames.length > 2 && (
              <Hint label={frames.slice(2).map(frameName).join(", ")} wait>
                <span className="rounded-sm bg-foreground/[0.07] px-1.5 py-px text-[11px] text-muted-foreground">
                  +{frames.length - 2}
                </span>
              </Hint>
            )}
            {message.at && (
              <Hint label={`Open ${message.at.path} at line ${message.at.line}`} wait>
                <button
                  type="button"
                  className="font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => void openSource(session, message.at!)}
                >
                  {`${message.at.path.split("/").at(-1)}:${message.at.line}`}
                </button>
              </Hint>
            )}
            <Hint label={new Date(message.last).toLocaleTimeString()} wait>
              <time
                dateTime={new Date(message.last).toISOString()}
                className="w-7 text-right text-[11px] text-muted-foreground tabular-nums"
              >
                {ago(message.last)}
              </time>
            </Hint>
          </div>
        </div>
        <CollapsibleContent>
          <ol className="pb-2 pl-14 font-mono text-[11px] leading-5 text-muted-foreground">
            {stack.map((call, index) => (
              <li key={index} className="truncate">
                {call}
              </li>
            ))}
          </ol>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

/** A group's errors and warnings, each only when there are some. */
export function Counts({ errors, warnings }: { errors: number; warnings: number }) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
      {errors > 0 && (
        <span className="flex items-center gap-1" aria-label={`${errors} ${errors === 1 ? "error" : "errors"}`}>
          <CircleX className="size-3 text-destructive" /> {errors}
        </span>
      )}
      {warnings > 0 && (
        <span className="flex items-center gap-1" aria-label={`${warnings} ${warnings === 1 ? "warning" : "warnings"}`}>
          <TriangleAlert className="size-3 text-amber-500" /> {warnings}
        </span>
      )}
    </span>
  )
}

/** The console's top edge: drag it to make the console taller or shorter, or focus it and use the arrows. */
function ResizeTop({ height }: { height: number }) {
  const [min, max] = panelLimits.console
  const resize = (next: number) => setLayout({ consoleHeight: Math.round(Math.min(max, Math.max(min, next))) })
  return (
    <Hint label="Drag to resize" detail="Double-click to reset." side="top" wait>
      <button
        type="button"
        aria-label={`Resize the console, ${height} pixels tall`}
        className="absolute inset-x-0 -top-[3px] z-20 h-1.5 cursor-row-resize transition-colors outline-none hover:bg-ring/40 focus-visible:bg-ring/60 active:bg-ring/60"
        onDoubleClick={() => setLayout({ consoleHeight: 240 })}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 48 : 16
          if (event.key === "ArrowUp") resize(height + step)
          else if (event.key === "ArrowDown") resize(height - step)
          else return
          event.preventDefault()
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          const target = event.currentTarget
          target.setPointerCapture(event.pointerId)
          const startY = event.clientY
          const move = (moveEvent: PointerEvent) => resize(height - (moveEvent.clientY - startY))
          const end = () => {
            target.removeEventListener("pointermove", move)
            target.removeEventListener("pointerup", end)
            target.removeEventListener("pointercancel", end)
          }
          target.addEventListener("pointermove", move)
          target.addEventListener("pointerup", end)
          target.addEventListener("pointercancel", end)
        }}
      />
    </Hint>
  )
}

function designName(entries: readonly ContainerEntry[], design: string | undefined): string {
  if (!design) return "Project"
  return entries.find((entry) => entry.key === design)?.container.name ?? "A deleted design"
}

/** How long ago, short: now, 40s, 5m, 2h, 3d. */
function ago(time: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000))
  if (seconds < 10) return "now"
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86_400)}d`
}
