/**
 * Renders of the other kinds of app: games, a component library, a marketplace and a shared board. Like the web
 * renders, each draws at its real size in a project's look.
 */
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  Compass,
  Dog,
  Gem,
  Heart,
  Inbox,
  Lock,
  MessageCircle,
  Minus,
  Moon,
  Pause,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Skull,
  Star,
  ThumbsUp,
  Timer,
  User
} from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { GitHubMark } from "../parts.tsx"
import type { Look } from "./data.ts"
import { Brand, curve, display, Face, PhoneStatus, PhoneTabs } from "./render-kit.tsx"

const pixel = "font-mono font-bold tracking-[0.18em] uppercase"

function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`flex items-center gap-2 rounded-full bg-black/45 px-3.5 py-1.5 text-[16px] font-bold text-white ring-1 ring-white/10 backdrop-blur ${className}`}
    >
      {children}
    </span>
  )
}

function GameHud({ look }: { look: Look }) {
  return (
    <div className="absolute inset-x-0 top-0 flex items-center justify-between px-8 py-6">
      <span className="flex items-center gap-4">
        <span className="grid size-11 place-items-center rounded-xl bg-black/45 text-white ring-1 ring-white/10">
          <ChevronLeft className="size-6" />
        </span>
        <span className="flex flex-col">
          <span className={`text-[13px] text-white/60 ${pixel}`}>World 2</span>
          <span className={`text-[30px] leading-none font-black text-white ${display}`}>{look.brand}</span>
        </span>
      </span>
      <span className="flex items-center gap-3">
        <Pill>
          <Coins className="size-5 text-[oklch(0.85_0.16_85)]" /> 1,240
        </Pill>
        <Pill>
          <Gem className="size-5 text-[oklch(0.8_0.13_200)]" /> 36
        </Pill>
        <Pill>
          <Heart className="size-5 fill-[oklch(0.68_0.22_25)] text-[oklch(0.68_0.22_25)]" /> 5
        </Pill>
      </span>
    </div>
  )
}

const levelNodes = [
  { x: 150, y: 590, stars: 3 },
  { x: 290, y: 480, stars: 3 },
  { x: 430, y: 560, stars: 2 },
  { x: 570, y: 440, stars: 3 },
  { x: 710, y: 520, stars: 1 },
  { x: 840, y: 400, current: true },
  { x: 970, y: 470 },
  { x: 1080, y: 350 },
  { x: 1170, y: 230, boss: true }
]

/** A game's world map: levels along a path, with stars and the next one to play. */
export function Levels({ look }: { look: Look }) {
  const h = look.hue
  return (
    <div
      className="relative size-full overflow-hidden"
      style={{
        background: `linear-gradient(180deg, oklch(0.2 0.06 ${h + 250}) 0%, oklch(0.24 0.08 ${h + 300}) 55%, oklch(0.35 0.14 ${h}) 100%)`
      }}
    >
      <svg width="1280" height="800" className="absolute inset-0">
        <defs>
          <radialGradient id="lava-glow" cx="0.5" cy="1" r="0.7">
            <stop offset="0" stopColor={`oklch(0.7 0.2 ${h})`} stopOpacity="0.55" />
            <stop offset="1" stopColor={`oklch(0.7 0.2 ${h})`} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="380" width="1280" height="420" fill="url(#lava-glow)" />
        <path
          d="M0,0 L1280,0 L1280,70 L1210,150 L1160,80 L1090,190 L1020,90 L940,130 L880,60 L800,160 L740,70 L660,120 L600,50 L520,170 L450,80 L380,130 L300,60 L230,180 L160,90 L90,140 L0,60 Z"
          fill={`oklch(0.13 0.04 ${h + 260})`}
        />
        <path
          d="M0,800 L0,700 L80,660 L170,720 L260,650 L380,700 L470,640 L590,690 L700,630 L820,690 L930,640 L1040,700 L1150,650 L1280,690 L1280,800 Z"
          fill={`oklch(0.14 0.05 ${h + 290})`}
        />
        <path
          d={curve(levelNodes.map(({ x, y }) => [x, y]))}
          fill="none"
          stroke={`oklch(0.85 0.1 ${h + 20})`}
          strokeOpacity="0.45"
          strokeWidth="7"
          strokeDasharray="2 16"
          strokeLinecap="round"
        />
      </svg>
      {levelNodes.map((node, index) => {
        const size = node.boss ? 92 : node.current ? 78 : 64
        const locked = index > 5
        return (
          <div
            key={index}
            className="absolute flex flex-col items-center gap-2"
            style={{ left: node.x - size / 2, top: node.y - size / 2, width: size }}
          >
            <span
              className={`grid place-items-center rounded-full border-b-[6px] text-[26px] font-black ${
                locked ? "text-white/40" : "text-white"
              }`}
              style={{
                width: size,
                height: size,
                background: locked
                  ? `oklch(0.3 0.04 ${h + 280})`
                  : `linear-gradient(180deg, oklch(0.78 0.17 ${h + 15}), oklch(0.62 0.2 ${h}))`,
                borderColor: locked ? `oklch(0.2 0.04 ${h + 280})` : `oklch(0.45 0.16 ${h - 5})`,
                boxShadow: node.current
                  ? `0 0 0 8px oklch(0.85 0.15 ${h + 30} / 0.35), 0 0 60px oklch(0.75 0.2 ${h})`
                  : undefined
              }}
            >
              {node.boss ? <Skull className="size-10" /> : locked ? <Lock className="size-6" /> : index + 1}
            </span>
            {"stars" in node && (
              <span className="flex gap-0.5">
                {[0, 1, 2].map((star) => (
                  <Star
                    key={star}
                    className={`size-5 ${
                      star < node.stars! ? "fill-[oklch(0.86_0.17_88)] text-[oklch(0.86_0.17_88)]" : "text-white/25"
                    }`}
                  />
                ))}
              </span>
            )}
          </div>
        )
      })}
      <GameHud look={look} />
      <div className="absolute bottom-7 left-8 flex items-center gap-4 rounded-2xl bg-black/45 p-3 pr-6 ring-1 ring-white/10 backdrop-blur">
        <span
          className="grid size-16 place-items-center rounded-xl text-white"
          style={{ background: `linear-gradient(135deg, oklch(0.75 0.18 ${h + 20}), oklch(0.55 0.2 ${h - 10}))` }}
        >
          <look.icon className="size-9" />
        </span>
        <span className="flex flex-col gap-1.5 text-white">
          <span className="text-[18px] font-bold">Pyra</span>
          <span className={`text-[11px] text-white/60 ${pixel}`}>Level 12</span>
          <span className="h-2 w-40 overflow-hidden rounded-full bg-white/15">
            <span className="block h-full w-[68%] rounded-full bg-[oklch(0.86_0.17_88)]" />
          </span>
        </span>
      </div>
      <span
        className={`absolute right-8 bottom-8 flex items-center gap-3 rounded-2xl border-b-[6px] px-10 py-5 text-[22px] text-white ${pixel}`}
        style={{
          background: `linear-gradient(180deg, oklch(0.78 0.17 ${h + 15}), oklch(0.62 0.21 ${h}))`,
          borderColor: `oklch(0.42 0.16 ${h - 5})`,
          boxShadow: `0 20px 50px -10px oklch(0.6 0.2 ${h})`
        }}
      >
        Play level 6 <ArrowRight className="size-6" strokeWidth={3} />
      </span>
    </div>
  )
}

/** A level's tiles: ground, floating platforms, coins, lava, the player, enemies and the flag. */
const tiles = [
  "....................",
  "....................",
  "............C.C.....",
  "...........=====....",
  ".....C..............",
  "....===.......E....F",
  "..................##",
  "..P........E....####",
  "#####..######..#####",
  "#####LL######LL#####",
  "####################",
  "####################"
]

function Tile({ kind, top, hue }: { kind: string; top: boolean; hue: number }) {
  if (kind === "#")
    return (
      <span
        className="absolute inset-0"
        style={{
          background: top
            ? `linear-gradient(180deg, oklch(0.78 0.16 ${hue + 20}) 0 10px, oklch(0.4 0.05 ${hue + 300}) 10px)`
            : `oklch(0.33 0.05 ${hue + 300})`,
          boxShadow: "inset 0 0 0 1px oklch(0 0 0 / 0.18)"
        }}
      />
    )
  if (kind === "=")
    return (
      <span
        className="absolute inset-x-0 top-0 h-7 rounded-md"
        style={{
          background: `linear-gradient(180deg, oklch(0.8 0.15 ${hue + 25}) 0 8px, oklch(0.45 0.06 ${hue + 300}) 8px)`
        }}
      />
    )
  if (kind === "L")
    return (
      <span
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, oklch(0.88 0.17 ${hue + 40}), oklch(0.65 0.23 ${hue}))`,
          boxShadow: `0 -18px 40px oklch(0.75 0.2 ${hue} / 0.7)`
        }}
      />
    )
  if (kind === "C")
    return (
      <span className="absolute inset-3.5 rounded-full border-4 border-[oklch(0.7_0.15_75)] bg-[oklch(0.87_0.17_90)] shadow-[0_0_20px_oklch(0.87_0.17_90/0.7)]" />
    )
  if (kind === "E")
    return (
      <span className="absolute inset-x-2 top-4 bottom-0 rounded-t-[28px] bg-[oklch(0.3_0.08_300)] shadow-[0_0_0_3px_oklch(0.2_0.06_300)]">
        <span className="absolute top-4 left-3 h-3 w-4 rounded-full bg-[oklch(0.85_0.2_25)]" />
        <span className="absolute top-4 right-3 h-3 w-4 rounded-full bg-[oklch(0.85_0.2_25)]" />
      </span>
    )
  if (kind === "P")
    return (
      <span
        className="absolute inset-x-2.5 -top-6 bottom-0 rounded-[20px] shadow-[0_0_0_3px_oklch(0.3_0.1_30)]"
        style={{ background: `linear-gradient(180deg, oklch(0.82 0.16 ${hue + 20}), oklch(0.65 0.2 ${hue}))` }}
      >
        <span className="absolute top-6 left-4 h-4 w-3 rounded-full bg-[oklch(0.2_0.03_270)]" />
        <span className="absolute top-6 right-4 h-4 w-3 rounded-full bg-[oklch(0.2_0.03_270)]" />
        <span className="absolute inset-x-0 top-[52px] h-3 bg-[oklch(0.6_0.2_25)]" />
      </span>
    )
  if (kind === "F")
    return (
      <span className="absolute inset-0">
        <span className="absolute top-0 bottom-0 left-3 w-1.5 rounded bg-white/80" />
        <span className="absolute top-1 left-4.5 h-8 w-10 rounded-r-md bg-[oklch(0.7_0.2_150)]" />
      </span>
    )
  return null
}

/** A platformer mid-level, with its HUD. */
export function Play({ look }: { look: Look }) {
  const h = look.hue
  const size = 64
  return (
    <div
      className="relative size-full overflow-hidden"
      style={{
        background: `linear-gradient(180deg, oklch(0.22 0.07 ${h + 260}) 0%, oklch(0.3 0.1 ${h + 310}) 60%, oklch(0.42 0.14 ${h}) 100%)`
      }}
    >
      <svg width="1280" height="800" className="absolute inset-0">
        <path
          d="M0,520 L120,380 L220,470 L340,330 L470,460 L590,350 L720,470 L850,320 L980,450 L1110,340 L1280,460 L1280,800 L0,800 Z"
          fill={`oklch(0.2 0.06 ${h + 280})`}
          opacity="0.7"
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0" style={{ height: tiles.length * size }}>
        {tiles.flatMap((row, y) =>
          [...row].map((kind, x) =>
            kind === "." ? null : (
              <span
                key={`${x}-${y}`}
                className="absolute"
                style={{ left: x * size, top: y * size, width: size, height: size }}
              >
                <Tile kind={kind} top={kind === "#" && tiles[y - 1]?.[x] !== "#"} hue={h} />
              </span>
            )
          )
        )}
      </div>
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-8 py-6">
        <span className="flex flex-col gap-2">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((heart) => (
              <Heart
                key={heart}
                className={`size-8 ${heart < 2 ? "fill-[oklch(0.68_0.22_25)] text-[oklch(0.68_0.22_25)]" : "text-white/40"}`}
              />
            ))}
          </span>
          <span className={`text-[18px] text-white ${pixel}`}>Score 004210</span>
        </span>
        <span className={`rounded-xl bg-black/40 px-4 py-2 text-[16px] text-white ring-1 ring-white/10 ${pixel}`}>
          Level 2-6
        </span>
        <span className="flex items-center gap-3">
          <Pill>
            <Coins className="size-5 text-[oklch(0.85_0.16_85)]" /> 42
          </Pill>
          <span className="grid size-11 place-items-center rounded-xl bg-black/45 text-white ring-1 ring-white/10">
            <Pause className="size-5" />
          </span>
        </span>
      </div>
    </div>
  )
}

/** A 3D physics arena from behind the player, with the HUD around it. */
export function Arena({ look }: { look: Look }) {
  const h = look.hue
  const horizon = 330
  const floor = `oklch(0.3 0.05 ${h})`
  const line = `oklch(0.7 0.12 ${h} / 0.35)`
  const rows = [0, 0.06, 0.14, 0.25, 0.4, 0.6, 0.85]
  return (
    <div
      className="relative size-full overflow-hidden"
      style={{
        background: `linear-gradient(180deg, oklch(0.16 0.04 ${h + 40}) 0%, oklch(0.24 0.07 ${h}) 42%, ${floor} 42%)`
      }}
    >
      <svg width="1280" height="800" className="absolute inset-0">
        <polygon points={`0,800 1280,800 1000,${horizon} 280,${horizon}`} fill={floor} />
        {rows.map((t) => {
          const y = horizon + t * (800 - horizon)
          const inset = 280 * (1 - t)
          return <line key={t} x1={inset} x2={1280 - inset} y1={y} y2={y} stroke={line} strokeWidth="2" />
        })}
        {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((column) => (
          <line
            key={column}
            x1={640 + column * 45}
            y1={horizon}
            x2={640 + column * 180}
            y2={800}
            stroke={line}
            strokeWidth="2"
          />
        ))}
        <polygon points={`0,800 280,${horizon} 280,${horizon - 70} 0,560`} fill={`oklch(0.22 0.05 ${h})`} />
        <polygon points={`1280,800 1000,${horizon} 1000,${horizon - 70} 1280,560`} fill={`oklch(0.22 0.05 ${h})`} />
        {[
          { x: 380, y: 470, s: 70 },
          { x: 900, y: 440, s: 56 },
          { x: 760, y: 380, s: 36 }
        ].map((box) => (
          <g key={box.x}>
            <ellipse
              cx={box.x}
              cy={box.y + box.s * 0.9}
              rx={box.s * 0.9}
              ry={box.s * 0.22}
              fill="black"
              opacity="0.3"
            />
            <polygon
              points={`${box.x - box.s},${box.y - box.s * 0.3} ${box.x},${box.y - box.s * 0.7} ${box.x + box.s},${box.y - box.s * 0.3} ${box.x},${box.y + box.s * 0.1}`}
              fill={`oklch(0.82 0.1 ${h + 30})`}
            />
            <polygon
              points={`${box.x - box.s},${box.y - box.s * 0.3} ${box.x},${box.y + box.s * 0.1} ${box.x},${box.y + box.s * 0.9} ${box.x - box.s},${box.y + box.s * 0.5}`}
              fill={`oklch(0.6 0.1 ${h + 30})`}
            />
            <polygon
              points={`${box.x + box.s},${box.y - box.s * 0.3} ${box.x},${box.y + box.s * 0.1} ${box.x},${box.y + box.s * 0.9} ${box.x + box.s},${box.y + box.s * 0.5}`}
              fill={`oklch(0.48 0.09 ${h + 30})`}
            />
          </g>
        ))}
        <defs>
          <radialGradient id="arena-ball" cx="0.35" cy="0.3" r="0.75">
            <stop offset="0" stopColor="white" />
            <stop offset="0.35" stopColor={`oklch(0.78 0.17 ${h - 160})`} />
            <stop offset="1" stopColor={`oklch(0.45 0.17 ${h - 160})`} />
          </radialGradient>
          <radialGradient id="arena-enemy" cx="0.35" cy="0.3" r="0.75">
            <stop offset="0" stopColor="white" />
            <stop offset="0.35" stopColor="oklch(0.7 0.2 25)" />
            <stop offset="1" stopColor="oklch(0.4 0.16 25)" />
          </radialGradient>
        </defs>
        <ellipse cx="640" cy="690" rx="90" ry="22" fill="black" opacity="0.35" />
        <circle cx="640" cy="610" r="80" fill="url(#arena-ball)" />
        {[
          { x: 560, y: 420, r: 26 },
          { x: 1010, y: 520, r: 34 }
        ].map((enemy) => (
          <g key={enemy.x}>
            <ellipse
              cx={enemy.x}
              cy={enemy.y + enemy.r * 0.95}
              rx={enemy.r}
              ry={enemy.r * 0.25}
              fill="black"
              opacity="0.3"
            />
            <circle cx={enemy.x} cy={enemy.y} r={enemy.r} fill="url(#arena-enemy)" />
          </g>
        ))}
        <circle cx="640" cy="300" r="14" fill="none" stroke="white" strokeOpacity="0.8" strokeWidth="2.5" />
        <line x1="640" x2="640" y1="276" y2="290" stroke="white" strokeOpacity="0.8" strokeWidth="2.5" />
        <line x1="640" x2="640" y1="310" y2="324" stroke="white" strokeOpacity="0.8" strokeWidth="2.5" />
      </svg>
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-8 py-6 text-white">
        <span className="flex flex-col gap-1">
          <span className={`text-[13px] text-white/60 ${pixel}`}>Round 3</span>
          <span className={`text-[34px] leading-none ${pixel}`}>1:42</span>
        </span>
        <Pill>
          <Star className="size-5 fill-[oklch(0.86_0.17_88)] text-[oklch(0.86_0.17_88)]" /> 2,180
        </Pill>
      </div>
      <div className="absolute bottom-7 left-8 flex flex-col gap-2 text-white">
        <span className={`text-[12px] text-white/60 ${pixel}`}>Shield</span>
        <span className="h-3 w-64 overflow-hidden rounded-full bg-white/15">
          <span className="block h-full w-[72%] rounded-full" style={{ background: `oklch(0.78 0.17 ${h - 160})` }} />
        </span>
      </div>
      <span className="absolute right-8 bottom-7 size-36 rounded-full bg-black/40 ring-1 ring-white/15">
        <span className="absolute top-1/2 left-1/2 size-3 -translate-1/2 rounded-full bg-white" />
        <span className="absolute top-[30%] left-[38%] size-2.5 rounded-full bg-[oklch(0.7_0.2_25)]" />
        <span className="absolute top-[58%] left-[74%] size-2.5 rounded-full bg-[oklch(0.7_0.2_25)]" />
      </span>
    </div>
  )
}

const componentList = [
  "Accordion",
  "Alert",
  "Avatar",
  "Badge",
  "Button",
  "Card",
  "Checkbox",
  "Combobox",
  "Dialog",
  "Input",
  "Menu",
  "Select",
  "Switch",
  "Tabs",
  "Toast",
  "Tooltip"
]

function Specimen({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col rounded-xl border border-(--r-line) bg-(--r-card) ${className}`}>
      <span className="border-b border-(--r-line) px-4 py-2.5 text-[12px] font-medium text-(--r-muted)">{title}</span>
      <div className="flex flex-1 flex-wrap items-center gap-3 p-5">{children}</div>
    </div>
  )
}

function Btn({
  variant = "primary",
  size = "md",
  children
}: {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger"
  size?: "sm" | "md" | "lg"
  children: ReactNode
}) {
  const sizes = { sm: "h-8 px-3 text-[13px]", md: "h-9 px-4 text-[14px]", lg: "h-11 px-5 text-[15px]" }
  const variants = {
    primary: "bg-(--r-brand) text-(--r-brand-fg)",
    secondary: "bg-(--r-raised)",
    outline: "border border-(--r-line) bg-(--r-card)",
    ghost: "text-(--r-muted)",
    danger: "bg-(--r-bad) text-white"
  }
  return (
    <span className={`flex items-center gap-1.5 rounded-lg font-medium ${sizes[size]} ${variants[variant]}`}>
      {children}
    </span>
  )
}

/** A component library's docs: the list, then a component's specimens. */
export function Components({ look }: { look: Look }) {
  return (
    <div className="flex size-full flex-col bg-(--r-bg) text-[14px]">
      <header className="flex h-14 shrink-0 items-center gap-8 border-b border-(--r-line) px-6">
        <span className="flex items-center gap-2">
          <Brand look={look} size={26} />
          <span className="rounded-md border border-(--r-line) px-1.5 py-0.5 font-mono text-[11px] text-(--r-muted)">
            2.4.0
          </span>
        </span>
        <span className="flex h-full items-center gap-6 text-(--r-muted)">
          {["Components", "Tokens", "Icons", "Guides"].map((tab) => (
            <span
              key={tab}
              className={`flex h-full items-center border-b-2 ${tab === "Components" ? "border-(--r-brand) font-medium text-(--r-fg)" : "border-transparent"}`}
            >
              {tab}
            </span>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-4 text-(--r-muted)">
          <span className="flex w-56 items-center gap-2 rounded-lg border border-(--r-line) px-3 py-1.5 text-[13px] text-(--r-faint)">
            <Search className="size-3.5" /> Search
          </span>
          <Moon className="size-4" />
          <GitHubMark size={18} />
        </span>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[212px] shrink-0 flex-col gap-0.5 border-r border-(--r-line) px-3 py-5">
          {componentList.map((name) => (
            <span
              key={name}
              className={`rounded-md px-2.5 py-1.5 ${name === "Button" ? "bg-(--r-soft) font-medium text-(--r-brand)" : "text-(--r-muted)"}`}
            >
              {name}
            </span>
          ))}
        </aside>
        <main className="flex flex-1 flex-col gap-5 px-10 py-8">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[32px] font-semibold tracking-tight">Button</h1>
            <p className="text-[15px] text-(--r-muted)">Starts an action. Use one primary button per view.</p>
          </div>
          <span className="flex w-fit gap-1 rounded-lg bg-(--r-raised) p-1 text-[13px]">
            {["Examples", "Props", "Accessibility"].map((tab, index) => (
              <span
                key={tab}
                className={`rounded-md px-3 py-1 ${index === 0 ? "bg-(--r-card) font-medium shadow-sm" : "text-(--r-muted)"}`}
              >
                {tab}
              </span>
            ))}
          </span>
          <div className="grid grid-cols-2 gap-4">
            <Specimen title="Variants">
              <Btn>Primary</Btn>
              <Btn variant="secondary">Secondary</Btn>
              <Btn variant="outline">Outline</Btn>
              <Btn variant="ghost">Ghost</Btn>
              <Btn variant="danger">Delete</Btn>
            </Specimen>
            <Specimen title="Sizes">
              <Btn size="sm">Small</Btn>
              <Btn>Medium</Btn>
              <Btn size="lg">Large</Btn>
            </Specimen>
            <Specimen title="With an icon">
              <Btn>
                <Plus className="size-4" /> New app
              </Btn>
              <Btn variant="outline">
                Continue <ArrowRight className="size-4" />
              </Btn>
              <Btn variant="secondary">
                <Calendar className="size-4" /> Schedule
              </Btn>
            </Specimen>
            <Specimen title="States">
              <Btn>Default</Btn>
              <span className="rounded-lg ring-4 ring-(--r-brand)/30">
                <Btn>Focused</Btn>
              </span>
              <span className="opacity-45">
                <Btn>Disabled</Btn>
              </span>
            </Specimen>
            <Specimen title="In a form" className="col-span-2">
              <span className="flex w-[300px] flex-col gap-1.5">
                <span className="font-medium">Workspace name</span>
                <span className="rounded-lg border border-(--r-line) bg-(--r-card) px-3 py-2">Acme</span>
                <span className="text-[12px] text-(--r-muted)">You can change this later.</span>
              </span>
              <span className="flex items-center gap-2.5">
                <span className="relative h-6 w-11 rounded-full bg-(--r-brand)">
                  <span className="absolute top-0.5 right-0.5 size-5 rounded-full bg-white shadow" />
                </span>
                Email me updates
              </span>
              <span className="ml-auto flex gap-2">
                <Btn variant="ghost">Cancel</Btn>
                <Btn>Save changes</Btn>
              </span>
            </Specimen>
          </div>
        </main>
      </div>
    </div>
  )
}

const walkers = [
  { name: "Ama Mensah", hue: 60, rating: "4.98", walks: 212, distance: "0.4 mi", price: "£14", super: true },
  { name: "Tom Becker", hue: 140, rating: "4.91", walks: 96, distance: "0.7 mi", price: "£12" },
  { name: "Noor Haddad", hue: 20, rating: "5.0", walks: 58, distance: "0.9 mi", price: "£15", super: true },
  { name: "Kai Lindqvist", hue: 220, rating: "4.87", walks: 140, distance: "1.1 mi", price: "£11" },
  { name: "Lucia Romano", hue: 330, rating: "4.95", walks: 301, distance: "1.2 mi", price: "£16", super: true },
  { name: "Dev Patel", hue: 95, rating: "4.9", walks: 77, distance: "1.4 mi", price: "£13" }
]

/** A soft photo stand-in: the walker's color, with a dog. */
function Photo({ hue, className = "", style }: { hue: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={`relative grid place-items-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(150deg, oklch(0.9 0.06 ${hue}), oklch(0.72 0.1 ${hue + 30}))`, ...style }}
    >
      <Dog className="size-1/3 text-white/70" strokeWidth={1.5} />
    </span>
  )
}

function SearchPill() {
  return (
    <span className="flex items-center rounded-full border border-(--r-line) bg-(--r-card) py-1.5 pr-1.5 pl-6 shadow-[0_6px_24px_-12px_rgb(0_0_0/0.25)]">
      {[
        ["Where", "Shoreditch, London"],
        ["When", "Today, from 5 PM"],
        ["Dogs", "1 dog"]
      ].map(([label, value], index) => (
        <span key={label} className={`flex flex-col pr-6 ${index ? "border-l border-(--r-line) pl-6" : ""}`}>
          <span className="text-[11px] font-semibold">{label}</span>
          <span className="text-[14px] text-(--r-muted)">{value}</span>
        </span>
      ))}
      <span className="grid size-11 place-items-center rounded-full bg-(--r-brand) text-(--r-brand-fg)">
        <Search className="size-5" />
      </span>
    </span>
  )
}

const filters = ["Available now", "Under £15", "Superwalkers", "Small dogs", "Group walks", "Insured"]

/** A marketplace's search: walkers near you, and where they are. */
export function Listings({ look }: { look: Look }) {
  return (
    <div className="flex size-full flex-col bg-(--r-bg) text-[14px]">
      <nav className="flex h-20 shrink-0 items-center justify-between border-b border-(--r-line) px-10">
        <Brand look={look} size={32} />
        <SearchPill />
        <span className="flex items-center gap-5">
          <span className="font-medium">Become a walker</span>
          <Face name="Andrew Craswell" hue={250} size={34} />
        </span>
      </nav>
      <div className="flex items-center gap-2 px-10 py-4">
        {filters.map((filter, index) => (
          <span
            key={filter}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] ${index === 0 ? "border-(--r-fg) bg-(--r-fg) text-(--r-bg)" : "border-(--r-line)"}`}
          >
            {filter}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-2 rounded-full border border-(--r-line) px-3.5 py-1.5 text-[13px]">
          <SlidersHorizontal className="size-3.5" /> Filters
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-6 pl-10">
        <div className="flex flex-1 flex-col gap-4">
          <span className="flex items-baseline justify-between">
            <span className={`text-[22px] font-semibold ${display}`}>38 walkers near Shoreditch</span>
            <span className="flex items-center gap-1 text-[13px] text-(--r-muted)">
              Recommended <ChevronDown className="size-3.5" />
            </span>
          </span>
          <div className="grid grid-cols-3 gap-x-5 gap-y-6">
            {walkers.map((walker) => (
              <div key={walker.name} className="flex flex-col gap-2.5">
                <span className="relative">
                  <Photo hue={walker.hue} className="aspect-[4/3] rounded-2xl" />
                  {walker.super && (
                    <span className="absolute top-3 left-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-black shadow">
                      Superwalker
                    </span>
                  )}
                  <Heart className="absolute top-3 right-3 size-5 text-white drop-shadow" />
                </span>
                <span className="flex items-center justify-between">
                  <span className="font-semibold">{walker.name}</span>
                  <span className="flex items-center gap-1 text-[13px]">
                    <Star className="size-3.5 fill-current" /> {walker.rating}
                    <span className="text-(--r-muted)">({walker.walks})</span>
                  </span>
                </span>
                <span className="-mt-1.5 text-[13px] text-(--r-muted)">{walker.distance} away, free today</span>
                <span className="text-[14px]">
                  <span className="font-semibold">{walker.price}</span> per walk
                </span>
              </div>
            ))}
          </div>
        </div>
        <WalkMap />
      </div>
    </div>
  )
}

/** A map of the area, with each walker's price on it. */
function WalkMap() {
  return (
    <div className="relative w-[440px] shrink-0 overflow-hidden rounded-tl-2xl border-t border-l border-(--r-line) bg-[oklch(0.95_0.02_120)]">
      <svg width="440" height="700" className="absolute inset-0">
        <path d="M60,120 L230,90 L270,260 L120,300 Z" fill="oklch(0.88 0.08 145)" />
        <path
          d="M-20,520 C120,470 220,560 330,500 S460,430 480,450 L480,560 C380,560 260,640 120,610 S-20,620 -20,600 Z"
          fill="oklch(0.84 0.07 230)"
        />
        {["M0,200 L440,170", "M0,380 L440,420", "M150,0 L190,700", "M330,0 L300,700", "M0,60 L440,330"].map(
          (street) => (
            <g key={street}>
              <path d={street} stroke="oklch(0.87 0.01 90)" strokeWidth="16" fill="none" />
              <path d={street} stroke="white" strokeWidth="12" fill="none" />
            </g>
          )
        )}
      </svg>
      {[
        { x: 90, y: 160, price: "£14", active: true },
        { x: 250, y: 220, price: "£12" },
        { x: 330, y: 330, price: "£15" },
        { x: 170, y: 420, price: "£11" },
        { x: 280, y: 120, price: "£16" },
        { x: 60, y: 350, price: "£13" }
      ].map((pin) => (
        <span
          key={pin.price}
          className={`absolute rounded-full px-3 py-1 text-[13px] font-semibold shadow-[0_4px_12px_rgb(0_0_0/0.18)] ${
            pin.active ? "scale-110 bg-(--r-fg) text-(--r-bg)" : "bg-white text-black"
          }`}
          style={{ left: pin.x, top: pin.y }}
        >
          {pin.price}
        </span>
      ))}
      <span className="absolute top-4 right-4 flex flex-col overflow-hidden rounded-lg bg-white text-black shadow">
        <Plus className="m-2 size-4" />
        <Minus className="m-2 size-4" />
      </span>
    </div>
  )
}

/** The search on a phone. */
export function MobileListings({ look }: { look: Look }) {
  return (
    <div className="flex size-full flex-col overflow-hidden bg-(--r-bg) text-[15px]">
      <PhoneStatus />
      <div className="flex flex-col gap-3 px-5 pt-2">
        <span className="flex items-center justify-between">
          <Brand look={look} size={26} />
          <Face name="Andrew Craswell" hue={250} size={30} />
        </span>
        <span className="flex items-center gap-3 rounded-full border border-(--r-line) bg-(--r-card) px-4 py-3 shadow-sm">
          <Search className="size-5" />
          <span className="flex flex-col">
            <span className="text-[14px] font-semibold">Shoreditch, London</span>
            <span className="text-[12px] text-(--r-muted)">Today, from 5 PM, 1 dog</span>
          </span>
        </span>
        <span className="flex gap-2 overflow-hidden">
          {filters.slice(0, 3).map((filter, index) => (
            <span
              key={filter}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] ${index === 0 ? "border-(--r-fg) bg-(--r-fg) text-(--r-bg)" : "border-(--r-line)"}`}
            >
              {filter}
            </span>
          ))}
        </span>
      </div>
      <div className="flex flex-col gap-6 px-5 pt-5">
        {walkers.slice(0, 2).map((walker) => (
          <div key={walker.name} className="flex flex-col gap-2">
            <span className="relative">
              <Photo hue={walker.hue} className="aspect-[16/11] rounded-2xl" />
              {walker.super && (
                <span className="absolute top-3 left-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-black">
                  Superwalker
                </span>
              )}
            </span>
            <span className="flex items-center justify-between">
              <span className={`font-semibold ${display}`}>{walker.name}</span>
              <span className="flex items-center gap-1 text-[13px]">
                <Star className="size-3.5 fill-current" /> {walker.rating}
              </span>
            </span>
            <span className="-mt-1 text-[13px] text-(--r-muted)">
              {walker.distance} away, <span className="font-semibold text-(--r-fg)">{walker.price}</span> per walk
            </span>
          </div>
        ))}
      </div>
      <PhoneTabs
        tabs={[
          { label: "Explore", icon: Compass },
          { label: "Saved", icon: Heart },
          { label: "Walks", icon: Calendar },
          { label: "Inbox", icon: Inbox },
          { label: "Profile", icon: User }
        ]}
        active="Explore"
      />
    </div>
  )
}

/** A listing: the walker, their reviews, and booking a walk. */
export function Walker({ look }: { look: Look }) {
  const days = Array.from({ length: 30 }, (_, index) => index + 1)
  return (
    <div className="flex size-full flex-col bg-(--r-bg) text-[14px]">
      <nav className="flex h-16 shrink-0 items-center justify-between border-b border-(--r-line) px-10">
        <Brand look={look} size={30} />
        <span className="flex w-[360px] items-center gap-2 rounded-full border border-(--r-line) bg-(--r-card) px-4 py-2 text-[13px] text-(--r-muted)">
          <Search className="size-4" /> Shoreditch, Today, 1 dog
        </span>
        <Face name="Andrew Craswell" hue={250} size={32} />
      </nav>
      <div className="flex gap-12 px-14 pt-8">
        <div className="flex flex-1 flex-col gap-6">
          <div className="grid h-[250px] grid-cols-[2fr_1fr] gap-2 overflow-hidden rounded-2xl">
            <Photo hue={60} className="h-full" />
            <span className="grid grid-rows-2 gap-2">
              <Photo hue={30} />
              <Photo hue={100} />
            </span>
          </div>
          <div className="flex items-start justify-between">
            <span className="flex flex-col gap-1">
              <span className={`text-[34px] font-semibold tracking-tight ${display}`}>Ama Mensah</span>
              <span className="flex items-center gap-1.5 text-(--r-muted)">
                <Star className="size-4 fill-current text-(--r-fg)" />
                <span className="font-semibold text-(--r-fg)">4.98</span> from 212 walks in Shoreditch
              </span>
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-(--r-soft) px-3 py-1.5 text-[13px] font-medium text-(--r-brand)">
              <ShieldCheck className="size-4" /> Superwalker
            </span>
          </div>
          <p className="max-w-[560px] leading-relaxed text-(--r-muted)">
            I've walked dogs around Shoreditch for six years, from tiny puppies to very large lurchers. Every walk is at
            least an hour, with photos along the way.
          </p>
          <span className="flex gap-2">
            {["Puppies", "Big dogs", "First aid trained", "Insured"].map((chip) => (
              <span key={chip} className="rounded-full border border-(--r-line) px-3 py-1 text-[13px]">
                {chip}
              </span>
            ))}
          </span>
        </div>
        <div className="flex w-[380px] shrink-0 flex-col gap-4 rounded-2xl border border-(--r-line) bg-(--r-card) p-6 shadow-[0_20px_50px_-24px_rgb(0_0_0/0.3)]">
          <span className="flex items-baseline justify-between">
            <span>
              <span className={`text-[26px] font-semibold ${display}`}>£14</span>{" "}
              <span className="text-(--r-muted)">per walk</span>
            </span>
            <span className="flex items-center gap-1 text-[13px]">
              <Star className="size-3.5 fill-current" /> 4.98
            </span>
          </span>
          <div className="flex flex-col gap-2 rounded-xl border border-(--r-line) p-3">
            <span className="flex items-center justify-between font-semibold">
              <ChevronLeft className="size-4 text-(--r-muted)" /> November 2026
              <ChevronRight className="size-4 text-(--r-muted)" />
            </span>
            <span className="grid grid-cols-7 text-center text-[11px] text-(--r-faint)">
              {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                <span key={index}>{day}</span>
              ))}
            </span>
            <span className="grid grid-cols-7 gap-y-1 text-center text-[13px]">
              {[undefined, undefined, undefined, undefined, undefined, undefined, ...days].map((day, index) => (
                <span
                  key={index}
                  className={`mx-auto grid size-8 place-items-center rounded-full ${
                    day === 28
                      ? "bg-(--r-brand) font-semibold text-(--r-brand-fg)"
                      : day && day < 28
                        ? "text-(--r-faint)"
                        : ""
                  }`}
                >
                  {day}
                </span>
              ))}
            </span>
          </div>
          <span className="grid grid-cols-4 gap-2 text-center text-[13px]">
            {["4 PM", "5 PM", "6 PM", "7 PM"].map((time) => (
              <span
                key={time}
                className={`rounded-lg border py-2 ${time === "5 PM" ? "border-(--r-fg) font-semibold" : "border-(--r-line)"}`}
              >
                {time}
              </span>
            ))}
          </span>
          <span className="rounded-xl bg-(--r-brand) py-3 text-center text-[15px] font-semibold text-(--r-brand-fg)">
            Request walk
          </span>
          <span className="text-center text-[12px] text-(--r-muted)">You won't be charged until Ama accepts.</span>
        </div>
      </div>
    </div>
  )
}

const columns = [
  {
    title: "Went well",
    hue: 155,
    cards: [
      { text: "Billing shipped a week early", who: "Priya Raman", hue: 162, votes: 6 },
      { text: "Pairing with agents on the plan cards", who: "Jonas Weber", hue: 30, votes: 4, comments: 2 }
    ]
  },
  {
    title: "To improve",
    hue: 70,
    cards: [
      { text: "Preview deploys took 9 minutes on Tuesday", who: "Sam Okafor", hue: 80, votes: 5 },
      { text: "Too many meetings on Thursdays", who: "Lena Fischer", hue: 290, votes: 3 }
    ]
  },
  {
    title: "Ideas",
    hue: 240,
    cards: [
      { text: "A shared folder of design states", who: "Maya Chen", hue: 330, votes: 2, comments: 1 },
      { text: "Demo day every other Friday", who: "Jonas Weber", hue: 30, votes: 7 }
    ]
  },
  {
    title: "Action items",
    hue: 300,
    cards: [{ text: "Cache dependencies in preview builds", who: "Sam Okafor", hue: 80, votes: 0 }]
  }
]

function Cursor({ name, hue, style }: { name: string; hue: number; style: CSSProperties }) {
  return (
    <span className="absolute" style={style}>
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path d="M4 3l7 18 2.5-7.5L21 11z" fill={`oklch(0.62 0.2 ${hue})`} stroke="white" strokeWidth="1.5" />
      </svg>
      <span
        className="ml-4 rounded-full px-2 py-0.5 text-[12px] font-semibold text-white"
        style={{ background: `oklch(0.62 0.2 ${hue})` }}
      >
        {name}
      </span>
    </span>
  )
}

/** A shared retro board, live: cards, votes and teammates' cursors. */
export function Board({ look }: { look: Look }) {
  return (
    <div className="relative flex size-full flex-col bg-(--r-raised) text-[14px]">
      <header className="flex h-16 shrink-0 items-center gap-6 border-b border-(--r-line) bg-(--r-card) px-6">
        <Brand look={look} size={28} />
        <span className="flex items-center gap-1.5 text-[16px] font-semibold">
          Sprint 42 retro <ChevronDown className="size-4 text-(--r-muted)" />
        </span>
        <span className="flex items-center gap-1 rounded-lg bg-(--r-raised) p-1 text-[13px]">
          {["Board", "Notes", "Actions"].map((tab, index) => (
            <span
              key={tab}
              className={`rounded-md px-3 py-1 ${index === 0 ? "bg-(--r-card) font-medium shadow-sm" : "text-(--r-muted)"}`}
            >
              {tab}
            </span>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-4">
          <span className="flex items-center gap-1.5 rounded-full bg-(--r-soft) px-3 py-1 text-[13px] font-medium text-(--r-brand)">
            <Timer className="size-4" /> 4:12
          </span>
          <span className="flex">
            {[
              ["Priya Raman", 162],
              ["Jonas Weber", 30],
              ["Lena Fischer", 290],
              ["Sam Okafor", 80]
            ].map(([name, hue], index) => (
              <span key={name} className={`rounded-full ring-2 ring-(--r-card) ${index ? "-ml-2" : ""}`}>
                <Face name={name as string} hue={hue as number} size={30} />
              </span>
            ))}
          </span>
          <span className="rounded-lg bg-(--r-brand) px-3.5 py-1.5 font-medium text-(--r-brand-fg)">Share</span>
        </span>
      </header>
      <div className="grid flex-1 grid-cols-4 gap-5 p-6">
        {columns.map((column) => (
          <div key={column.title} className="flex flex-col gap-3">
            <span className="flex items-center gap-2 px-1 font-semibold">
              <span className="size-2.5 rounded-full" style={{ background: `oklch(0.65 0.17 ${column.hue})` }} />
              {column.title}
              <span className="font-normal text-(--r-muted)">{column.cards.length}</span>
            </span>
            {column.cards.map((card) => (
              <div
                key={card.text}
                className="flex flex-col gap-4 rounded-xl border border-(--r-line) bg-(--r-card) p-4 shadow-[0_1px_3px_rgb(0_0_0/0.06)]"
                style={{ borderTop: `3px solid oklch(0.7 0.15 ${column.hue})` }}
              >
                <span className="text-[15px] leading-snug">{card.text}</span>
                <span className="flex items-center gap-3 text-[13px] text-(--r-muted)">
                  <Face name={card.who} hue={card.hue} size={24} />
                  <span className="ml-auto flex items-center gap-1">
                    <ThumbsUp className="size-3.5" /> {card.votes}
                  </span>
                  {card.comments && (
                    <span className="flex items-center gap-1">
                      <MessageCircle className="size-3.5" /> {card.comments}
                    </span>
                  )}
                </span>
              </div>
            ))}
            <span className="flex items-center gap-1.5 rounded-xl border border-dashed border-(--r-line) px-4 py-3 text-(--r-muted)">
              <Plus className="size-4" /> Add a card
            </span>
          </div>
        ))}
      </div>
      <div
        className="absolute flex w-[268px] rotate-[-3deg] flex-col gap-3 rounded-xl border border-(--r-line) bg-(--r-card) p-4 shadow-[0_24px_50px_-12px_rgb(0_0_0/0.3)]"
        style={{ left: 640, top: 470, borderTop: "3px solid oklch(0.7 0.15 300)" }}
      >
        <span className="text-[15px]">Move retro to Friday mornings</span>
        <span className="flex items-center gap-2 text-[13px] text-(--r-muted)">
          <Face name="Jonas Weber" hue={30} size={24} /> Jonas is moving this
        </span>
      </div>
      <Cursor name="Jonas" hue={30} style={{ left: 880, top: 520 }} />
      <Cursor name="Priya" hue={162} style={{ left: 300, top: 330 }} />
    </div>
  )
}
