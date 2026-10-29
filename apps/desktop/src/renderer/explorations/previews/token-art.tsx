import { Ban, Hand, MousePointer2, TextCursor } from "lucide-react"
import {
  createContext,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useRef,
  useState
} from "react"
import { drawn, ms, type PreviewKind, px, type SampleToken } from "./preview-data.ts"

/**
 * The project's own light theme, which designs draw on. Previews of how something looks on a design (shadows, blur,
 * opacity) sit on a sheet of it rather than on Parity's dark chrome, so a shadow reads as it will in the design.
 */
export const paper = {
  sheet: "oklch(1 0 0)",
  edge: "oklch(0.922 0 0)",
  soft: "oklch(0.97 0 0)",
  ink: "oklch(0.145 0 0)",
  muted: "oklch(0.556 0 0)",
  accent: "oklch(0.62 0.19 256)"
}

/** Kinds drawn on the project's sheet; the rest are drawn in Parity's own ink, as diagrams. */
export const onPaper = new Set<PreviewKind>([
  "shadow",
  "inset-shadow",
  "drop-shadow",
  "text-shadow",
  "opacity",
  "blur",
  "backdrop-blur",
  "perspective",
  "font",
  "font-size",
  "font-weight",
  "leading",
  "tracking"
])

export const checker: CSSProperties = {
  backgroundColor: "#fff",
  backgroundImage: "repeating-conic-gradient(oklch(0.88 0 0) 0 25%, transparent 0 50%)",
  backgroundSize: "8px 8px"
}

/** Holds reduced motion on or off for what's inside, so a story can show both without changing the computer's setting. */
export const ReducedMotion = createContext<boolean | undefined>(undefined)

/** Whether the computer asks for reduced motion, as previews then hold still unless played on purpose. */
export function useReducedMotion(): boolean {
  const forced = useContext(ReducedMotion)
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)")
    const change = () => setReduced(query.matches)
    query.addEventListener("change", change)
    return () => query.removeEventListener("change", change)
  }, [])
  return forced ?? reduced
}

/**
 * Runs an animation on an element while `playing`, and cancels it the moment that stops, so nothing moves unless the
 * person is looking at it. The keyframes and timing go in as one key, so a new array each render doesn't restart it.
 */
function usePlayback(
  ref: RefObject<HTMLElement | null>,
  motion: { frames: Keyframe[]; timing: KeyframeAnimationOptions } | undefined,
  playing: boolean
): void {
  const key = motion ? JSON.stringify(motion) : ""
  useEffect(() => {
    const element = ref.current
    if (!element || !key || !playing) return
    const { frames, timing } = JSON.parse(key) as { frames: Keyframe[]; timing: KeyframeAnimationOptions }
    // JSON writes Infinity as null, and every motion here that repeats repeats for as long as it plays.
    if (timing.iterations === null) timing.iterations = Number.POSITIVE_INFINITY
    const animation = element.animate(frames, timing)
    return () => animation.cancel()
  }, [ref, key, playing])
}

/** How long a one-off motion rests at its end before it plays again, while it's still hovered. */
export const rest = 700

/**
 * A motion that ends, played on a loop with a rest between plays: keyframes for one play, spread over the play and
 * the rest. `period` is the whole loop, so motions of different lengths can set off together every time.
 */
function looped(from: Keyframe, to: Keyframe, duration: number, easing: string, period = duration + rest): Keyframe[] {
  const end = duration / period
  return [
    { ...from, offset: 0, easing },
    { ...to, offset: end },
    { ...to, offset: 1 }
  ]
}

const easingKeywords: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1]
}

const bezierAt = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3

/** Points along an easing, time across and progress up, from `cubic-bezier()`, `linear()` or a keyword. */
export function easingPoints(value: string, steps = 48): [number, number][] {
  const bezier = /cubic-bezier\(([^)]+)\)/.exec(value)?.[1]?.split(",").map(Number) ?? easingKeywords[value.trim()]
  if (bezier) {
    const [x1, y1, x2, y2] = bezier as [number, number, number, number]
    return Array.from({ length: steps + 1 }, (_, index) => {
      const t = index / steps
      return [bezierAt(t, x1, x2), bezierAt(t, y1, y2)]
    })
  }
  const stops = /linear\((.+)\)/.exec(value)?.[1]
  if (!stops)
    return [
      [0, 0],
      [1, 1]
    ]
  // Each stop is an output and maybe where it falls; one without a place sits evenly between its neighbours.
  const parsed = stops.split(",").map((stop) => {
    const [output, at] = stop.trim().split(/\s+/)
    return { y: Number(output), x: at ? Number.parseFloat(at) / 100 : undefined }
  })
  parsed[0]!.x ??= 0
  parsed.at(-1)!.x ??= 1
  for (let index = 1; index < parsed.length - 1; index++) {
    if (parsed[index]!.x !== undefined) continue
    const next = parsed.findIndex((stop, at) => at > index && stop.x !== undefined)
    const before = parsed[index - 1]!.x!
    parsed[index]!.x = before + (parsed[next]!.x! - before) / (next - index + 1)
  }
  return parsed.map((stop) => [stop.x!, stop.y])
}

/** An animation shorthand's parts: the keyframes' name, how long, the easing, and whether it repeats. */
export function animationParts(value: string): { name: string; duration: number; easing: string; infinite: boolean } {
  const parts: string[] = value.match(/[\w-]+\([^)]*\)|\S+/g) ?? []
  const duration = parts.map(ms).find((time) => !Number.isNaN(time)) ?? 1000
  const easing = parts.find((part) => /^(cubic-bezier|linear)\(/.test(part) || part in easingKeywords) ?? "ease"
  return { name: parts[0] ?? "", duration, easing, infinite: parts.includes("infinite") }
}

/**
 * The keyframes each sample animation runs. In the app these come from the project's own stylesheet, by the name the
 * token gives, since the keyframes are wherever the token's styles are.
 */
const keyframes: Record<string, Keyframe[]> = {
  spin: [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
  ping: [
    { transform: "scale(1)", opacity: 1 },
    { transform: "scale(2)", opacity: 0, offset: 0.75 },
    { transform: "scale(2)", opacity: 0 }
  ],
  pulse: [{ opacity: 1 }, { opacity: 0.5, offset: 0.5 }, { opacity: 1 }],
  bounce: [
    { transform: "translateY(-25%)", easing: "cubic-bezier(0.8, 0, 1, 1)" },
    { transform: "none", easing: "cubic-bezier(0, 0, 0.2, 1)", offset: 0.5 },
    { transform: "translateY(-25%)" }
  ],
  "fade-in": [
    { opacity: 0, transform: "translateY(4px)" },
    { opacity: 1, transform: "none" }
  ]
}

/** The curve of an easing as an SVG path in a box, progress up. Overshoot past 0 and 1 stays inside the padding. */
export function easingPath(value: string, width: number, height: number, pad = 0.18): string {
  const top = height * pad
  const span = height - top * 2
  return easingPoints(value)
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${(x * width).toFixed(2)},${(top + (1 - y) * span).toFixed(2)}`)
    .join(" ")
}

/**
 * An easing: its curve, with a dot that rides it while playing, left to right in time and up by progress. The dot's
 * two moves are on two elements, one steady and one eased, which is what the curve plots.
 */
export function EasingArt({
  value,
  width,
  height,
  playing,
  duration = 900,
  ghosts = [],
  stroke = 1.5
}: {
  value: string
  width: number
  height: number
  playing: boolean
  duration?: number
  /** Other easings, drawn faintly behind for comparison. */
  ghosts?: string[]
  stroke?: number
}) {
  const across = useRef<HTMLSpanElement>(null)
  const up = useRef<HTMLSpanElement>(null)
  const pad = 0.18
  const top = height * pad
  const span = height - top * 2
  usePlayback(
    across,
    {
      frames: looped({ transform: "translateX(0)" }, { transform: `translateX(${width}px)` }, duration, "linear"),
      timing: { duration: duration + rest, iterations: Number.POSITIVE_INFINITY }
    },
    playing
  )
  usePlayback(
    up,
    {
      frames: looped({ transform: "translateY(0)" }, { transform: `translateY(${-span}px)` }, duration, value),
      timing: { duration: duration + rest, iterations: Number.POSITIVE_INFINITY }
    },
    playing
  )
  const dot = Math.max(4, stroke * 3)
  return (
    <span className="relative block" style={{ width, height }}>
      <svg width={width} height={height} className="absolute inset-0 overflow-visible" aria-hidden>
        <line x1={0} y1={height - top} x2={width} y2={height - top} stroke="currentColor" strokeOpacity={0.15} />
        <line x1={0} y1={top} x2={width} y2={top} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="2 2" />
        {ghosts.map((ghost) => (
          <path
            key={ghost}
            d={easingPath(ghost, width, height, pad)}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.18}
            strokeWidth={1}
          />
        ))}
        <path
          d={easingPath(value, width, height, pad)}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      </svg>
      <span
        ref={across}
        className="absolute left-0"
        style={{ top: height - top - dot / 2, width: dot, height: dot, marginLeft: -dot / 2 }}
      >
        <span
          ref={up}
          className="block size-full rounded-full"
          style={{ background: "var(--canvas-layer)", visibility: playing ? "visible" : "hidden" }}
        />
      </span>
    </span>
  )
}

/** A duration: a dot that crosses its track in that time while playing, with CSS's default easing. */
export function DurationArt({
  value,
  width,
  height,
  playing,
  easing = "ease",
  period
}: {
  value: string
  width: number
  height: number
  playing: boolean
  easing?: string
  /** How long one loop lasts, the same for every duration racing together. */
  period?: number
}) {
  const dot = useRef<HTMLSpanElement>(null)
  const time = ms(value)
  const size = Math.min(8, height - 4)
  const travel = width - size
  const loop = period ?? time + rest
  usePlayback(
    dot,
    {
      frames: looped({ transform: "translateX(0)" }, { transform: `translateX(${travel}px)` }, time, easing, loop),
      timing: { duration: loop, iterations: Number.POSITIVE_INFINITY }
    },
    playing
  )
  return (
    <span className="relative flex items-center" style={{ width, height }}>
      <span className="absolute inset-x-0 h-px bg-current opacity-20" />
      {/* At rest, the track's fill says how long it is against half a second. */}
      <span
        className="absolute left-0 h-[3px] rounded-full bg-current opacity-60"
        style={{ width: `${Math.min(1, time / 500) * 100}%`, visibility: playing ? "hidden" : "visible" }}
      />
      <span
        ref={dot}
        className="absolute left-0 rounded-full"
        style={{
          width: size,
          height: size,
          background: "var(--canvas-layer)",
          visibility: playing ? "visible" : "hidden"
        }}
      />
    </span>
  )
}

/** An animation: a mark that runs the animation's keyframes while playing, and rests at its first frame otherwise. */
export function AnimationArt({ value, size, playing }: { value: string; size: number; playing: boolean }) {
  const mark = useRef<HTMLSpanElement>(null)
  const { name, duration, easing, infinite } = animationParts(value)
  const frames = keyframes[name]
  usePlayback(
    mark,
    frames && {
      frames: infinite ? frames : looped(frames[0]!, frames.at(-1)!, duration, easing),
      timing: infinite
        ? { duration, easing, iterations: Number.POSITIVE_INFINITY }
        : { duration: duration + rest, iterations: Number.POSITIVE_INFINITY }
    },
    playing
  )
  const s = size
  return (
    <span className="relative grid place-items-center" style={{ width: s, height: s }}>
      {name === "spin" ? (
        <span
          ref={mark}
          className="block rounded-full border-2"
          style={{
            width: s * 0.6,
            height: s * 0.6,
            borderColor: "currentColor",
            borderTopColor: "var(--canvas-layer)"
          }}
        />
      ) : name === "ping" ? (
        <>
          <span
            ref={mark}
            className="absolute rounded-full"
            style={{ width: s * 0.36, height: s * 0.36, background: "var(--canvas-layer)", opacity: 0.6 }}
          />
          <span
            className="rounded-full"
            style={{ width: s * 0.36, height: s * 0.36, background: "var(--canvas-layer)" }}
          />
        </>
      ) : name === "bounce" ? (
        <span
          ref={mark}
          className="block rounded-full"
          style={{
            width: s * 0.36,
            height: s * 0.36,
            background: "var(--canvas-layer)",
            transform: "translateY(-25%)"
          }}
        />
      ) : (
        <span
          ref={mark}
          className="block rounded-[3px]"
          style={{ width: s * 0.6, height: s * 0.42, background: "currentColor", opacity: name === "pulse" ? 0.7 : 1 }}
        />
      )}
    </span>
  )
}

/** Draws real-sized art and scales it into its box, as a shadow or blur has to be drawn at full size to look right. */
function Shrunk({
  scale,
  width,
  height,
  children
}: {
  scale: number
  width: number
  height: number
  children: ReactNode
}) {
  return (
    <span className="relative block overflow-hidden" style={{ width, height }}>
      <span
        className="absolute top-1/2 left-1/2 grid place-items-center"
        style={{
          width: width / scale,
          height: height / scale,
          transform: `translate(-50%, -50%) scale(${scale})`
        }}
      >
        {children}
      </span>
    </span>
  )
}

/** The fonts a design uses come from the project's stylesheet; Geist is Parity's too, so it draws here as it would there. */
function fontOf(token: SampleToken): string {
  return drawn(token)
}

/**
 * One token's preview, drawn into a box of any size: the row glyph, a tile and the detail card all draw with it. Motion
 * only moves while `playing`.
 */
export function TokenArt({
  token,
  width,
  height,
  playing = false,
  theme = "default"
}: {
  token: SampleToken
  width: number
  height: number
  playing?: boolean
  theme?: string
}) {
  const value = drawn(token, theme)
  const large = height > 40
  const small = Math.min(width, height)
  switch (token.kind) {
    case "color": {
      return (
        <span className="block size-full" style={{ ...checker, boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.12)" }}>
          <span className="block size-full" style={{ background: value }} />
        </span>
      )
    }
    case "spacing": {
      const length = px(value)
      const room = width - 6
      const shown = Math.max(1, Math.min(room, length))
      return (
        <span className="flex size-full items-center text-muted-foreground">
          <span className="relative flex items-center" style={{ width: shown, height: Math.min(10, height) }}>
            <span className="absolute inset-y-0 left-0 w-px bg-current" />
            <span
              className="absolute inset-x-0 h-1/2 rounded-[1px]"
              style={{ background: "var(--canvas-layer)", opacity: 0.85 }}
            />
            <span className="absolute inset-y-0 right-0 w-px bg-current" />
          </span>
          {/* Longer than the box: it runs on past the edge. */}
          {length > room && (
            <span className="ml-0.5 h-1/2 w-1 bg-gradient-to-r from-(--canvas-layer) to-transparent opacity-60" />
          )}
        </span>
      )
    }
    case "radius": {
      const radius = px(value)
      const corner = small - 4
      if (large) {
        return (
          <span className="grid size-full place-items-center">
            <span
              className="border-2 border-muted-foreground bg-muted-foreground/10"
              style={{ width: width * 0.5, height: height * 0.62, borderRadius: radius }}
            />
          </span>
        )
      }
      return (
        <span className="grid size-full place-items-center">
          <span className="relative overflow-hidden" style={{ width: corner, height: corner }}>
            <span
              className="absolute top-0 left-0 border-t-2 border-l-2 border-muted-foreground bg-muted-foreground/10"
              style={{ width: corner * 2, height: corner * 2, borderTopLeftRadius: Math.min(radius, corner * 2) }}
            />
          </span>
        </span>
      )
    }
    case "border-width":
    case "border": {
      const thickness = px(value.split(" ")[0]!)
      return token.kind === "border" ? (
        <span className="grid size-full place-items-center">
          <span
            className="rounded-[3px]"
            style={{
              width: width * 0.6,
              height: height * 0.62,
              border: `${value} currentColor`,
              color: "var(--muted-foreground)"
            }}
          />
        </span>
      ) : (
        <span className="flex size-full items-center justify-center">
          <span className="rounded-full bg-muted-foreground" style={{ width: width - 8, height: thickness }} />
        </span>
      )
    }
    case "shadow":
    case "inset-shadow": {
      // Shadows are drawn at full size on a card, then the whole sheet is scaled, which scales the shadow with it. The
      // sheet is the design's soft grey, so a white card's edge shows even where the shadow is faint. A row shows the
      // card's corner, nearly full size, so the shadow falls across the box rather than shrinking to a smudge.
      const scale = large ? 1 : 0.75
      const inner = { width: width / scale, height: height / scale }
      return (
        <Shrunk scale={scale} width={width} height={height}>
          <span className="relative block" style={{ ...inner, background: paper.soft }}>
            <span
              className="absolute block rounded-[6px]"
              style={{
                ...(large
                  ? { left: "22%", top: "20%", width: "56%", height: "56%" }
                  : { left: "-30%", top: "-40%", width: "80%", height: "85%" }),
                background: token.kind === "inset-shadow" ? paper.soft : paper.sheet,
                boxShadow: value
              }}
            />
          </span>
        </Shrunk>
      )
    }
    case "drop-shadow": {
      // A drop shadow follows a shape, not its box, so it falls from a star, drawn small enough that a deep one fits.
      const scale = large ? 0.6 : 0.35
      const box = Math.min(width, height) / scale
      return (
        <Shrunk scale={scale} width={width} height={height}>
          <svg
            width={box * 0.6}
            height={box * 0.6}
            viewBox="0 0 24 24"
            style={{ filter: `drop-shadow(${value})`, overflow: "visible", marginTop: -box * 0.18 }}
            aria-hidden
          >
            <path
              d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6z"
              fill={paper.soft}
              stroke={paper.muted}
              strokeOpacity={0.5}
              strokeWidth={0.6}
            />
          </svg>
        </Shrunk>
      )
    }
    case "text-shadow":
      return (
        <span
          className="grid size-full place-items-center font-semibold"
          style={{ color: paper.ink, textShadow: value, fontSize: large ? 40 : 15 }}
        >
          Aa
        </span>
      )
    case "font":
      return (
        <span
          className="grid size-full place-items-center leading-none"
          style={{ fontFamily: fontOf(token), color: paper.ink, fontSize: large ? 34 : 15 }}
        >
          Ag
        </span>
      )
    case "font-size": {
      const size = px(value)
      const shown = large ? Math.min(size, height * 0.8) : Math.min(size, height - 6)
      return (
        <span
          className="flex size-full items-center justify-center overflow-hidden leading-none"
          style={{ color: paper.ink }}
        >
          <span style={{ fontSize: shown }}>Aa</span>
        </span>
      )
    }
    case "font-weight":
      return (
        <span
          className="grid size-full place-items-center leading-none"
          style={{ fontWeight: Number(value), color: paper.ink, fontSize: large ? 34 : 15 }}
        >
          Aa
        </span>
      )
    case "tracking":
      return (
        <span
          className="grid size-full place-items-center leading-none font-medium"
          style={{ letterSpacing: value, color: paper.ink, fontSize: large ? 22 : 10 }}
        >
          ABC
        </span>
      )
    case "leading": {
      // Lines of text as bars, a line height apart, to show how loose the text sits.
      const size = large ? 12 : 5
      const pitch = Number(value) * size
      const lines = Math.max(2, Math.floor((height - 4) / pitch))
      return (
        <span className="flex size-full flex-col justify-center px-[15%]">
          {Array.from({ length: lines }, (_, index) => (
            <span key={index} className="flex items-center" style={{ height: pitch }}>
              <span
                className="rounded-full"
                style={{ height: size * 0.55, width: index === lines - 1 ? "60%" : "100%", background: paper.muted }}
              />
            </span>
          ))}
        </span>
      )
    }
    case "opacity":
      return (
        <span className="grid size-full place-items-center" style={checker}>
          <span
            className="rounded-[3px]"
            style={{ width: width * 0.58, height: height * 0.62, background: paper.ink, opacity: Number(value) }}
          />
        </span>
      )
    case "blur":
    case "backdrop-blur": {
      // Drawn at a third of a 120px-wide element's size, since blur is in pixels: big blurs wipe small things out.
      const scale = width / 120
      const inner = { width: width / scale, height: height / scale }
      return (
        <Shrunk scale={scale} width={width} height={height}>
          {token.kind === "blur" ? (
            <span className="relative block" style={{ ...inner, filter: `blur(${value})` }}>
              <span
                className="absolute rounded-full"
                style={{ left: "22%", top: "18%", width: "34%", aspectRatio: "1", background: "oklch(0.7 0.17 256)" }}
              />
              <span
                className="absolute rounded-[6px]"
                style={{ left: "46%", top: "34%", width: "34%", height: "44%", background: "oklch(0.78 0.16 75)" }}
              />
            </span>
          ) : (
            <span
              className="relative block"
              style={{
                ...inner,
                background:
                  "repeating-linear-gradient(135deg, oklch(0.7 0.17 256) 0 6px, oklch(0.95 0.02 256) 6px 12px)"
              }}
            >
              <span
                className="absolute inset-[20%_14%] rounded-[8px] border border-white/60"
                style={{ backdropFilter: `blur(${value})`, background: "rgb(255 255 255 / 0.35)" }}
              />
            </span>
          )}
        </Shrunk>
      )
    }
    case "perspective": {
      const scale = width / 160
      return (
        <Shrunk scale={scale} width={width} height={height}>
          <span className="block" style={{ perspective: value }}>
            <span
              className="block rounded-[8px] border"
              style={{
                width: 90,
                height: 64,
                transform: "rotateY(42deg)",
                background: paper.soft,
                borderColor: paper.muted,
                boxShadow: "0 1px 3px rgb(0 0 0 / 0.12)"
              }}
            />
          </span>
        </Shrunk>
      )
    }
    case "aspect": {
      const [w, h] = value.split("/").map((part) => Number(part.trim())) as [number, number]
      const fit = Math.min((width - 6) / w, (height - 6) / h)
      return (
        <span className="grid size-full place-items-center">
          <span
            className="rounded-[2px] border-[1.5px] border-muted-foreground bg-muted-foreground/10"
            style={{ width: w * fit, height: h * fit }}
          />
        </span>
      )
    }
    case "duration":
      return (
        <span className="flex size-full items-center px-1 text-muted-foreground">
          <DurationArt value={value} width={width - 8} height={height} playing={playing} />
        </span>
      )
    case "easing":
      return (
        <span className="grid size-full place-items-center text-muted-foreground">
          <EasingArt value={value} width={width - 8} height={height - 2} playing={playing} stroke={large ? 2 : 1.25} />
        </span>
      )
    case "animation":
      return (
        <span className="grid size-full place-items-center text-muted-foreground">
          <AnimationArt value={value} size={Math.min(width, height)} playing={playing} />
        </span>
      )
    case "z-index":
      return <LayersArt token={token} width={width} height={height} />
    case "breakpoint":
    case "container": {
      const widest = token.kind === "breakpoint" ? 1536 : 1280
      const share = Math.min(1, px(value) / widest)
      return token.kind === "breakpoint" ? (
        <span className="relative flex size-full items-center text-muted-foreground">
          <span className="absolute inset-x-0.5 h-px bg-current opacity-30" />
          <span
            className="absolute left-0.5 h-1/2 rounded-[1px]"
            style={{ width: `calc(${share * 100}% - 4px)`, background: "var(--canvas-mode)", opacity: 0.35 }}
          />
          <span
            className="absolute h-3/4 w-[1.5px] rounded-full"
            style={{ left: `calc(${share * 100}% - 2px)`, background: "var(--canvas-mode)" }}
          />
        </span>
      ) : (
        <span className="grid size-full place-items-center">
          <span className="flex h-3/4 w-[calc(100%-4px)] justify-center rounded-[2px] border border-dashed border-muted-foreground/50">
            <span className="h-full rounded-[1px] bg-muted-foreground/30" style={{ width: `${share * 100}%` }} />
          </span>
        </span>
      )
    }
    case "cursor": {
      const Icon = { pointer: Hand, "not-allowed": Ban, text: TextCursor }[value] ?? MousePointer2
      // The box takes the cursor itself, so hovering it shows the real thing.
      return (
        <span className="grid size-full place-items-center text-muted-foreground" style={{ cursor: value }}>
          <Icon className={large ? "size-7" : "size-3.5"} />
        </span>
      )
    }
    case "number":
      // Nothing says what a bare number is for, so a tile shows the number and a row shows nothing.
      return large ? (
        <span className="grid size-full place-items-center font-mono text-2xl text-muted-foreground">{value}</span>
      ) : null
  }
}

/** A z-index among its scale: sheets stacked back to front, with this token's sheet lit at its place in the order. */
function LayersArt({ token, width, height }: { token: SampleToken; width: number; height: number }) {
  // The sample scale is listed top first; where this one falls decides which of four sheets lights up.
  const order = ["tooltip", "toast", "popover", "modal", "overlay", "sticky", "dropdown", "docked", "base", "hide"]
  const rank = order.findIndex((name) => token.name.endsWith(name))
  const lit = rank < 0 ? 0 : Math.round(((order.length - 1 - rank) / (order.length - 1)) * 3)
  const sheet = { width: width * 0.46, height: height * 0.42 }
  return (
    <span className="relative block size-full">
      {[0, 1, 2, 3].map((level) => (
        <span
          key={level}
          className="absolute rounded-[2px] border"
          style={{
            ...sheet,
            left: width * 0.12 + level * width * 0.1,
            top: height * 0.5 - level * height * 0.13,
            background: level === lit ? "var(--canvas-layer)" : "var(--background)",
            borderColor: level === lit ? "var(--canvas-layer)" : "var(--muted-foreground)",
            opacity: level === lit ? 1 : 0.55
          }}
        />
      ))}
    </span>
  )
}

/**
 * What a row shows beside the name: the value in the unit people think in (pixels, milliseconds, percent), or nothing
 * where the preview says it all.
 */
export function valueLabel(token: SampleToken): string | undefined {
  const value = drawn(token)
  switch (token.kind) {
    case "color":
      return undefined
    case "spacing":
    case "radius":
    case "font-size":
    case "breakpoint":
    case "container":
    case "blur":
    case "backdrop-blur":
    case "border-width":
      return Number.isNaN(px(value)) ? value : `${px(value)}px`
    case "opacity":
      return `${Math.round(Number(value) * 100)}%`
    case "leading":
      return `${value}×`
    case "aspect":
      return value.replace(/\s*\/\s*/, ":")
    case "shadow":
    case "inset-shadow":
    case "drop-shadow":
    case "text-shadow":
      return undefined
    case "font":
      return value.split(",")[0]!.replaceAll(/['"]/g, "").replace(" Variable", "")
    case "easing":
      return undefined
    case "animation": {
      const { duration, infinite } = animationParts(value)
      return `${duration}ms${infinite ? ", loops" : ""}`
    }
    default:
      return value
  }
}

/**
 * The preview in a row: a fixed box, so every row's name starts in the same place whatever the kind. Kinds drawn on
 * the design's sheet get the sheet behind them.
 */
export function TokenGlyph({
  token,
  playing = false,
  themes = ["default"]
}: {
  token: SampleToken
  playing?: boolean
  /** Colors show a swatch for each theme. */
  themes?: string[]
}) {
  if (token.kind === "color") {
    return (
      <span className="flex h-5 w-10 shrink-0 overflow-hidden rounded-[4px]">
        {themes.map((theme) => (
          <span key={theme} className="h-full flex-1">
            <TokenArt token={token} width={40 / themes.length} height={20} theme={theme} />
          </span>
        ))}
      </span>
    )
  }
  return (
    <span
      className="relative h-6 w-10 shrink-0 overflow-hidden rounded-[4px]"
      style={
        onPaper.has(token.kind) ? { background: paper.sheet, boxShadow: `inset 0 0 0 1px ${paper.edge}` } : undefined
      }
    >
      <TokenArt token={token} width={40} height={24} playing={playing} />
    </span>
  )
}

/** A larger preview, for the tile view and the detail card. */
export function TokenTile({
  token,
  width = 112,
  height = 64,
  playing = false,
  theme
}: {
  token: SampleToken
  width?: number
  height?: number
  playing?: boolean
  /** One theme; a color shows every theme it has, side by side, without one. */
  theme?: string
}) {
  const themeGiven = theme !== undefined
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-md border"
      style={{
        width,
        height,
        ...(onPaper.has(token.kind)
          ? { background: paper.sheet, borderColor: paper.edge }
          : { background: "var(--muted)" })
      }}
    >
      {token.kind === "color" && !themeGiven ? (
        <span className="flex size-full">
          {Object.keys(token.values).map((each) => (
            <TokenArt
              key={each}
              token={token}
              width={(width - 2) / Object.keys(token.values).length}
              height={height - 2}
              theme={each}
            />
          ))}
        </span>
      ) : (
        <TokenArt token={token} width={width - 2} height={height - 2} playing={playing} theme={theme} />
      )}
    </span>
  )
}
