import { HardDrive, House, Minus, Plus, Sparkles, Square, X } from "lucide-react"
import { type CSSProperties, type ReactNode, useId } from "react"
import { agentPalettes } from "../agent/agent-colors.ts"
import { AgentPointer } from "../agent/AgentPointer.tsx"
import { initials, type Person, type Project, type ScreenKind } from "./explore-data.ts"

/** A color from a hue, at the app's usual lightness and chroma for accents. */
export function accent(hue: number, lightness = 0.7, chroma = 0.15): string {
  return `oklch(${lightness} ${chroma} ${hue})`
}

export interface MockTab {
  id: string
  title: string
  /** The pinned home tab shows only its icon. */
  home?: boolean
  /** Unread notifications, on the home tab. */
  badge?: number
}

/**
 * The app window as the explorations need it: the title bar with its menus, tabs and window buttons, and whatever the
 * active tab shows. It isn't wired to the workspace, so any tabs can be drawn; give it the handlers to make the tabs
 * work.
 */
export function ExploreWindow({
  tabs = [],
  active,
  actions,
  menus,
  onSelect,
  onClose,
  onNew,
  children
}: {
  tabs?: MockTab[]
  active?: string
  /** At the end of the title bar, before the window buttons: account, inbox. */
  actions?: ReactNode
  /** Working menus, in place of the drawn ones. */
  menus?: ReactNode
  onSelect?: (id: string) => void
  onClose?: (id: string) => void
  onNew?: () => void
  children: ReactNode
}) {
  return (
    <div className="flex h-screen min-h-[640px] flex-col bg-background text-foreground">
      <div className="flex h-10 shrink-0 items-end gap-0.5 border-b bg-neutral-100 pl-2 dark:bg-[#0a0a0a]">
        <div className="mb-1 flex items-center text-[13px] text-muted-foreground">
          {menus ??
            ["File", "Edit", "View", "Arrange"].map((menu) => (
              <span key={menu} className="rounded-md px-2 py-1">
                {menu}
              </span>
            ))}
        </div>
        {tabs.map((tab) => {
          const selected = tab.id === active
          const label = tab.home ? (
            <House className="size-4" aria-label="Home" />
          ) : (
            <span className="min-w-0 flex-1 truncate">{tab.title}</span>
          )
          return (
            <div
              key={tab.id}
              className={`relative flex h-8 items-center gap-2 rounded-t-lg border border-b-0 text-sm ${
                tab.home ? "w-10 justify-center" : "max-w-56 min-w-32 px-3"
              } ${selected ? "bg-background text-foreground" : "border-transparent text-muted-foreground"} ${
                onSelect && !selected ? "hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5" : ""
              }`}
            >
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(tab.id)}
                  aria-label={tab.home ? "Home" : undefined}
                  aria-current={selected ? "page" : undefined}
                  className={`flex min-w-0 items-center self-stretch text-left outline-none after:absolute after:inset-0 after:rounded-t-lg focus-visible:after:ring-2 focus-visible:after:ring-ring ${
                    tab.home ? "justify-center" : "flex-1"
                  }`}
                >
                  {label}
                </button>
              ) : (
                label
              )}
              {!tab.home &&
                (onClose ? (
                  <button
                    type="button"
                    aria-label={`Close ${tab.title}`}
                    onClick={() => onClose(tab.id)}
                    className="relative z-10 grid size-5 place-items-center rounded-sm opacity-60 outline-none hover:bg-black/10 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : (
                  <X className="size-3.5 opacity-60" />
                ))}
              {!!tab.badge && (
                <span className="pointer-events-none absolute top-1 right-1.5 size-2 rounded-full bg-[oklch(0.68_0.2_25)] ring-2 ring-neutral-100 dark:ring-[#0a0a0a]" />
              )}
              {selected && <span className="absolute inset-x-0 -bottom-px h-px bg-background" />}
            </div>
          )
        })}
        {onNew ? (
          <button
            type="button"
            aria-label="New tab"
            onClick={onNew}
            className="mb-1 ml-1 grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-black/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/5"
          >
            <Plus className="size-4" />
          </button>
        ) : (
          <span className="mb-1 ml-1 grid size-7 place-items-center rounded-md text-muted-foreground">
            <Plus className="size-4" />
          </span>
        )}
        <div className="mb-1 ml-auto flex items-center gap-1 pr-2">{actions}</div>
        <div className="flex h-full items-center text-muted-foreground">
          {[Minus, Square, X].map((Glyph, index) => (
            <span key={index} className="grid h-full w-11 place-items-center">
              <Glyph className={index === 1 ? "size-3" : "size-3.5"} strokeWidth={1.5} />
            </span>
          ))}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  )
}

/** Someone's initials in their color, or a sparkle for an agent. */
export function Avatar({ person, size = 24, className = "" }: { person: Person; size?: number; className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: person.agent
          ? `linear-gradient(135deg, ${accent(person.hue, 0.72, 0.16)}, ${accent(person.hue + 50, 0.62, 0.18)})`
          : accent(person.hue, 0.6, 0.13)
      }}
      title={person.name}
    >
      {person.agent ? <Sparkles style={{ width: size * 0.5, height: size * 0.5 }} /> : initials(person)}
    </span>
  )
}

/** A few people, overlapping. */
export function AvatarStack({ people, size = 22, max = 4 }: { people: Person[]; size?: number; max?: number }) {
  const shown = people.slice(0, max)
  return (
    <span className="flex items-center">
      {shown.map((person, index) => (
        <Avatar
          key={person.name}
          person={person}
          size={size}
          className={`ring-2 ring-background ${index > 0 ? "-ml-1.5" : ""}`}
        />
      ))}
      {people.length > max && (
        <span className="-ml-1.5 grid place-items-center rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground ring-2 ring-background">
          +{people.length - max}
        </span>
      )}
    </span>
  )
}

/** Parity's mark: an equals sign in a rounded square, design and code at parity. */
/**
 * Parity's icon, the brackets around a component, as drawn in /brand: up to 40 pixels the small drawing, with heavier
 * lines and no glow, and above that the full one.
 */
export function ParityMark({ size = 32 }: { size?: number }) {
  const id = `parity-${useId().replaceAll(/[^\w-]/g, "")}`
  const full = size > 40
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="none" aria-label="Parity">
      <defs>
        <linearGradient id={`${id}-tile`} x1="96" y1="48" x2="928" y2="976" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8A74FF" />
          <stop offset="0.5" stopColor="#5432E6" />
          <stop offset="1" stopColor="#2C129E" />
        </linearGradient>
        <radialGradient id={`${id}-sheen`} cx="0.25" cy="0" r="0.85">
          <stop stopColor="#FFFFFF" stopOpacity="0.24" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-glow`} x1="425" y1="425" x2="599" y2="599" gradientUnits="userSpaceOnUse">
          <stop stopColor="#54D8F4" />
          <stop offset="0.5" stopColor="#7A7EFF" />
          <stop offset="1" stopColor="#D85CE1" />
        </linearGradient>
        <filter
          id={`${id}-halo`}
          x="0"
          y="0"
          width="1024"
          height="1024"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="46" />
        </filter>
      </defs>
      <rect width="1024" height="1024" rx="232" fill={`url(#${id}-tile)`} />
      {full ? (
        <>
          <rect width="1024" height="1024" rx="232" fill={`url(#${id}-sheen)`} />
          <rect x="2" y="2" width="1020" height="1020" rx="230" stroke="#FFFFFF" strokeOpacity="0.14" strokeWidth="4" />
          <path
            d="M468 266L222 512L468 758M556 266L802 512L556 758"
            stroke="#FFFFFF"
            strokeWidth="60"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M512 425L599 512L512 599L425 512Z"
            fill={`url(#${id}-glow)`}
            stroke={`url(#${id}-glow)`}
            strokeWidth="72"
            strokeLinejoin="round"
            opacity="0.9"
            filter={`url(#${id}-halo)`}
          />
          <path
            d="M512 425L599 512L512 599L425 512Z"
            fill="#FFFFFF"
            stroke="#FFFFFF"
            strokeWidth="42"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <path
            d="M432 306L226 512L432 718M592 306L798 512L592 718"
            stroke="#FFFFFF"
            strokeWidth="112"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M512 448L576 512L512 576L448 512Z"
            fill="#FFFFFF"
            stroke="#FFFFFF"
            strokeWidth="56"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  )
}

export function GitHubMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} aria-label="GitHub">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

export function AzureDevOpsMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-label="Azure DevOps">
      <path
        fill="#2D8CE0"
        d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z"
      />
    </svg>
  )
}

export function GoogleMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Google">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

export function MicrosoftMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Microsoft">
      <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022" />
      <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00" />
      <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900" />
    </svg>
  )
}

/** Where a project lives: GitHub, Azure DevOps or a folder on this computer. */
export function SourceIcon({ type, className = "size-3.5" }: { type: Project["source"]["type"]; className?: string }) {
  if (type === "github") return <GitHubMark className={className} />
  if (type === "azure") return <AzureDevOpsMark className={className} />
  return <HardDrive className={className} />
}

/** Colors for a miniature screen. */
function screenColors(hue: number, dark: boolean) {
  return {
    page: dark ? "#141417" : "#ffffff",
    panel: dark ? "#1d1d22" : "#f4f4f5",
    ink: dark ? "#3a3a42" : "#d4d4d8",
    faint: dark ? "#2a2a30" : "#e7e7ea",
    accent: accent(hue, dark ? 0.72 : 0.62, 0.16),
    tint: `color-mix(in oklch, ${accent(hue, 0.7, 0.16)} ${dark ? 22 : 16}%, ${dark ? "#141417" : "#ffffff"})`
  }
}

type Colors = ReturnType<typeof screenColors>

function Bar({
  w,
  h = "5%",
  c,
  r = 999,
  style
}: {
  w: string
  h?: string
  c: string
  r?: number
  style?: CSSProperties
}) {
  return <div className="shrink-0" style={{ width: w, height: h, background: c, borderRadius: r, ...style }} />
}

/** A screen of the given kind, drawn small in plain blocks: enough to tell a dashboard from a docs page at a glance. */
export function MiniScreen({ kind, hue, dark = false }: { kind: ScreenKind; hue: number; dark?: boolean }) {
  const c = screenColors(hue, dark)
  return (
    <div className="absolute inset-0 flex overflow-hidden" style={{ background: c.page }}>
      {screens[kind](c)}
    </div>
  )
}

const screens: Record<ScreenKind, (c: Colors) => ReactNode> = {
  marketing: (c) => (
    <div className="flex size-full flex-col items-center gap-[7%] p-[5%]">
      <div className="flex w-full items-center gap-[4%]">
        <div className="aspect-square w-[6%] rounded-[3px]" style={{ background: c.accent }} />
        <Bar w="9%" c={c.ink} style={{ height: 4 }} />
        <Bar w="9%" c={c.ink} style={{ height: 4 }} />
        <Bar w="9%" c={c.ink} style={{ height: 4 }} />
        <div className="ml-auto" />
        <Bar w="14%" c={c.accent} style={{ height: 8 }} />
      </div>
      <div className="mt-[3%] flex w-full flex-col items-center gap-[4%]">
        <Bar w="62%" c={c.ink} style={{ height: 9 }} />
        <Bar w="44%" c={c.ink} style={{ height: 9 }} />
        <Bar w="30%" c={c.faint} style={{ height: 4, marginTop: 4 }} />
        <Bar w="18%" c={c.accent} style={{ height: 10, marginTop: 6 }} />
      </div>
      <div className="mt-auto flex w-full gap-[4%]" style={{ height: "28%" }}>
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex-1 rounded-[4px]" style={{ background: index === 1 ? c.tint : c.panel }} />
        ))}
      </div>
    </div>
  ),
  dashboard: (c) => (
    <div className="flex size-full">
      <div className="flex w-[20%] flex-col gap-[6%] p-[4%]" style={{ background: c.panel }}>
        <Bar w="60%" c={c.accent} style={{ height: 6 }} />
        {[70, 55, 80, 60, 50].map((w, index) => (
          <Bar
            key={index}
            w={`${w}%`}
            c={index === 1 ? c.accent : c.ink}
            style={{ height: 4, opacity: index === 1 ? 0.8 : 1 }}
          />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-[5%] p-[4%]">
        <Bar w="34%" c={c.ink} style={{ height: 7 }} />
        <div className="flex gap-[4%]" style={{ height: "18%" }}>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="flex flex-1 flex-col justify-end gap-1 rounded-[4px] p-[4%]"
              style={{ background: c.panel }}
            >
              <Bar w="50%" c={index === 0 ? c.accent : c.ink} style={{ height: 5 }} />
            </div>
          ))}
        </div>
        <div className="flex items-end gap-[3%] rounded-[4px] p-[4%]" style={{ height: "34%", background: c.panel }}>
          {[40, 62, 48, 75, 58, 88, 70, 95].map((h, index) => (
            <div
              key={index}
              className="flex-1 rounded-t-[2px]"
              style={{ height: `${h}%`, background: index === 7 ? c.accent : c.tint }}
            />
          ))}
        </div>
        <div className="flex flex-col gap-[10%]" style={{ height: "18%" }}>
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex gap-[6%]">
              <Bar w="30%" c={c.faint} style={{ height: 4 }} />
              <Bar w="20%" c={c.faint} style={{ height: 4 }} />
              <Bar w="12%" c={index === 0 ? c.tint : c.faint} style={{ height: 4 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
  docs: (c) => (
    <div className="flex size-full">
      <div className="flex w-[22%] flex-col gap-[5%] border-r p-[4%]" style={{ borderColor: c.faint }}>
        <Bar w="70%" c={c.ink} style={{ height: 5 }} />
        {[60, 75, 50, 65, 55, 70].map((w, index) => (
          <Bar
            key={index}
            w={`${w}%`}
            c={index === 2 ? c.accent : c.faint}
            style={{ height: 4, marginLeft: index > 1 ? "12%" : 0 }}
          />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-[4%] p-[5%]">
        <Bar w="20%" c={c.accent} style={{ height: 4 }} />
        <Bar w="58%" c={c.ink} style={{ height: 9 }} />
        {[92, 86, 90, 70].map((w, index) => (
          <Bar key={index} w={`${w}%`} c={c.faint} style={{ height: 4 }} />
        ))}
        <div className="rounded-[4px] p-[4%]" style={{ background: dark(c) ? "#0c0c0e" : "#18181b", height: "26%" }}>
          <Bar w="40%" c={c.accent} style={{ height: 4, opacity: 0.8 }} />
          <Bar w="60%" c="#3f3f46" style={{ height: 4, marginTop: 6 }} />
          <Bar w="30%" c="#3f3f46" style={{ height: 4, marginTop: 6 }} />
        </div>
        {[88, 64].map((w, index) => (
          <Bar key={index} w={`${w}%`} c={c.faint} style={{ height: 4 }} />
        ))}
      </div>
    </div>
  ),
  game: (c) => (
    <div className="flex size-full flex-col">
      <div className="flex items-center gap-[4%] px-[5%] py-[3%]" style={{ background: c.panel }}>
        <Bar w="14%" c={c.accent} style={{ height: 6 }} />
        <div className="ml-auto" />
        <Bar w="10%" c={c.ink} style={{ height: 5 }} />
        <Bar w="10%" c={c.ink} style={{ height: 5 }} />
      </div>
      <div
        className="grid flex-1 grid-cols-4 gap-[4%] p-[6%]"
        style={{ background: `linear-gradient(180deg, ${c.tint}, ${c.page})` }}
      >
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="rounded-[5px]"
            style={{
              background: index < 5 ? c.accent : c.panel,
              opacity: index < 5 ? 1 - index * 0.12 : 1,
              outline: index === 4 ? `2px solid ${c.page}` : undefined
            }}
          />
        ))}
      </div>
    </div>
  ),
  library: (c) => (
    <div className="grid size-full grid-cols-3 gap-[5%] p-[7%]">
      <div className="flex items-center justify-center rounded-[4px]" style={{ background: c.panel }}>
        <Bar w="60%" c={c.accent} style={{ height: 10 }} />
      </div>
      <div className="flex items-center justify-center rounded-[4px]" style={{ background: c.panel }}>
        <div className="h-[10px] w-[60%] rounded-full border" style={{ borderColor: c.ink }} />
      </div>
      <div className="flex items-center justify-center rounded-[4px]" style={{ background: c.panel }}>
        <div
          className="flex h-[10px] w-[34%] items-center justify-end rounded-full p-[2px]"
          style={{ background: c.accent }}
        >
          <div className="aspect-square h-full rounded-full bg-white" />
        </div>
      </div>
      <div className="col-span-2 flex items-center gap-[6%] rounded-[4px] px-[8%]" style={{ background: c.panel }}>
        <div className="h-[10px] flex-1 rounded-[3px] border" style={{ borderColor: c.ink, background: c.page }} />
        <Bar w="22%" c={c.ink} style={{ height: 10 }} r={3} />
      </div>
      <div className="flex flex-col items-center justify-center gap-1 rounded-[4px]" style={{ background: c.tint }}>
        <Bar w="44%" c={c.accent} style={{ height: 5 }} />
        <Bar w="60%" c={c.ink} style={{ height: 4 }} />
      </div>
    </div>
  ),
  chat: (c) => (
    <div className="flex size-full">
      <div className="flex w-[24%] flex-col gap-[6%] p-[4%]" style={{ background: c.panel }}>
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="rounded-[3px] p-[8%]"
            style={{ background: index === 0 ? c.tint : "transparent" }}
          >
            <Bar w="70%" c={index === 0 ? c.accent : c.ink} style={{ height: 4 }} />
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col justify-end gap-[5%] p-[5%]">
        <div className="self-start rounded-[6px] p-[3%]" style={{ background: c.panel, width: "52%" }}>
          <Bar w="80%" c={c.ink} style={{ height: 4 }} />
          <Bar w="55%" c={c.ink} style={{ height: 4, marginTop: 4 }} />
        </div>
        <div className="self-end rounded-[6px] p-[3%]" style={{ background: c.accent, width: "40%" }}>
          <Bar w="80%" c="rgb(255 255 255 / 0.7)" style={{ height: 4 }} />
        </div>
        <div className="self-start rounded-[6px] p-[3%]" style={{ background: c.panel, width: "60%" }}>
          <Bar w="90%" c={c.ink} style={{ height: 4 }} />
          <Bar w="70%" c={c.ink} style={{ height: 4, marginTop: 4 }} />
          <Bar w="40%" c={c.ink} style={{ height: 4, marginTop: 4 }} />
        </div>
        <div className="mt-[3%] flex items-center rounded-full border px-[3%] py-[2%]" style={{ borderColor: c.ink }}>
          <Bar w="40%" c={c.faint} style={{ height: 4 }} />
          <div className="ml-auto aspect-square w-[6%] rounded-full" style={{ background: c.accent }} />
        </div>
      </div>
    </div>
  ),
  marketplace: (c) => (
    <div className="flex size-full flex-col gap-[5%] p-[5%]">
      <div className="flex items-center gap-[3%]">
        <div className="h-[12px] flex-1 rounded-full border" style={{ borderColor: c.ink }} />
        <Bar w="12%" c={c.accent} style={{ height: 12 }} />
      </div>
      <div className="flex gap-[3%]">
        {[14, 18, 12, 16].map((w, index) => (
          <Bar key={index} w={`${w}%`} c={index === 0 ? c.tint : c.panel} style={{ height: 7 }} />
        ))}
      </div>
      <div className="grid flex-1 grid-cols-3 gap-[4%]">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="flex flex-col gap-[6%]">
            <div
              className="flex-1 rounded-[4px]"
              style={{ background: `linear-gradient(140deg, ${c.tint}, ${index % 2 ? c.panel : c.accent})` }}
            />
            <Bar w="70%" c={c.ink} style={{ height: 4 }} />
          </div>
        ))}
      </div>
    </div>
  ),
  collab: (c) => (
    <div className="flex size-full flex-col gap-[4%] p-[6%]">
      <div className="flex items-center">
        <Bar w="30%" c={c.ink} style={{ height: 7 }} />
        <div className="ml-auto flex">
          {[c.accent, accent(162), accent(30)].map((color, index) => (
            <div
              key={index}
              className="aspect-square w-[12px] rounded-full ring-2"
              style={{ background: color, marginLeft: index ? -3 : 0, ["--tw-ring-color" as string]: c.page }}
            />
          ))}
        </div>
      </div>
      {[92, 84, 88].map((w, index) => (
        <Bar key={index} w={`${w}%`} c={c.faint} style={{ height: 4 }} />
      ))}
      <div className="flex items-center gap-[1%]">
        <Bar w="36%" c={c.faint} style={{ height: 4 }} />
        <Bar w="30%" c={c.tint} style={{ height: 8 }} r={2} />
        <div className="h-[11px] w-[2px]" style={{ background: c.accent }} />
      </div>
      {[90, 76].map((w, index) => (
        <Bar key={index} w={`${w}%`} c={c.faint} style={{ height: 4 }} />
      ))}
      <div
        className="mt-[2%] rounded-[5px] border p-[3%]"
        style={{ borderColor: c.faint, background: c.panel, width: "56%" }}
      >
        <Bar w="60%" c={c.ink} style={{ height: 4 }} />
        <Bar w="85%" c={c.faint} style={{ height: 4, marginTop: 4 }} />
      </div>
    </div>
  )
}

function dark(c: Colors): boolean {
  return c.page === "#141417"
}

/**
 * A project at a glance: its main screen and its phone screen, as boards on a dark canvas. Agents working in it show
 * their arrows.
 */
export function ProjectThumb({ project, className = "" }: { project: Project; className?: string }) {
  const glow = accent(project.hue, 0.6, 0.14)
  return (
    <div
      className={`relative aspect-[16/10] overflow-hidden rounded-lg bg-[#0f0f12] ${className}`}
      style={{
        backgroundImage: `radial-gradient(120% 90% at 30% 0%, color-mix(in oklch, ${glow} 16%, transparent), transparent 70%)`
      }}
    >
      <div className="absolute top-[15%] left-[8%] aspect-[16/10] w-[60%] overflow-hidden rounded-[5px] shadow-[0_8px_24px_rgb(0_0_0/0.45)] ring-1 ring-white/5">
        <MiniScreen kind={project.kind} hue={project.hue} />
      </div>
      <div className="absolute top-[24%] right-[10%] aspect-[9/18] w-[17%] overflow-hidden rounded-[5px] shadow-[0_8px_24px_rgb(0_0_0/0.45)] ring-1 ring-white/5">
        <MiniScreen kind={project.kind} hue={project.hue} dark />
      </div>
      {project.agents?.map((agent, index) => (
        <div key={agent.name} className="absolute" style={{ left: `${46 + index * 14}%`, top: `${52 - index * 10}%` }}>
          <AgentPointer palette={agentPalettes[(index * 6 + 7) % agentPalettes.length]} />
        </div>
      ))}
    </div>
  )
}

/** A template as a single screen floating in its color; the blank one as an empty frame. */
export function TemplateArt({
  kind,
  hue,
  className = ""
}: {
  kind: ScreenKind | "blank"
  hue: number
  className?: string
}) {
  return (
    <div
      className={`relative aspect-[16/10] overflow-hidden rounded-lg bg-[#0f0f12] ${className}`}
      style={{
        backgroundImage: `radial-gradient(90% 80% at 50% 110%, color-mix(in oklch, ${accent(hue, 0.6, 0.16)} 40%, transparent), transparent 70%)`
      }}
    >
      {kind === "blank" ? (
        <div className="absolute inset-x-[18%] top-[16%] bottom-[-6%] grid place-items-center rounded-t-md border border-dashed border-white/15">
          <Plus className="size-5 text-white/40" />
        </div>
      ) : (
        <div className="absolute inset-x-[14%] top-[14%] bottom-[-8%] overflow-hidden rounded-t-md shadow-[0_10px_30px_rgb(0_0_0/0.5)] ring-1 ring-white/10">
          <MiniScreen kind={kind} hue={hue} dark />
        </div>
      )}
    </div>
  )
}
