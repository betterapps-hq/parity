import { Eye, Layers, LocateFixed, MonitorPlay, RefreshCw, WifiOff } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { PresenceEvent } from "../../../shared/protocol.ts"
import { type AgentPalette, agentPalettes } from "../../agent/agent-colors.ts"
import { ActionIcon, AgentBadge, AgentPointer } from "../../agent/AgentPointer.tsx"
import { me, people, type Person } from "../explore-data.ts"
import { Avatar } from "../parts.tsx"

/**
 * Everyone on the canvas wears one of the agents' palettes, so people and agents are told apart by name and badge, not
 * by a second color system. Each person keeps theirs from session to session.
 */
const palettes = new Map<Person, number>([
  [people.maya, 0],
  [people.jonas, 2],
  [people.priya, 4],
  [people.sam, 6],
  [people.claude, 7],
  [me, 8],
  [people.cursor, 9],
  [people.lena, 10]
])

export function paletteOf(person: Person): AgentPalette {
  return agentPalettes[palettes.get(person) ?? 11]!
}

/** Someone in the project right now: where they are, what they're doing, and whether they've stepped away. */
export interface Here {
  person: Person
  /** The design and frame they're looking at. */
  where: string
  /** What they're doing there: the layer they're editing, or an agent's call. */
  doing?: string
  kind?: PresenceEvent["kind"]
  /** How long they've been away, when they have. */
  away?: string
}

/** Someone's avatar ringed in their color, faded while they're away. Following them adds an eye. */
export function PresenceAvatar({ here, size = 26, following }: { here: Here; size?: number; following?: boolean }) {
  const color = paletteOf(here.person).color
  return (
    <span
      className="relative inline-flex rounded-full"
      style={{ boxShadow: `0 0 0 ${following ? 2.5 : 1.5}px ${color}` }}
    >
      <Avatar person={here.person} size={size} className={`ring-2 ring-[#0a0a0a] ${here.away ? "opacity-45" : ""}`} />
      {following && (
        <span
          className="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full ring-2 ring-[#0a0a0a]"
          style={{ background: color, color: paletteOf(here.person).ink }}
        >
          <Eye className="size-2.5" strokeWidth={2.5} />
        </span>
      )}
    </span>
  )
}

/** Who someone is, where they are and what they're doing, with Follow and Go to. Opens from their avatar. */
export function PresenceCard({ here, following }: { here: Here; following?: boolean }) {
  const palette = paletteOf(here.person)
  return (
    <div className="flex w-72 flex-col gap-3 text-popover-foreground">
      <div className="flex items-center gap-3">
        <Avatar person={here.person} size={36} className={here.away ? "opacity-60" : ""} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{here.person.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {here.away ? `Away for ${here.away}` : here.person.agent ? "Agent, connected through MCP" : "Editor"}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Layers className="size-3.5 shrink-0" />
          <span className="truncate">{here.where}</span>
        </span>
        {here.doing && (
          <span className="flex items-center gap-2">
            <span
              className="grid size-3.5 shrink-0 place-items-center rounded-full"
              style={{ background: palette.color, color: palette.ink }}
            >
              <ActionIcon kind={here.kind ?? "write"} className="size-2.5" />
            </span>
            <span className="truncate">{here.doing}</span>
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant={following ? "secondary" : "default"} className="flex-1 gap-1.5">
          <Eye /> {following ? "Stop following" : "Follow"}
        </Button>
        <Button size="sm" variant="outline" className="flex-1 gap-1.5">
          <LocateFixed /> Go to
        </Button>
      </div>
    </div>
  )
}

/**
 * Who's here, at the end of the title bar: avatars ringed in their colors, agents among them, the rest counted. Click
 * one for where they are, and to follow them.
 */
export function Facepile({ here, following, max = 4 }: { here: Here[]; following?: Person; max?: number }) {
  const shown = here.slice(0, max)
  return (
    <div className="flex items-center">
      {shown.map((entry, index) => (
        <Popover key={entry.person.name}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${entry.person.name}, ${entry.away ? "away" : entry.where}`}
              className={`rounded-full ${index > 0 ? "-ml-1.5" : ""}`}
            >
              <PresenceAvatar here={entry} size={24} following={entry.person === following} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-3">
            <PresenceCard here={entry} following={entry.person === following} />
          </PopoverContent>
        </Popover>
      ))}
      {here.length > max && (
        <span className="-ml-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground ring-2 ring-[#0a0a0a]">
          +{here.length - max}
        </span>
      )}
    </div>
  )
}

/** A person's pointer on the canvas: an agent's arrow in their palette, with their name. */
export function PersonCursor({ person }: { person: Person }) {
  const palette = paletteOf(person)
  return (
    <div className="pointer-events-none">
      <AgentPointer palette={palette} />
      <div
        className="mt-0.5 ml-4 w-max rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-md"
        style={{ background: palette.color, color: palette.ink }}
      >
        {person.name}
      </div>
    </div>
  )
}

/** An agent's pointer, as the canvas draws it today: its badge says what it's doing. */
export function AgentCursor({ agent, kind, label }: { agent: Person; kind: PresenceEvent["kind"]; label: string }) {
  return (
    <div className="pointer-events-none">
      <AgentPointer palette={paletteOf(agent)} />
      <AgentBadge palette={paletteOf(agent)} agent={agent.name} kind={kind} label={label} />
    </div>
  )
}

/**
 * What someone else has selected: the layer outlined in their color with their name on its corner. When several people
 * select the same layer, their names line up.
 */
export function SelectionOutline({ people: selecting, children }: { people: Person[]; children: ReactNode }) {
  const first = paletteOf(selecting[0]!)
  return (
    <div className="relative">
      {children}
      <span
        className="pointer-events-none absolute -inset-[3px] rounded-[6px] border-2"
        style={{ borderColor: first.color }}
      />
      <span className="pointer-events-none absolute -top-[22px] -left-[3px] flex gap-1">
        {selecting.map((person) => {
          const palette = paletteOf(person)
          return (
            <span
              key={person.name}
              className="rounded-[4px] px-1.5 py-0.5 text-[10px] leading-none font-semibold whitespace-nowrap"
              style={{ background: palette.color, color: palette.ink }}
            >
              {person.name.split(" ")[0]}
            </span>
          )
        })}
      </span>
    </div>
  )
}

/**
 * Following someone: the canvas is framed in their color and goes where they go, with who you're following and the
 * way out along the top. Panning yourself stops following.
 */
export function FollowFrame({ person, children }: { person: Person; children: ReactNode }) {
  const palette = paletteOf(person)
  return (
    <div className="relative h-full overflow-hidden">
      {children}
      <span
        className="pointer-events-none absolute inset-0 z-10"
        style={{ boxShadow: `inset 0 0 0 3px ${palette.color}` }}
      />
      <div
        className="absolute top-0 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-b-lg py-1 pr-1 pl-2 text-xs font-medium shadow-lg"
        style={{ background: palette.color, color: palette.ink }}
      >
        <Avatar person={person} size={18} />
        Following {person.name}
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md bg-black/15 px-2 py-0.5 hover:bg-black/25"
        >
          Stop <Kbd className="h-4 bg-black/15 text-current">Esc</Kbd>
        </button>
      </div>
    </div>
  )
}

/** Someone asks everyone to follow them, for a walkthrough: the invitation, and the presenter's side. */
export function Spotlight({ presenter, following }: { presenter: Person; following?: Person[] }) {
  const palette = paletteOf(presenter)
  if (presenter === me)
    return (
      <div className="flex w-fit items-center gap-3 rounded-xl border bg-popover py-2 pr-2 pl-3 text-sm shadow-xl">
        <MonitorPlay className="size-4" style={{ color: palette.color }} />
        <span>
          <span className="font-medium">You're presenting.</span>{" "}
          <span className="text-muted-foreground">{following?.length ?? 0} people are following you.</span>
        </span>
        <Button size="sm" variant="secondary">
          Stop presenting
        </Button>
      </div>
    )
  return (
    <div className="flex w-fit items-center gap-3 rounded-xl border bg-popover py-2 pr-2 pl-2.5 text-sm shadow-xl">
      <span className="rounded-full" style={{ boxShadow: `0 0 0 2px ${palette.color}` }}>
        <Avatar person={presenter} size={26} />
      </span>
      <span>
        <span className="font-medium">{presenter.name}</span>{" "}
        <span className="text-muted-foreground">is presenting Pricing and asked everyone to follow.</span>
      </span>
      <Button size="sm">Follow</Button>
      <Button size="sm" variant="ghost">
        Not now
      </Button>
    </div>
  )
}

/** A row in the Layers panel, with who has that layer selected. */
export function LayerRow({
  name,
  depth = 0,
  selectedBy = [],
  selected
}: {
  name: string
  depth?: number
  selectedBy?: Person[]
  selected?: boolean
}) {
  return (
    <div
      className={`flex h-7 items-center gap-2 rounded-md pr-2 text-[13px] ${selected ? "bg-[oklch(0.64_0.18_256/0.25)]" : "hover:bg-muted/40"}`}
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      <span className="size-3 shrink-0 rounded-[3px] border border-muted-foreground/60" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {selectedBy.map((person) => (
        <span
          key={person.name}
          title={`${person.name} has this selected`}
          className="-ml-1 size-2.5 rounded-full ring-2 ring-background first:ml-0"
          style={{ background: paletteOf(person).color }}
        />
      ))}
    </div>
  )
}

/** When the connection drops: work carries on here and syncs when it's back. */
export function ConnectionBanner({ state }: { state: "offline" | "reconnecting" }) {
  return (
    <div className="flex w-fit items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
      {state === "offline" ? (
        <WifiOff className="size-4 text-amber-400" />
      ) : (
        <RefreshCw className="size-4 animate-spin text-amber-400 [animation-duration:2s]" />
      )}
      <span>
        <span className="font-medium">{state === "offline" ? "You're offline." : "Reconnecting."}</span>{" "}
        <span className="text-muted-foreground">
          {state === "offline"
            ? "Your changes save on this computer and sync when you're back. Others' cursors are hidden."
            : "Catching up on 4 changes from Maya and Claude Code."}
        </span>
      </span>
    </div>
  )
}
