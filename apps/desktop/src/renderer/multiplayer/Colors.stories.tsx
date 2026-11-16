import { Slider } from "@buildkitgg/shadcn-baseui-kit"
import { contrastRatio, parseHex, rgbaToOklch } from "@parity-app/tokens"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Check, X } from "lucide-react"
import { useId, useState } from "react"
import { AgentPointer } from "../agent/AgentPointer.tsx"
import { badgeContrast, inkContrast, type Palette, palette, tunedPalettes } from "./palettes.ts"
import { gradient, type Member, MemberBadge, Outlined } from "./presence-parts.tsx"
import { canvasBackground, type Theme } from "./story-kit.tsx"

/**
 * People and agents share one list of colors, handed out by number, so the same person is the same color in every
 * copy of a room. The first 24 are hand-tuned: the agents' 12, and 12 more filling the gaps in hue between them. Past
 * those, palettes are generated: hues step round the wheel by the golden angle, alternating between two lightness
 * steps, with dark ink that passes the contrast check on every part of the badge. The list never runs out.
 */
const meta = {
  title: "Parity/Multiplayer/Colors",
  parameters: { layout: "fullscreen" }
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

/** A palette on one theme's canvas: its pointer and badge, and an outline with a tag on a white layer. */
function Sample({ palette: colors, theme }: { palette: Palette; theme: Theme }) {
  const member: Member = { name: colors.name, palette: colors }

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`${theme} relative flex h-[46px] w-[200px] items-center gap-3 overflow-hidden rounded-md border px-2`}
        style={{ background: canvasBackground[theme] }}
      >
        <div className="relative mt-1 h-9 w-24 shrink-0">
          <AgentPointer palette={colors} />
          <div className="absolute top-2 left-0">
            <MemberBadge member={member} />
          </div>
        </div>
        <div className="mt-3">
          <Outlined by={[member]} radius={3}>
            <span className="block h-4 w-14 rounded-[3px] bg-white" />
          </Outlined>
        </div>
      </div>
      <div className="flex gap-2.5">
        <Verdict value={badgeContrast(colors)} needs={inkContrast} label="Text" />
        <Verdict value={ratio(colors.color, canvasBackground[theme])} needs={edgeContrast} label="Edge" />
      </div>
    </div>
  )
}

function Row({ palette: colors }: { palette: Palette }) {
  const { l, c, h } = hueOf(colors.color)

  return (
    <div className="flex items-start gap-3 border-b border-border/60 py-2.5">
      <span className="w-6 pt-1 text-right text-xs text-muted-foreground tabular-nums">{colors.n}</span>
      <div className="flex w-28 flex-col gap-1 pt-0.5">
        <span className="h-2.5 rounded-full" style={{ background: gradient(colors) }} />
        <span className="text-xs font-medium">{colors.name}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          L {l.toFixed(2)} C {c.toFixed(2)} H {Math.round(h)}
        </span>
      </div>
      <Sample palette={colors} theme="light" />
      <Sample palette={colors} theme="dark" />
    </div>
  )
}

const generated = Array.from({ length: 24 }, (_, index) => palette(tunedPalettes.length + index))

/**
 * Both sets side by side: the 24 hand-tuned palettes, then the next 24 the generator makes. Each shows its pointer,
 * badge and outline on the light canvas and the dark, with two checks: badge text against every part of its gradient
 * (4.5 to 1), and the outline's color against the canvas (3 to 1). Light colors miss the second on the light canvas;
 * the hairline of ink outside each outline gives them their edge there.
 */
export const BothSets: Story = {
  render: () => (
    <div className="flex min-h-screen flex-wrap gap-x-12 gap-y-6 bg-background p-6 text-foreground">
      {[
        { title: "Hand-tuned", note: "The agents' 12, then 12 filling the gaps", list: tunedPalettes },
        { title: "Generated", note: "Golden-angle hues, two lightness steps", list: generated }
      ].map((set) => (
        <section key={set.title} className="flex flex-col">
          <header className="flex flex-col gap-0.5 pb-2">
            <h2 className="text-sm font-medium">{set.title}</h2>
            <p className="text-xs text-muted-foreground">{set.note}</p>
          </header>
          {set.list.map((each) => (
            <Row key={each.n} palette={each} />
          ))}
        </section>
      ))}
    </div>
  )
}

/** Where every palette sits: round the wheel by hue, and in from the edge by lightness, darker nearer the middle. */
function Wheel({ count }: { count: number }) {
  const size = 420
  const center = size / 2

  const place = (hex: string) => {
    const { l, h } = hueOf(hex)
    const radius = 40 + ((l - 0.6) / 0.35) * 150
    const angle = ((h - 90) * Math.PI) / 180

    return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius }
  }

  const made = Array.from({ length: count }, (_, index) => palette(tunedPalettes.length + index))

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <title>Palettes by hue</title>
      {[0.65, 0.75, 0.85].map((lightness) => (
        <circle
          key={lightness}
          cx={center}
          cy={center}
          r={40 + ((lightness - 0.6) / 0.35) * 150}
          fill="none"
          className="stroke-border"
          strokeDasharray="2 4"
        />
      ))}
      {made.map((each) => {
        const at = place(each.color)

        return (
          <g key={each.n}>
            <circle cx={at.x} cy={at.y} r={7} fill="none" stroke={each.color} strokeWidth={3} />
            <text x={at.x + 10} y={at.y + 3} className="fill-muted-foreground text-[9px] tabular-nums">
              {each.n}
            </text>
          </g>
        )
      })}
      {tunedPalettes.map((each) => {
        const at = place(each.color)

        return (
          <g key={each.n}>
            <circle cx={at.x} cy={at.y} r={9} fill={each.color} stroke={each.ink} strokeOpacity={0.4} />
            <text x={at.x + 12} y={at.y + 3} className="fill-foreground text-[10px]">
              {each.name}
            </text>
          </g>
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
          Filled dots are hand-tuned; rings are generated, numbered in the order they&apos;re handed out.
        </p>
        <div className="flex flex-col gap-2 text-sm">
          <span id={label}>
            Generated palettes: <span className="tabular-nums">{count}</span>
          </span>
          <Slider
            aria-labelledby={label}
            min={0}
            max={96}
            value={count}
            onValueChange={(value) => setCount(Array.isArray(value) ? (value[0] ?? 0) : value)}
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

/** The hand-tuned palettes filling the wheel's gaps, and where generated ones land as more are asked for. */
export const ByHue: Story = { render: () => <WheelStory /> }

const firstNames = ["Mia", "Jonas", "Priya", "Sam", "Lena", "Theo", "Ana", "Kofi", "Yuki", "Omar", "Ines", "Ravi"]

function NeverRunsOutStory() {
  const [count, setCount] = useState(40)
  const label = useId()

  const room = Array.from({ length: count }, (_, n) => ({
    name: `${firstNames[n % firstNames.length]} ${Math.floor(n / firstNames.length) + 1}`,
    palette: palette(n)
  }))

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-background p-6 text-foreground">
      <div className="flex w-72 flex-col gap-2 text-sm">
        <span id={label}>
          People and agents in the room: <span className="tabular-nums">{count}</span>
        </span>
        <Slider
          aria-labelledby={label}
          min={1}
          max={120}
          value={count}
          onValueChange={(value) => setCount(Array.isArray(value) ? (value[0] ?? 1) : value)}
        />
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

/** However many join, everyone gets a palette: the first 24 hand-tuned, the rest generated. */
export const NeverRunsOut: Story = { render: () => <NeverRunsOutStory /> }
