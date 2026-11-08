import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@buildkitgg/shadcn-baseui-kit"
import { CircleAlert, RotateCcw, RotateCw, TriangleAlert, X } from "lucide-react"
import { Component, type CSSProperties, type ErrorInfo, type ReactNode, type Ref, useRef } from "react"
import parityIcon from "../../../../../brand/parity-icon.svg?url"
import { ErrorDetails } from "../ProjectStatus.tsx"
import { CopyButton } from "./Copy.tsx"
import { IconButton } from "./IconButton.tsx"
import { PanelSectionTitle } from "./PanelSection.tsx"

/**
 * How a part of the window shows that it failed, by the room it has:
 * - `page`: all of a tab, such as a project or Home. Says so as a page, as a project that couldn't open does.
 * - `region`: a panel's tab, a panel or the canvas. Says so in its place.
 * - `docked`: a panel docked under the canvas, such as the console. Keeps its header, and says so under it.
 * - `strip`: a bar one line tall, such as the status bar. Says so in a line.
 * - `dialog`: a dialog. Says so in a dialog of its own, which can try again or close the one that failed.
 * - `silent`: something drawn over other parts, such as the canvas's outlines. Shows nothing; only the report goes.
 * - `window`: the last resort, around the whole window. A page, with a strip to move the window by.
 */
export type BoundaryKind = "page" | "region" | "docked" | "strip" | "dialog" | "silent" | "window"

export interface BoundaryProps {
  /** Names the boundary in the Sentry tag `boundary`, such as `inspector.design` (PAR-667). */
  name: string
  /** What people call the part, as it's titled in the window: "Layers", "Status bar". */
  label: string
  kind?: BoundaryKind
  /** Closes the dialog or hides the panel that failed, so it stays closed once the boundary draws it again. */
  onClose?: () => void
  /** What closing a docked panel is called, as its own close button is: "Close the console". */
  closeLabel?: string
  /** The next step when trying again fails, saving first: reopening the project, or reloading the window. */
  onReopen?: () => void
  /** What that step is called. */
  reopenLabel?: "Reopen project" | "Reload window"
  /** Hides the fallback, as for a tab that isn't showing. */
  hidden?: boolean
  /** Sizes the fallback where the part sized itself, such as a panel's width or a bar's height. */
  className?: string
  /** Sizes the fallback where the part's size is set as it runs, such as the console's height. */
  style?: CSSProperties
  /** Drawn along a docked panel's edge, as the panel draws it: the console's resize handle. */
  edge?: ReactNode
  children: ReactNode
}

interface BoundaryState {
  error: unknown
  failed: boolean
  /** How many times trying again has failed since it last worked. */
  retries: number
}

/** Opens Report a problem with what a boundary caught, once Help > Report a problem is there to open (PAR-635). */
type Reporter = (error: unknown, boundary: string) => void
let reporter: Reporter | undefined

/** Gives every boundary's fallback a Report a problem button, which calls `report`. Undefined takes it away. */
export function setBoundaryReporter(report: Reporter | undefined): void {
  reporter = report
}

/** Boundaries tripped by a test or a story, by name, with how many more times each throws (PAR-667). */
const tripped = new Map<string, number>()

/**
 * Makes the named boundary's part throw as it next draws, `times` times in a row, so tests and stories can show a
 * failure without a real bug. It throws from inside the boundary, where the part's own code would.
 */
export function tripBoundary(name: string, times = 1): void {
  tripped.set(name, times)
}

function Tripwire({ name }: { name: string }) {
  if ((tripped.get(name) ?? 0) > 0) throw new Error(`The ${name} boundary was tripped on purpose`)
  return null
}

/**
 * Keeps a render error in one part of the window, the canvas, a panel or a dialog, so the rest keeps working (PAR-667).
 * The root's `onCaughtError` reports what it catches, tagged with its name. Trying again draws the part afresh; the
 * project's edits live outside it, so nothing is lost.
 */
export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: undefined, failed: false, retries: 0 }

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error, failed: true }
  }

  override componentDidCatch(_error: unknown, _info: ErrorInfo): void {
    const left = tripped.get(this.props.name)
    if (left !== undefined) {
      if (left <= 1) tripped.delete(this.props.name)
      else tripped.set(this.props.name, left - 1)
    }
  }

  override componentDidUpdate(_props: BoundaryProps, previous: BoundaryState): void {
    // A try that drew without failing starts the count again.
    if (previous.failed && !this.state.failed && this.state.retries > 0) {
      queueMicrotask(() => {
        if (!this.state.failed) this.setState({ retries: 0 })
      })
    }
  }

  private readonly retry = () =>
    this.setState(({ retries }) => ({ error: undefined, failed: false, retries: retries + 1 }))

  private readonly close = () => {
    this.props.onClose?.()
    this.setState({ error: undefined, failed: false, retries: 0 })
  }

  /** Opens Report a problem; a dialog that failed closes first, so the report's dialog takes its place. */
  private report(report: Reporter, error: unknown, name: string, kind: BoundaryKind): void {
    if (kind === "dialog") this.close()
    report(error, name)
  }

  override render() {
    const { name, kind = "region", children, ...shown } = this.props
    const report = reporter
    const { error, failed, retries } = this.state
    if (!failed) {
      return (
        <>
          <Tripwire name={name} />
          {children}
        </>
      )
    }
    if (kind === "silent") return null
    return (
      <ErrorFallback
        {...shown}
        kind={kind}
        error={error}
        again={retries > 0}
        onRetry={this.retry}
        onClose={this.props.onClose ? this.close : undefined}
        onReport={report ? () => this.report(report, error, name, kind) : undefined}
      />
    )
  }
}

interface FallbackProps {
  label: string
  kind: Exclude<BoundaryKind, "silent">
  error: unknown
  /** Whether trying again has already failed. */
  again?: boolean
  onRetry: () => void
  onClose?: () => void
  closeLabel?: string
  onReopen?: () => void
  reopenLabel?: "Reopen project" | "Reload window"
  onReport?: () => void
  hidden?: boolean
  className?: string
  style?: CSSProperties
  edge?: ReactNode
}

/**
 * What a boundary shows in place of the part that failed: what stopped, that nothing else did and nothing was lost,
 * and a way on. A failed retry offers the next step, reopening the project or reloading the window. Each kind of place
 * has a design of its own, after what that place already shows when it's empty or can't open.
 */
export function ErrorFallback(props: FallbackProps) {
  const { kind } = props
  if (kind === "strip") return <StripFallback {...props} />
  if (kind === "docked") return <ConsoleFallback {...props} />
  if (kind === "dialog") return <DialogFallback {...props} />
  if (kind === "page") return <TabFallback {...props} />
  if (kind === "window") return <WindowFallback {...props} />
  return <PanelFallback {...props} />
}

function title(label: string, again?: boolean): string {
  return `${label} stopped working${again ? " again" : ""}`
}

/** The way on: Try again, or once that has failed, the step after it. */
function wayOn({ again, onReopen, reopenLabel = "Reopen project" }: FallbackProps): string {
  return again && onReopen ? reopenLabel : "Try again"
}

/** The stack, which starts with the message, or what was thrown, for Copy details and reports. */
function errorText(error: unknown): string {
  return error instanceof Error && error.stack ? error.stack : String(error)
}

/**
 * A panel's tab, a whole panel or the canvas, after the Inspector's own empty state: a mark, a line on what stopped,
 * one on what to do, and Try again, with Report a problem and Copy details quieter under it. Nothing opens or grows,
 * so nothing moves.
 */
function PanelFallback(props: FallbackProps) {
  const { label, error, again, onReopen, onReport, hidden, className } = props
  const reopen = again && onReopen
  return (
    <div
      role="alert"
      hidden={hidden}
      className={`flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto px-6 py-12 text-center ${className ?? ""}`}
    >
      <TriangleAlert className="size-5 text-destructive" />
      <div className="flex max-w-64 flex-col gap-1">
        <p className="text-sm font-medium">{title(label, again)}</p>
        <p className="type-description text-muted-foreground">
          {reopen
            ? "Reopening the project may fix it. Your changes are saved first."
            : "Your changes are kept, and the rest of the window still works."}
        </p>
      </div>
      <Button size="sm" onClick={reopen ? onReopen : props.onRetry}>
        {!reopen && <RotateCcw />}
        {wayOn(props)}
      </Button>
      <div className="flex flex-wrap justify-center gap-1">
        {onReport && (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onReport}>
            Report a problem
          </Button>
        )}
        <CopyButton text={errorText(error)} label="Copy the error's details" className="text-muted-foreground">
          Copy details
        </CopyButton>
      </div>
    </div>
  )
}

/**
 * The console, docked under the canvas: its own header, with the error's details to copy and the close button where
 * the console has its buttons, then its message where "Nothing logged" would be.
 */
function ConsoleFallback(props: FallbackProps) {
  const { label, error, again, onClose, closeLabel, hidden, className, style, edge } = props
  const reopen = again && props.onReopen
  return (
    <section
      hidden={hidden}
      style={style}
      aria-label={label}
      className={`relative flex min-h-0 flex-col ${className ?? ""}`}
    >
      {edge}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
        {/* As the console's: the title sits in the header's row, without a section title's margin over its fields. */}
        <PanelSectionTitle title={label} as="h2" spacing="" />
        <span className="flex-1" />
        <CopyButton text={errorText(error)} label="Copy the error's details" />
        {onClose && (
          <IconButton label={closeLabel ?? "Close"} onClick={onClose}>
            <X />
          </IconButton>
        )}
      </div>
      <div
        role="alert"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-4 text-center"
      >
        <div className="flex flex-col items-center gap-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlert className="size-4 text-destructive" />
            {title(label, again)}
          </p>
          <p className="type-description text-muted-foreground">
            {reopen
              ? "Reopening the project may fix it. Your changes are saved first."
              : "Your designs' messages are still kept, and the rest of the window still works."}
          </p>
        </div>
        <Actions {...props} onClose={undefined} className="justify-center" />
      </div>
    </section>
  )
}

/**
 * All of a tab, such as a project or Home, as the page for a project that couldn't open: what stopped, what to do,
 * the error in full to read or copy, and the buttons, the way on first.
 */
function TabFallback(props: FallbackProps) {
  const { label, error, again, onReopen, onReport, hidden, className } = props
  const reopen = again && onReopen
  let description = "Your changes are kept. Try again to draw it afresh."
  if (onReopen) description = "Your changes are kept. Try again, and if it happens again, reopen the project."
  if (reopen) description = "Reopening the project may fix it. Your changes are saved first."
  return (
    <div hidden={hidden} className={`flex min-h-0 flex-1 overflow-y-auto p-6 ${className ?? ""}`}>
      <div role="alert" className="m-auto flex w-full max-w-2xl flex-col gap-5">
        <span className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">{title(label, again)}</h1>
          <p className="type-body text-muted-foreground">{description}</p>
        </div>
        <ErrorDetails message={errorText(error)} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={reopen ? onReopen : props.onRetry}>
            {!reopen && <RotateCw />}
            {wayOn(props)}
          </Button>
          {onReport && (
            <Button variant="outline" onClick={onReport}>
              Report a problem
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The whole window, when nothing closer caught the error: Parity's own mark in the middle of an empty window, with a
 * strip along the top to move the window by, since its title bar went with it. The details are there to copy, not
 * read, since there's nothing around them to make sense of.
 */
function WindowFallback(props: FallbackProps) {
  const { error, again, onReopen, onReport } = props
  const reload = again && onReopen
  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <div className="h-10 shrink-0 [-webkit-app-region:drag]" />
      <div
        role="alert"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-10 text-center"
      >
        <img src={parityIcon} alt="" className="size-14" />
        <div className="flex max-w-md flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title("Parity", again)}</h1>
          <p className="type-body text-muted-foreground">
            {reload
              ? "Reloading the window may fix it. Your changes are saved first."
              : "Your changes are still open. Try again, and if it happens again, reload the window."}
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button onClick={reload ? onReopen : props.onRetry}>
            {!reload && <RotateCw />}
            {wayOn({ ...props, reopenLabel: "Reload window" })}
          </Button>
          <div className="flex flex-wrap justify-center gap-1">
            {onReport && (
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onReport}>
                Report a problem
              </Button>
            )}
            <CopyButton text={errorText(error)} label="Copy the error's details" className="text-muted-foreground">
              Copy details
            </CopyButton>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * A fallback's buttons, in the same order wherever they are: Report a problem, then closing, then the way on last,
 * where a dialog's main button goes. The way on is Try again, or once that has failed, the step after it. It's the one
 * filled button; the others are outlined, and in a one-line bar all of them are.
 */
function Actions(
  props: FallbackProps & {
    size?: "xs" | "sm" | "default"
    className?: string
    primary?: Ref<HTMLButtonElement>
    /** Puts Report a problem at the far left, apart from the rest, as in a dialog's footer. */
    reportApart?: boolean
  }
) {
  const { again, onRetry, onReopen, reopenLabel = "Reopen project", onReport, onClose, closeLabel, kind } = props
  const { size = "sm", className, primary, reportApart } = props
  const reopen = again && onReopen
  const strip = kind === "strip"
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      {onReport && (
        <Button size={size} variant="outline" className={reportApart ? "sm:mr-auto" : undefined} onClick={onReport}>
          Report a problem
        </Button>
      )}
      {onClose && (
        <Button size={size} variant="outline" onClick={onClose}>
          {closeLabel ?? "Close"}
        </Button>
      )}
      {reopen ? (
        <Button ref={primary} size={size} variant={strip ? "outline" : "default"} onClick={onReopen}>
          {reopenLabel}
        </Button>
      ) : (
        <Button ref={primary} size={size} variant={strip ? "outline" : "default"} onClick={onRetry}>
          {!strip && <RotateCcw />}
          Try again
        </Button>
      )}
    </div>
  )
}

function StripFallback(props: FallbackProps) {
  const { label, again, hidden, className } = props
  return (
    <div
      role="alert"
      hidden={hidden}
      className={`flex min-w-0 items-center gap-2 px-2 text-xs text-muted-foreground ${className ?? ""}`}
    >
      <CircleAlert className="size-3.5 shrink-0 text-destructive" />
      <span className="truncate">{title(label, again)}</span>
      <Actions {...props} size="xs" />
    </div>
  )
}

function DialogFallback(props: FallbackProps) {
  const { label, error, again, onClose } = props
  // The way on has the keyboard, as a dialog's main button does.
  const primary = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent role="alertdialog" className="sm:max-w-md" initialFocus={primary}>
        <DialogHeader>
          <DialogTitle>{title(label, again)}</DialogTitle>
          <DialogDescription>The rest of Parity still works. Try again, or close this dialog.</DialogDescription>
        </DialogHeader>
        <Thrown error={error} />
        <DialogFooter>
          {/* The dialog's corner button closes it, so the footer doesn't repeat that. */}
          <Actions {...props} onClose={undefined} size="default" className="w-full" primary={primary} reportApart />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** What was thrown, in a box of a fixed height that scrolls, so the dialog never changes size. It copies whole. */
function Thrown({ error }: { error: unknown }) {
  const text = errorText(error)
  return (
    <div className="relative min-w-0">
      {/* Long addresses in a stack can't wrap at a space, so they break anywhere rather than widening the dialog. */}
      <pre className="h-20 overflow-y-auto rounded-md bg-muted p-2.5 pr-10 type-code font-mono wrap-anywhere whitespace-pre-wrap text-muted-foreground select-text">
        {text}
      </pre>
      <CopyButton text={text} label="Copy the error's details" className="absolute top-1 right-1" />
    </div>
  )
}
