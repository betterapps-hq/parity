import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronLeft, Ellipsis, ExternalLink, Plus, Telescope } from "lucide-react"
import type { DragEvent, ReactNode } from "react"
import { SearchField } from "../../chrome/AssetsPanel.tsx"
import { IconButton } from "../../chrome/IconButton.tsx"
import { type Platform, type Reference, type ReferenceKind, references, search, type Shot } from "./data.ts"
import { ShotDrawing } from "./shots.tsx"

/*
 * The References tab: Mobbin's screens, flows and sections, searched in plain words, as a grid that fits the panel.
 * Results drag onto the canvas, or Place on canvas puts them beside what's selected. A flow opens in place, its steps
 * in order.
 */

/** Where the person's Mobbin account is. */
export type Account = "disconnected" | "connecting" | "connected" | "no-plan"

/** What a search is doing: showing results, waiting on Mobbin, or turned away by Mobbin's limit. */
export type SearchStatus = "ready" | "searching" | "limited"

/** A reference, or one step of a flow, as the canvas places it. */
export interface Placing {
  reference: Reference
  /** The flow's step, when one step is placed by itself. */
  step?: number
}

/** The drag's type, so the canvas takes only references. */
export const referenceMime = "application/x-parity-reference"

export interface ReferencesState {
  account: Account
  query: string
  kind: ReferenceKind
  platform: Platform
  status: SearchStatus
  /** The flow open in place of the results. */
  flow?: string
}

export interface ReferencesActions {
  connect: () => void
  cancel: () => void
  disconnect: () => void
  change: (changes: Partial<ReferencesState>) => void
  place: (placing: Placing | Placing[]) => void
  open: (reference: Reference) => void
}

export function ReferencesPanel({ state, actions }: { state: ReferencesState; actions: ReferencesActions }) {
  if (state.account === "disconnected") {
    return <NotConnected onConnect={actions.connect} />
  }

  if (state.account === "connecting") {
    return <Connecting onCancel={actions.cancel} />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SearchField
        value={state.query}
        onChange={(query) => actions.change({ query, flow: undefined })}
        placeholder="Search Mobbin"
      />
      <Filters state={state} actions={actions} />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <Body state={state} actions={actions} />
      </div>
      <Footer onDisconnect={actions.disconnect} />
    </div>
  )
}

function Filters({ state, actions }: { state: ReferencesState; actions: ReferencesActions }) {
  const kinds: { value: ReferenceKind; label: string }[] = [
    { value: "screens", label: "Screens" },
    { value: "flows", label: "Flows" },
    { value: "sections", label: "Sections" }
  ]

  const platforms: { value: Platform; label: string }[] = [
    { value: "web", label: "Web" },
    { value: "ios", label: "iOS" }
  ]

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2">
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[state.kind]}
        onValueChange={([value]) => {
          const kind = kinds.find((each) => each.value === value)?.value

          if (kind === "sections") {
            actions.change({ kind, flow: undefined, platform: "web" })
          } else if (kind) {
            actions.change({ kind, flow: undefined })
          }
        }}
        aria-label="What to find"
      >
        {kinds.map(({ value, label }) => (
          <ToggleGroupItem key={value} value={value} className="h-6 px-2 text-xs">
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[state.platform]}
        onValueChange={([value]) => {
          const platform = platforms.find((each) => each.value === value)?.value

          if (platform) {
            actions.change({ platform, flow: undefined })
          }
        }}
        aria-label="Platform"
      >
        {platforms.map(({ value, label }) => (
          <ToggleGroupItem
            key={value}
            value={value}
            disabled={value === "ios" && state.kind === "sections"}
            className="h-6 px-2 text-xs"
          >
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function Body({ state, actions }: { state: ReferencesState; actions: ReferencesActions }) {
  if (state.account === "no-plan") {
    return (
      <Message
        title="Your Mobbin plan doesn't include searching from Parity"
        action={
          <Button size="sm" variant="outline" onClick={() => actions.open(references[0]!)}>
            <ExternalLink /> See Mobbin plans
          </Button>
        }
      >
        It needs Mobbin Pro, Team or Enterprise.
      </Message>
    )
  }

  if (state.status === "limited") {
    return (
      <Message title="Too many searches for now">
        Mobbin allows 60 searches a minute, your agents&apos; included. Try again in 30 seconds.
      </Message>
    )
  }

  if (state.status === "searching") {
    return (
      <output className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
        <Spinner aria-hidden className="size-3.5" /> Searching Mobbin
      </output>
    )
  }

  const flow = state.flow ? references.find((each) => each.id === state.flow) : undefined

  if (flow?.steps) {
    return <FlowSteps flow={flow} actions={actions} />
  }

  const results = search(state.query, state.kind, state.platform)

  if (results.length === 0) {
    return <Message title={`Nothing on Mobbin matches “${state.query}”`}>Try fewer words or another platform.</Message>
  }

  return (
    <ul aria-label="Results" className={`grid gap-2 ${columns(state.platform)}`}>
      {results.map((reference) => (
        <li key={reference.id}>
          <ResultCard reference={reference} actions={actions} />
        </li>
      ))}
    </ul>
  )
}

function columns(platform: Platform): string {
  return platform === "ios" ? "grid-cols-[repeat(auto-fill,minmax(96px,1fr))]" : "grid-cols-1"
}

function startDrag(event: DragEvent, placing: Placing) {
  event.dataTransfer.setData(referenceMime, JSON.stringify({ id: placing.reference.id, step: placing.step }))
  event.dataTransfer.effectAllowed = "copy"
}

function aspect(shot: Shot, reference: Reference): string {
  if (shot.platform === "ios") {
    return "aspect-[390/844]"
  }

  return reference.kind === "sections" ? "aspect-[1440/560]" : "aspect-[16/10]"
}

function Thumb({ shot, reference }: { shot: Shot; reference: Reference }) {
  return (
    <div className={`relative w-full overflow-hidden rounded-md border ${aspect(shot, reference)}`}>
      <ShotDrawing shot={shot} hue={reference.hue} dark={reference.dark} />
    </div>
  )
}

/**
 * One result: its picture and its app's name. A screen or section places on a click; a flow opens its steps. Hovering
 * or focusing it shows Place on canvas and Open in Mobbin, and it drags onto the canvas.
 */
function ResultCard({ reference, actions }: { reference: Reference; actions: ReferencesActions }) {
  const flow = reference.kind === "flows"
  const steps = reference.steps?.length ?? 0
  const label = flow ? `${reference.app}'s flow, ${steps} steps` : reference.app

  return (
    <div className="group relative flex flex-col gap-1">
      <button
        type="button"
        draggable
        onDragStart={(event) => startDrag(event, { reference })}
        onClick={() => (flow ? actions.change({ flow: reference.id }) : actions.place({ reference }))}
        aria-label={flow ? `Open ${label}` : `Place ${label} on canvas`}
        className="cursor-grab rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing"
      >
        <Thumb shot={reference.shot} reference={reference} />
      </button>
      <div className="flex min-w-0 items-center justify-between gap-1 text-xs">
        <span className="truncate text-foreground">{reference.app}</span>
        {flow && <span className="shrink-0 text-muted-foreground tabular-nums">{steps} steps</span>}
      </div>
      <div className="absolute top-1 right-1 flex gap-0.5 rounded-md bg-background/90 opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <IconButton
          label={flow ? "Place all steps on canvas" : "Place on canvas"}
          onClick={() => actions.place(flow ? flowSteps(reference) : { reference })}
        >
          <Plus />
        </IconButton>
        <IconButton label="Open in Mobbin" onClick={() => actions.open(reference)}>
          <ExternalLink />
        </IconButton>
      </div>
    </div>
  )
}

function flowSteps(reference: Reference): Placing[] {
  return (reference.steps ?? []).map((_, step) => ({ reference, step }))
}

/** A flow open in place of the results: its steps in order, each placeable by itself, or all of them in a row. */
function FlowSteps({ flow, actions }: { flow: Reference; actions: ReferencesActions }) {
  const steps = flow.steps ?? []

  return (
    <section aria-label={`${flow.app}'s flow`} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-7 px-2 text-xs"
          onClick={() => actions.change({ flow: undefined })}
        >
          <ChevronLeft /> Back to results
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => actions.place(flowSteps(flow))}>
          <Plus /> Place all
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{flow.app}</span>, {steps.length} steps
      </p>
      <ol aria-label="Steps" className={`grid gap-2 ${columns(flow.platform)}`}>
        {steps.map((step, index) => (
          <li key={step.caption} className="flex flex-col gap-1">
            <button
              type="button"
              draggable
              onDragStart={(event) => startDrag(event, { reference: flow, step: index })}
              onClick={() => actions.place({ reference: flow, step: index })}
              aria-label={`Place step ${index + 1}, ${step.caption}, on canvas`}
              className="cursor-grab rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing"
            >
              <Thumb shot={step.shot} reference={flow} />
            </button>
            <span className="text-xs">
              <span className="text-muted-foreground tabular-nums">{index + 1}</span> {step.caption}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** The source, always named, and the account's menu. */
function Footer({ onDisconnect }: { onDisconnect: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t px-3 py-1.5 text-xs text-muted-foreground">
      <span>From Mobbin</span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Mobbin account" />}>
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onDisconnect}>Disconnect Mobbin</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function Message({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="type-empty flex flex-col items-center gap-2 px-4 py-10 text-center text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-xs">{children}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

function NotConnected({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="type-empty flex flex-col items-center gap-3 px-6 py-10 text-center text-muted-foreground">
      <Telescope className="size-6" />
      <p className="font-medium text-foreground">Find references from real apps</p>
      <p>
        Search screens, flows and sections on Mobbin, and place them beside your designs. They stay out of your designs
        and code.
      </p>
      <Button size="sm" onClick={onConnect}>
        Connect Mobbin
      </Button>
      <p className="text-xs">Needs Mobbin Pro, Team or Enterprise.</p>
    </div>
  )
}

function Connecting({ onCancel }: { onCancel: () => void }) {
  return (
    <output className="type-empty flex flex-col items-center gap-3 px-6 py-10 text-center text-muted-foreground">
      <Spinner aria-hidden className="size-5" />
      <p className="font-medium text-foreground">Finish connecting in your browser</p>
      <p>Sign in to Mobbin there and allow Parity. This tab updates when you&apos;re done.</p>
      <Button size="sm" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </output>
  )
}
