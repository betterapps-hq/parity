import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Tabs,
  TabsList,
  TabsTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { Ban, ChevronRight, CircleX, Info, RotateCw, ScrollText, TriangleAlert, X } from "lucide-react"
import { type ReactNode, useState } from "react"
import type { ExtensionStatus, LogLine } from "../../shared/protocol.ts"
import { extensionsOf, type ProjectExtensions, restartExtension, useExtensions } from "../extensions.ts"
import type { ProjectSession } from "../workspace.ts"
import { ExtensionLogo } from "./ExtensionIcons.tsx"
import { IconButton } from "./IconButton.tsx"
import { setLayout, useLayout } from "./layout.ts"

/*
 * The bottom panel's tabs (PAR-1089): the console first, then a tab for each extension with something in its log, or
 * whose host crashed or got stuck. An extension's tab shows its log, newest last, and its host's state with Restart.
 */

type Session = Pick<ProjectSession, "id" | "untilClosed">

/** The extensions with a tab: those that logged something, or whose host is in trouble. */
function withTabs({ extensions, logs }: ProjectExtensions): ExtensionStatus[] {
  return extensions.filter(
    (extension) => (logs[extension.id]?.length ?? 0) > 0 || extension.state === "crashed" || extension.state === "stuck"
  )
}

/** The bottom panel's tab that shows: the one chosen, unless its extension has no tab now, then the console. */
export function useBottomTab(session: Session): ExtensionStatus | undefined {
  const { bottomTab } = useLayout()
  const tabs = withTabs(useExtensions(session))

  return tabs.find((extension) => extension.id === bottomTab)
}

/**
 * The tabs at the start of the bottom panel's header, or the console's title alone while no extension has a tab, so
 * the panel looks as it did before extensions.
 */
export function BottomTabs({ session, title }: { session: Session; title: ReactNode }) {
  const tabs = withTabs(useExtensions(session))
  const shown = useBottomTab(session)

  if (tabs.length === 0) {
    return title
  }

  return (
    <Tabs value={shown?.id ?? "console"} onValueChange={(value: string) => setLayout({ bottomTab: value })}>
      <TabsList className="h-7 min-w-0 bg-transparent p-0" aria-label="Bottom panel">
        <TabsTrigger value="console" className="flex-none text-xs">
          Console
        </TabsTrigger>
        {tabs.map((extension) => (
          <TabsTrigger key={extension.id} value={extension.id} className="flex-none text-xs">
            <ExtensionLogo icon={extension.icon} className="size-3.5 shrink-0" />
            {extension.displayName}
            {(extension.state === "crashed" || extension.state === "stuck") && (
              <TriangleAlert className="size-3 shrink-0 text-amber-500" aria-label={stateWords[extension.state]} />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

const stateWords: Record<ExtensionStatus["state"], string> = {
  waiting: "Not started",
  starting: "Starting",
  running: "Running",
  stuck: "Not answering",
  crashed: "Stopped"
}

/** An extension's log, under the bottom panel's tabs, with its host's state and Restart. */
export function ExtensionLog({ session, extension }: { session: Session; extension: ExtensionStatus }) {
  const lines = useExtensions(session).logs[extension.id] ?? []
  const trouble = extension.state === "crashed" || extension.state === "stuck"

  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
        <BottomTabs session={session} title={null} />
        <span className="flex-1" />
        <span className={`text-xs ${trouble ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>
          {stateWords[extension.state]}
        </span>
        {trouble ? (
          <Button variant="outline" size="xs" onClick={() => restartExtension(session, extension.id)}>
            <RotateCw /> Restart
          </Button>
        ) : (
          <IconButton
            label={`Restart ${extension.displayName}`}
            onClick={() => restartExtension(session, extension.id)}
          >
            <RotateCw />
          </IconButton>
        )}
        <IconButton label="Clear the log" onClick={() => extensionsOf(session).clear(extension.id)}>
          <Ban />
        </IconButton>
        <IconButton label="Close the panel" shortcut="console" onClick={() => setLayout({ console: false })}>
          <X />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {trouble && extension.reason && (
          <p className="border-b bg-amber-500/[0.07] px-3 py-2 type-message text-amber-700 dark:text-amber-300">
            {extension.reason}
          </p>
        )}
        {lines.length === 0 ? (
          <Empty className="h-full border-0 py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScrollText />
              </EmptyMedia>
              <EmptyTitle className="text-sm">Nothing logged</EmptyTitle>
              <EmptyDescription className="text-xs">What {extension.displayName} logs shows here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ol aria-label={`${extension.displayName} log`}>
            {lines.map((line, index) => (
              <LineRow key={`${line.at}:${index}`} line={line} />
            ))}
          </ol>
        )}
      </div>
    </>
  )
}

const levelLook: Record<LogLine["level"], { icon: ReactNode; row: string; text: string; label: string }> = {
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
  info: { icon: <Info className="size-3.5 text-muted-foreground" />, row: "", text: "", label: "Info" }
}

/** A line: when it was written, its level and its text. An error's stack opens under it. */
function LineRow({ line }: { line: LogLine }) {
  const look = levelLook[line.level]
  const [open, setOpen] = useState(false)
  const time = new Date(line.at).toLocaleTimeString(undefined, { hour12: false })

  return (
    <li className={`border-b border-border/60 ${look.row}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start gap-2 py-1.5 pr-3 pl-2">
          {line.stack ? (
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
          <time className="mt-px shrink-0 font-mono text-2xs text-muted-foreground tabular-nums">{time}</time>
          <p className={`min-w-0 flex-1 type-code font-mono break-words whitespace-pre-wrap select-text ${look.text}`}>
            {line.text}
          </p>
        </div>
        {line.stack && (
          <CollapsibleContent>
            <pre className="pb-2 pl-14 type-code font-mono whitespace-pre-wrap text-muted-foreground select-text">
              {line.stack}
            </pre>
          </CollapsibleContent>
        )}
      </Collapsible>
    </li>
  )
}
