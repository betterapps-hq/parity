import { BatteryFull, type LucideIcon, Signal, Wifi } from "lucide-react"
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react"
import type { Look } from "./data.ts"

/** The sizes designs are drawn at, as the canvas draws a desktop frame and a phone frame. */
export const desktop = { width: 1280, height: 800 }
export const phone = { width: 390, height: 844 }

/**
 * A look's colors as variables, so one render draws any app's brand, light or dark. Renders use these instead of
 * Parity's own tokens, because they're other apps.
 */
export function lookVars(look: Look): CSSProperties {
  const h = look.hue
  const c = look.mono ? 0 : 1
  const vars = look.dark
    ? {
        "--r-bg": `oklch(0.155 ${0.012 * c} ${h})`,
        "--r-card": `oklch(0.195 ${0.014 * c} ${h})`,
        "--r-raised": `oklch(0.235 ${0.016 * c} ${h})`,
        "--r-fg": `oklch(0.96 ${0.006 * c} ${h})`,
        "--r-muted": `oklch(0.72 ${0.02 * c} ${h})`,
        "--r-faint": `oklch(0.52 ${0.02 * c} ${h})`,
        "--r-line": "oklch(1 0 0 / 0.08)",
        "--r-brand": `oklch(0.72 ${0.17 * c} ${h})`,
        "--r-brand-2": `oklch(0.68 ${0.17 * c} ${h + 40})`,
        "--r-brand-fg": `oklch(0.17 ${0.03 * c} ${h})`,
        "--r-soft": `oklch(0.72 ${0.17 * c} ${h} / 0.15)`,
        "--r-good": "oklch(0.76 0.15 155)",
        "--r-warn": "oklch(0.82 0.15 78)",
        "--r-bad": "oklch(0.7 0.18 25)"
      }
    : {
        "--r-bg": `oklch(0.985 ${0.004 * c} ${h})`,
        "--r-card": "oklch(1 0 0)",
        "--r-raised": `oklch(0.965 ${0.008 * c} ${h})`,
        "--r-fg": `oklch(0.21 ${0.02 * c} ${h})`,
        "--r-muted": `oklch(0.52 ${0.02 * c} ${h})`,
        "--r-faint": `oklch(0.7 ${0.015 * c} ${h})`,
        "--r-line": `oklch(0.91 ${0.01 * c} ${h})`,
        "--r-brand": look.mono ? "oklch(0.2 0 0)" : `oklch(0.57 0.2 ${h})`,
        "--r-brand-2": look.mono ? "oklch(0.42 0 0)" : `oklch(0.66 0.18 ${h + 40})`,
        "--r-brand-fg": "oklch(1 0 0)",
        "--r-soft": look.mono ? "oklch(0.2 0 0 / 0.06)" : `oklch(0.57 0.2 ${h} / 0.1)`,
        "--r-good": "oklch(0.6 0.15 155)",
        "--r-warn": "oklch(0.7 0.16 70)",
        "--r-bad": "oklch(0.6 0.2 25)"
      }
  return {
    ...vars,
    "--r-display": look.serif ? 'Georgia, "Times New Roman", serif' : "inherit",
    colorScheme: look.dark ? "dark" : "light"
  } as CSSProperties
}

/** Headings in the look's display face. */
export const display = "[font-family:var(--r-display)]"

/**
 * Draws its children at their real size, then scales them to the box's width, as a screenshot would. What's inside
 * can't be reached by the keyboard or a screen reader: it's a picture of a design.
 */
export function Scaled({
  width,
  height,
  className = "",
  style,
  children
}: {
  width: number
  height: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const element = box.current!
    const observer = new ResizeObserver(() => setScale(element.clientWidth / width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [width])
  return (
    <div
      ref={box}
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio: `${width} / ${height}`, ...style }}
    >
      <div
        inert
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 origin-top-left select-none"
        style={{ width, height, transform: `scale(${scale})`, visibility: scale ? undefined : "hidden" }}
      >
        {children}
      </div>
    </div>
  )
}

/** The app's mark: its icon on its brand. */
export function BrandMark({ look, size = 28 }: { look: Look; size?: number }) {
  const Icon = look.icon
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[28%] text-(--r-brand-fg)"
      style={{ width: size, height: size, background: "linear-gradient(135deg, var(--r-brand), var(--r-brand-2))" }}
    >
      <Icon style={{ width: size * 0.56, height: size * 0.56 }} strokeWidth={2.25} />
    </span>
  )
}

/** The mark and the name, as the app's header shows them. */
export function Brand({ look, size = 28 }: { look: Look; size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark look={look} size={size} />
      <span className={`font-semibold tracking-tight ${display}`} style={{ fontSize: size * 0.62 }}>
        {look.brand}
      </span>
    </span>
  )
}

/** Someone in the app's own world, such as a customer: initials on a soft color. */
export function Face({ name, hue, size = 32 }: { name: string; hue: number; size?: number }) {
  const letters = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `oklch(0.86 0.07 ${hue})`,
        color: `oklch(0.35 0.09 ${hue})`
      }}
    >
      {letters}
    </span>
  )
}

/** Points for a series, scaled into a box, with a little room above the highest one. */
export function plot(values: number[], width: number, height: number): [number, number][] {
  const max = Math.max(...values)
  const min = Math.min(...values)
  return values.map((value, index) => [
    (index / (values.length - 1)) * width,
    height - ((value - min) / (max - min || 1)) * height * 0.86 - 2
  ])
}

/** A smooth line through points, as charting libraries draw them. */
export function curve(points: [number, number][]): string {
  let path = `M${points[0]![0]},${points[0]![1]}`
  for (let index = 0; index < points.length - 1; index++) {
    const [x0, y0] = points[index - 1] ?? points[index]!
    const [x1, y1] = points[index]!
    const [x2, y2] = points[index + 1]!
    const [x3, y3] = points[index + 2] ?? points[index + 1]!
    path += ` C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`
  }
  return path
}

/** A phone's status bar: the time, then signal, Wi-Fi and battery. */
export function PhoneStatus() {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between px-7 pt-1 text-[15px] font-semibold">
      9:41
      <span className="flex items-center gap-1.5">
        <Signal className="size-4" strokeWidth={2.5} />
        <Wifi className="size-4" strokeWidth={2.5} />
        <BatteryFull className="size-5" strokeWidth={2} />
      </span>
    </div>
  )
}

/** A phone app's tab bar, with one tab selected. */
export function PhoneTabs({ tabs, active }: { tabs: { label: string; icon: LucideIcon }[]; active: string }) {
  return (
    <div className="mt-auto flex h-[84px] shrink-0 items-start justify-around border-t border-(--r-line) bg-(--r-card) pt-3">
      {tabs.map(({ label, icon: Icon }) => (
        <span
          key={label}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            label === active ? "text-(--r-brand)" : "text-(--r-faint)"
          }`}
        >
          <Icon className="size-6" strokeWidth={label === active ? 2.25 : 1.75} />
          {label}
        </span>
      ))}
    </div>
  )
}

/** A small line chart with no axes. */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  color = "var(--r-brand)"
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
}) {
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path
        d={curve(plot(values, width, height))}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  )
}
