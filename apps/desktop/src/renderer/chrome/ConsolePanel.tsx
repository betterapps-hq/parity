import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@buildkitgg/shadcn-baseui-kit"
import { resolveModes } from "@parity-app/core"
import {
  Ban,
  ChevronDown,
  ChevronRight,
  CircleX,
  FolderCode,
  Info,
  Search,
  SquareTerminal,
  TriangleAlert,
  X
} from "lucide-react"
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useProject } from "../canvas/context.ts"
import { DesignIcon, designColor } from "../canvas/kinds.tsx"
import { clearConsole } from "../console-feed.ts"
import { byDesign, type ConsoleMessage, type Level, type Tally, tally, useConsole } from "../console-store.ts"
import { type ContainerEntry, useContainerEntries } from "../design-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { openSource } from "./code-editor.ts"
import { Hint } from "./Hint.tsx"
import { IconButton } from "./IconButton.tsx"
import { keymap } from "./keymap.ts"
import { panelLimits, setLayout, useLayout } from "./layout.ts"
import { Name } from "./Name.tsx"
import { PanelSectionTitle } from "./PanelSection.tsx"
import { revealSelection } from "./reveal.ts"

/** The levels the console filters by; debug messages go with info. */
type Shown = "error" | "warning" | "info"

const allLevels: readonly Shown[] = ["error", "warning", "info"]

/**
 * What the console shows: the levels turned on, any mix of them, and the words searched for. `focus` is the design a
 * board's badge or a Layers mark opened it on, whose group opens and comes into view with the others closed; `at` tells
 * one opening from the next.
 */
interface Filter {
  levels: readonly Shown[]
  focus?: { design: string; at: number } | undefined
  query: string
}

let filter: Filter = { levels: allLevels, query: "" }
let focusCount = 0
const listeners = new Set<() => void>()

function setFilter(change: Partial<Filter>): void {
  filter = { ...filter, ...change }

  for (const listener of listeners) {
    listener()
  }
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

/**
 * Opens the console. Given a design, as its badge on the canvas and a failing layer's mark in Layers do, it opens that
 * design's messages and brings them into view, closing the other designs', and shows every level.
 */
export function showConsole(design?: string): void {
  setFilter(design ? { focus: { design, at: ++focusCount }, levels: allLevels } : { focus: undefined })
  setLayout({ console: true })
}

/** Whether a message is at one of the levels shown. */
function levelShown(level: Level, levels: readonly Shown[]): boolean {
  return levels.includes(level === "debug" ? "info" : level)
}

/**
 * The console, docked under the canvas (PAR-147): what the project's designs wrote, grouped by design, worst first
 * within each, from the same log `parity console` gives agents, and the layers failing to draw (PAR-165). It filters by
 * level, any mix of them, and by words, and Clear empties the log for agents too. Each message says how often it came, the frames it came from, where in the project's
 * files it was written; an error opens to its stack.
 */
export function ConsolePanel() {
  const layout = useLayout()
  const session = useProject()
  const messages = useConsole(session.id)
  const shown = useFilter()

  if (!layout.console) {
    return null
  }

  const designs = byDesign(messages)
  const wanted = shown.query.trim().toLowerCase()

  const groups = designs
    .map((group) => ({
      ...group,
      shown: group.messages.filter(
        (message) => levelShown(message.level, shown.levels) && (!wanted || message.text.toLowerCase().includes(wanted))
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
      <ConsoleHeader session={session} messages={messages} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && <NothingLogged />}
        {messages.length > 0 && groups.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">No messages match.</p>
        )}
        {groups.map((group) => (
          <DesignGroup
            key={`${group.design ?? "project"}:${shown.focus?.at ?? 0}`}
            session={session}
            design={group.design}
            focus={shown.focus?.design}
            {...group}
          />
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
          Messages your designs log, and layers that fail to draw, show here.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function ConsoleHeader({ session, messages }: { session: ProjectSession; messages: readonly ConsoleMessage[] }) {
  const shown = useFilter()
  const counts = tally(messages)

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
      {/* The title sits in the header's row, so it drops the margin a section title keeps over its fields. */}
      <PanelSectionTitle title="Console" as="h2" spacing="" />
      <LevelsMenu counts={counts} levels={shown.levels} />
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
      <Counts errors={counts.errors} warnings={counts.warnings} />
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

const levelNames: Record<Shown, string> = { error: "Errors", warning: "Warnings", info: "Info" }

/** What the levels menu says it shows: every level, one, none or a mix, as Chrome's DevTools do. */
function levelsLabel(levels: readonly Shown[]): string {
  if (levels.length === allLevels.length) {
    return "All levels"
  }

  if (levels.length === 0) {
    return "No levels"
  }

  if (levels.length === 1) {
    return `${levelNames[levels[0]!]} only`
  }

  return "Custom levels"
}

/**
 * The levels shown, as a menu with a checkbox for each and its count, saying in its button what it shows. Any mix of
 * levels can show; a menu takes the space of one button where a toggle for each took three.
 */
function LevelsMenu({ counts, levels }: { counts: Tally; levels: readonly Shown[] }) {
  const icons: Record<Shown, ReactNode> = {
    error: <CircleX className="text-destructive" />,
    warning: <TriangleAlert className="text-amber-500" />,
    info: <Info className="text-muted-foreground" />
  }

  const count: Record<Shown, number> = { error: counts.errors, warning: counts.warnings, info: counts.info }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" aria-label="Levels shown" />}
      >
        {levelsLabel(levels)}
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {allLevels.map((level) => (
          <DropdownMenuCheckboxItem
            key={level}
            checked={levels.includes(level)}
            closeOnClick={false}
            onCheckedChange={(on) =>
              setFilter({ levels: allLevels.filter((each) => (each === level ? on : levels.includes(each))) })
            }
          >
            {icons[level]}
            {levelNames[level]}
            <span className="ml-auto text-muted-foreground tabular-nums">{count[level]}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A design's messages under its name, with its counts; the project's own last, named so. */
function DesignGroup({
  session,
  design,
  focus,
  messages,
  shown
}: {
  session: ProjectSession
  design: string | undefined
  /** The design the console was opened on: its group opens and comes into view, and the others start closed. */
  focus: string | undefined
  messages: ConsoleMessage[]
  shown: ConsoleMessage[]
}) {
  const entries = useContainerEntries(session.store)
  const entry = entries.find((candidate) => candidate.key === design)
  const focused = focus !== undefined && focus === design
  const [open, setOpen] = useState(focus === undefined || focused)
  const section = useRef<HTMLElement>(null)
  useEffect(() => {
    if (focused) {
      section.current?.scrollIntoView({ block: "start" })
    }
  }, [focused])
  const counts = tally(messages)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<section ref={section} aria-label={designName(entries, design)} />}
    >
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
          <Name>{designName(entries, design)}</Name>
        </CollapsibleTrigger>
        <Counts errors={counts.errors} warnings={counts.warnings} />
        <span className="flex-1" />
        {!entry && <span className="text-xs text-muted-foreground">Written outside any design</span>}
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
 * One message: its level, its text, how often it came, the frames it came from and where it was written. One with a
 * stack opens to show it, each call in the project's files a link to its line.
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
    const stateName = entry?.container.states?.find((candidate) => candidate.id === state)?.name ?? state
    const modeName = resolveModes(session.store.getModes()).find((candidate) => candidate.id === mode)?.name ?? mode

    return entry && (entry.container.states?.length ?? 0) > 1 ? `${stateName} in ${modeName}` : modeName
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
          {message.failure ? (
            <div className="min-w-0 flex-1 type-message">
              <p className={look.text}>
                <span className="font-medium">{message.failure.component} fails to draw.</span> {message.failure.reason}{" "}
                {message.failure.fix}
              </p>
              <p className="type-code font-mono break-words whitespace-pre-wrap text-muted-foreground select-text">
                {message.text}
              </p>
            </div>
          ) : (
            <p
              className={`min-w-0 flex-1 type-code font-mono break-words whitespace-pre-wrap ${look.text} ${
                open ? "" : "line-clamp-2"
              }`}
            >
              {message.text}
            </p>
          )}
          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
            {message.failure && entry && (
              <Button
                variant="outline"
                size="xs"
                className="h-5"
                onClick={() => {
                  session.selection.set({ design: entry.key, node: message.failure!.nodeId })
                  revealSelection(session)
                }}
              >
                Select layer
              </Button>
            )}
            {message.count > 1 && (
              <Hint label={`Logged ${message.count} times`} wait>
                <Badge variant="secondary" className="h-4 min-w-5 px-1.5 text-2xs tabular-nums">
                  {message.count}
                </Badge>
              </Hint>
            )}
            {frames.slice(0, 2).map((frame) => (
              <span
                key={`${frame.state}:${frame.mode}`}
                className="rounded-sm bg-foreground/[0.07] px-1.5 py-px text-2xs text-muted-foreground"
              >
                {frameName(frame)}
              </span>
            ))}
            {frames.length > 2 && (
              <Hint label={frames.slice(2).map(frameName).join(", ")} wait>
                <span className="rounded-sm bg-foreground/[0.07] px-1.5 py-px text-2xs text-muted-foreground">
                  +{frames.length - 2}
                </span>
              </Hint>
            )}
            {message.at && (
              <Hint label={`Open ${message.at.path} at line ${message.at.line}`} wait>
                <button
                  type="button"
                  className="font-mono text-2xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => void openSource(session, message.at!)}
                >
                  {`${message.at.path.split("/").at(-1)}:${message.at.line}`}
                </button>
              </Hint>
            )}
          </div>
        </div>
        <CollapsibleContent>
          <ol className="pb-2 pl-14 type-code font-mono text-muted-foreground">
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
    <span className="flex shrink-0 items-center gap-2 text-2xs text-muted-foreground tabular-nums">
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

/**
 * The console's top edge: drag it to make the console taller or shorter, or focus it and use the arrows. The console's
 * error fallback has it too (PAR-667).
 */
export function ResizeTop({ height }: { height: number }) {
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

          if (event.key === "ArrowUp") {
            resize(height + step)
          } else if (event.key === "ArrowDown") {
            resize(height - step)
          } else {
            return
          }

          event.preventDefault()
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return
          }

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
  if (!design) {
    return "Project"
  }

  return entries.find((entry) => entry.key === design)?.container.name ?? "A deleted design"
}
