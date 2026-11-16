import { Slider } from "@buildkitgg/shadcn-baseui-kit"
import {
  agentPalette,
  badgeContrast,
  inkContrast,
  type Palette,
  palette,
  tunedAgentPalettes
} from "@parity-app/presence-colors"
import { contrastRatio, parseHex, rgbaToOklch } from "@parity-app/tokens"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Check, X } from "lucide-react"
import { useId, useState } from "react"
import { gradient, type Member } from "./member.ts"
import { MemberBadge } from "./MemberBadge.tsx"
import { Outlined } from "./Outlined.tsx"
import { RemotePointer } from "./RemotePointer.tsx"
import { canvasBackground, type Theme, scrolls } from "./story-kit.tsx"

/**
 * People and agents each have their own list of colors, handed out by number, so the same person is the same color in
 * every copy of a room, and neither list runs out. What tells them apart is the style, whatever the hue: an agent's
 * palette is vivid and its gradient sweeps across neighbouring hues, and its pointer glows; a person's is soft and
 * light, and its gradient stays in one hue. Agents start with their 12 hand-tuned palettes, then generated ones in the
 * same style; people's are generated from the first, in rings of 12 evenly spaced hues. Every badge's dark ink passes
 * the contrast check on every part of its gradient.
 */
const meta = {
  title: "Parity/Multiplayer/Colors",
  parameters: { layout: "fullscreen" },
  decorators: [scrolls]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** The least contrast an outline needs against the canvas, as WCAG asks of graphics. */
const edgeContrast = 3

const ratio = (a: string, b: string) => contrastRatio(parseHex(a)!, parseHex(b)!)
const hueOf = (hex: string) => rgbaToOklch(parseHex(hex)!)

function Verdict({ value, needs, label }: { value: number; needs: number; label: string }) {
  const passes = value >= needs

  return (
    <span
      className={`flex items-center gap-1 text-[11px] tabular-nums ${passes ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}
      title={`${label}: ${value.toFixed(2)} to 1, needs ${needs} to 1`}
    >
      {passes ? <Check className="size-3" /> : <X className="size-3" />}
      {label} {value.toFixed(1)}
    </span>
  )
}

/** A palette on one theme's canvas, as its wearer has it: their pointer and badge, and an outline with its tag. */
function Sample({ member, theme }: { member: Member; theme: Theme }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className={`${theme} relative h-[54px] w-[210px] overflow-hidden rounded-md border`}
        style={{ background: canvasBackground[theme] }}
      >
        <RemotePointer member={member} at={{ x: 10, y: 5 }} />
        <div className="absolute top-[26px] left-[148px]">
          <Outlined by={[member]} radius={3}>
            <span className="block h-4 w-10 rounded-[3px] bg-white" />
          </Outlined>
        </div>
      </div>
      <div className="flex gap-2.5">
        <Verdict value={badgeContrast(member.palette)} needs={inkContrast} label="Text" />
        <Verdict value={ratio(member.palette.color, canvasBackground[theme])} needs={edgeContrast} label="Edge" />
      </div>
    </div>
  )
}

function Row({ member }: { member: Member }) {
  const { l, c, h } = hueOf(member.palette.color)

  return (
    <div className="flex items-start gap-3 border-b border-border/60 py-2.5">
      <span className="w-6 pt-1 text-right text-xs text-muted-foreground tabular-nums">{member.palette.n}</span>
      <div className="flex w-28 flex-col gap-1 pt-0.5">
        <span className="h-2.5 rounded-full" style={{ background: gradient(member.palette) }} />
        <span className="text-xs font-medium">{member.palette.name}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          L {l.toFixed(2)} C {c.toFixed(2)} H {Math.round(h)}
        </span>
      </div>
      <Sample member={member} theme="light" />
      <Sample member={member} theme="dark" />
    </div>
  )
}

const shown = 24

const people: Member[] = Array.from({ length: shown }, (_, n) => ({ name: "Person", palette: palette(n) }))

const agents: Member[] = Array.from({ length: shown }, (_, n) => ({
  name: "Agent",
  palette: agentPalette(n),
  agent: true
}))

/**
 * The first 24 of each list side by side, each worn as it is on the canvas, on the light canvas and the dark, with two
 * checks: badge text against every part of its gradient (4.5 to 1), and the outline's color against the canvas (3 to
 * 1). People's light colors miss the second on the light canvas; the hairline of ink outside each outline gives them
 * their edge there.
 */
export const BothSets: Story = {
  render: () => (
    <div className="flex min-h-screen flex-wrap gap-x-12 gap-y-6 bg-background p-6 text-foreground">
      {[
        { title: "People", note: "Soft and light, each gradient in one hue", list: people },
        {
          title: "Agents",
          note: `Vivid, each gradient sweeping across hues: ${tunedAgentPalettes.length} hand-tuned, then generated`,
          list: agents
        }
      ].map((set) => (
        <section key={set.title} className="flex flex-col">
          <header className="flex flex-col gap-0.5 pb-2">
            <h2 className="text-sm font-medium">{set.title}</h2>
            <p className="text-xs text-muted-foreground">{set.note}</p>
          </header>
          {set.list.map((each) => (
            <Row key={each.palette.n} member={each} />
          ))}
        </section>
      ))}
    </div>
  )
}

/**
 * Where every palette sits: round the wheel by hue, and in from the edge by lightness, darker nearer the middle.
 * People's are circles, agents' diamonds.
 */
function Wheel({ count }: { count: number }) {
  const size = 420
  const center = size / 2

  const place = (hex: string) => {
    const { l, h } = hueOf(hex)
    const radius = 30 + ((l - 0.6) / 0.35) * 160
    const angle = ((h - 90) * Math.PI) / 180

    return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius }
  }

  const list = (make: (n: number) => Palette) => Array.from({ length: count }, (_, n) => make(n))

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <title>Palettes by hue</title>
      {[0.65, 0.75, 0.85].map((lightness) => (
        <circle
          key={lightness}
          cx={center}
          cy={center}
          r={30 + ((lightness - 0.6) / 0.35) * 160}
          fill="none"
          className="stroke-border"
          strokeDasharray="2 4"
        />
      ))}
      {list(agentPalette).map((each) => {
        const at = place(each.color)

        return (
          <rect
            key={`agent-${each.n}`}
            x={at.x - 6}
            y={at.y - 6}
            width={12}
            height={12}
            transform={`rotate(45 ${at.x} ${at.y})`}
            fill={each.color}
            stroke={each.ink}
            strokeOpacity={0.4}
          />
        )
      })}
      {list(palette).map((each) => {
        const at = place(each.color)

        return (
          <circle
            key={`person-${each.n}`}
            cx={at.x}
            cy={at.y}
            r={6}
            fill={each.color}
            stroke={each.ink}
            strokeOpacity={0.4}
          />
        )
      })}
    </svg>
  )
}

function WheelStory() {
  const [count, setCount] = useState(24)
  const label = useId()

  return (
    <div className="flex min-h-screen flex-wrap items-start gap-8 bg-background p-6 text-foreground">
      <div className="flex w-64 flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Circles are people&apos;s palettes, in a soft outer band; diamonds are agents&apos;, deeper and more vivid.
        </p>
        <div className="flex flex-col gap-2 text-sm">
          <span id={label}>
            Of each: <span className="tabular-nums">{count}</span>
          </span>
          <Slider
            aria-labelledby={label}
            min={1}
            max={96}
            value={count}
            onValueChange={(value) => setCount(Array.isArray(value) ? (value[0] ?? 1) : value)}
          />
        </div>
      </div>
      {(["light", "dark"] as const).map((theme) => (
        <div key={theme} className={`${theme} rounded-xl border p-2`} style={{ background: canvasBackground[theme] }}>
          <Wheel count={count} />
        </div>
      ))}
    </div>
  )
}

/** People and agents keep apart on the wheel however many there are: people soft and light, agents vivid. */
export const ByHue: Story = { render: () => <WheelStory /> }

const firstNames = ["Mia", "Jonas", "Priya", "Sam", "Lena", "Theo", "Ana", "Kofi", "Yuki", "Omar", "Ines", "Ravi"]

function CountSlider({ label, value, onValue }: { label: string; value: number; onValue: (value: number) => void }) {
  const id = useId()

  return (
    <div className="flex w-64 flex-col gap-2 text-sm">
      <span id={id}>
        {label}: <span className="tabular-nums">{value}</span>
      </span>
      <Slider
        aria-labelledby={id}
        min={0}
        max={60}
        value={value}
        onValueChange={(next) => onValue(Array.isArray(next) ? (next[0] ?? 0) : next)}
      />
    </div>
  )
}

function NeverRunsOutStory() {
  const [peopleCount, setPeopleCount] = useState(30)
  const [agentCount, setAgentCount] = useState(30)

  const room: Member[] = [
    ...Array.from({ length: peopleCount }, (_, n) => ({
      name: `${firstNames[n % firstNames.length]} ${Math.floor(n / firstNames.length) + 1}`,
      palette: palette(n)
    })),
    ...Array.from({ length: agentCount }, (_, n) => ({ name: `Agent ${n + 1}`, palette: agentPalette(n), agent: true }))
  ]

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-background p-6 text-foreground">
      <div className="flex flex-wrap gap-8">
        <CountSlider label="People in the room" value={peopleCount} onValue={setPeopleCount} />
        <CountSlider label="Agents at work" value={agentCount} onValue={setAgentCount} />
      </div>
      <div className="flex flex-wrap gap-4">
        {(["light", "dark"] as const).map((theme) => (
          <div
            key={theme}
            className={`${theme} flex w-[min(100%,560px)] flex-wrap content-start gap-x-1 gap-y-2 rounded-xl border p-3`}
            style={{ background: canvasBackground[theme] }}
          >
            {room.map((member) => (
              <div key={member.name} className="-ml-4" title={`${member.palette.n}: ${member.palette.name}`}>
                <MemberBadge member={member} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** However many join and however many agents they run, everyone gets a palette, and people never look like agents. */
export const NeverRunsOut: Story = { render: () => <NeverRunsOutStory /> }
