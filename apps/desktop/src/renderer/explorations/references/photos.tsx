import type { ReactNode } from "react"
import type { SamplePhoto, Scene } from "./data.ts"

/*
 * Drawings of the sample photos, where the browser shows Unsplash's. Each is a few flat shapes in the photo's color,
 * enough to tell a coast from a desk, and fills whatever box it's given.
 */

/** A color in the photo's hue, or a grey when it has none. */
function tone(hue: number, lightness: number, chroma: number): string {
  return `oklch(${lightness} ${hue === 0 ? 0 : chroma} ${hue})`
}

function Hills({ hue }: { hue: number }) {
  return (
    <>
      <rect width="120" height="80" fill={`url(#sky-${hue})`} />
      <circle cx="86" cy="26" r="9" fill={tone(hue, 0.96, 0.05)} />
      <path d="M0 58 L28 30 L46 48 L66 24 L96 54 L120 40 V80 H0Z" fill={tone(hue, 0.55, 0.08)} />
      <path d="M0 66 L22 50 L50 62 L78 46 L120 64 V80 H0Z" fill={tone(hue, 0.4, 0.07)} />
      <path d="M0 72 Q30 62 60 72 T120 70 V80 H0Z" fill={tone(hue, 0.28, 0.05)} />
    </>
  )
}

function Coast({ hue }: { hue: number }) {
  return (
    <>
      <rect width="120" height="80" fill={`url(#sky-${hue})`} />
      <rect y="40" width="120" height="40" fill={tone(hue, 0.5, 0.1)} />
      <path d="M0 48 Q20 44 40 48 T80 48 T120 48" stroke={tone(hue, 0.9, 0.03)} strokeWidth="1.5" fill="none" />
      <path d="M0 58 Q24 53 48 58 T96 58 T144 58" stroke={tone(hue, 0.82, 0.04)} strokeWidth="1.5" fill="none" />
      <path d="M0 80 V60 L16 52 L30 64 L44 58 L56 80Z" fill={tone(hue, 0.25, 0.03)} />
    </>
  )
}

const buildings = [
  { x: 4, width: 14, height: 34 },
  { x: 20, width: 12, height: 50 },
  { x: 34, width: 18, height: 28 },
  { x: 54, width: 12, height: 58 },
  { x: 68, width: 16, height: 40 },
  { x: 86, width: 12, height: 52 },
  { x: 100, width: 16, height: 30 }
]

function City({ hue }: { hue: number }) {
  return (
    <>
      <rect width="120" height="80" fill={`url(#sky-${hue})`} />
      {buildings.map((each, index) => (
        <g key={each.x}>
          <rect
            x={each.x}
            y={80 - each.height}
            width={each.width}
            height={each.height}
            fill={tone(hue, index % 2 ? 0.3 : 0.38, 0.05)}
          />
          {Array.from({ length: Math.floor(each.height / 9) }, (_, row) => (
            <rect
              key={row}
              x={each.x + 3}
              y={84 - each.height + row * 9}
              width={each.width - 6}
              height="2"
              fill={tone(hue, 0.85, 0.08)}
              opacity={row % 3 ? 0.35 : 0.8}
            />
          ))}
        </g>
      ))}
    </>
  )
}

function Desk({ hue }: { hue: number }) {
  return (
    <>
      <rect width="120" height="80" fill={tone(hue, 0.86, 0.05)} />
      <rect x="30" y="20" width="60" height="38" rx="3" fill={tone(hue, 0.28, 0.03)} />
      <rect x="34" y="24" width="52" height="26" rx="1.5" fill={tone(hue, 0.7, 0.1)} />
      <rect x="24" y="58" width="72" height="5" rx="2.5" fill={tone(hue, 0.45, 0.03)} />
      <circle cx="104" cy="30" r="8" fill={tone(hue, 0.97, 0.02)} />
      <circle cx="104" cy="30" r="5" fill={tone(hue, 0.4, 0.09)} />
      <rect x="6" y="26" width="16" height="22" rx="1.5" fill={tone(hue, 0.97, 0.02)} />
      <rect x="9" y="31" width="10" height="1.5" fill={tone(hue, 0.6, 0.04)} />
      <rect x="9" y="35" width="7" height="1.5" fill={tone(hue, 0.6, 0.04)} />
    </>
  )
}

function Portrait({ hue }: { hue: number }) {
  return (
    <>
      <rect width="120" height="80" fill={`url(#sky-${hue})`} />
      <ellipse cx="60" cy="92" rx="34" ry="30" fill={tone(hue, 0.32, 0.06)} />
      <rect x="54" y="48" width="12" height="16" fill={tone(hue, 0.7, 0.06)} />
      <circle cx="60" cy="38" r="15" fill={tone(hue, 0.78, 0.06)} />
      <path d="M44 38 Q44 20 60 20 Q76 20 76 38 Q70 28 60 28 Q50 28 44 38Z" fill={tone(hue, 0.25, 0.04)} />
    </>
  )
}

const fronds = [
  { x: 18, y: 86, turn: -28, long: 46 },
  { x: 44, y: 90, turn: -10, long: 62 },
  { x: 72, y: 90, turn: 8, long: 70 },
  { x: 98, y: 88, turn: 26, long: 52 },
  { x: 6, y: 70, turn: -58, long: 30 },
  { x: 114, y: 72, turn: 58, long: 32 },
  { x: 58, y: 96, turn: -34, long: 40 }
]

function Leaves({ hue }: { hue: number }) {
  return (
    <>
      <rect width="120" height="80" fill={tone(hue, 0.9, 0.04)} />
      {fronds.map((each, index) => (
        <ellipse
          key={each.x}
          cx={each.x}
          cy={each.y - each.long / 2}
          rx={each.long / 5}
          ry={each.long / 2}
          transform={`rotate(${each.turn} ${each.x} ${each.y})`}
          fill={tone(hue, index % 2 ? 0.42 : 0.52, 0.12)}
        />
      ))}
    </>
  )
}

function Abstract({ hue }: { hue: number }) {
  return (
    <>
      <rect width="120" height="80" fill={`url(#sky-${hue})`} />
      <circle cx="34" cy="30" r="34" fill={tone(hue + 40, 0.75, 0.16)} opacity="0.7" />
      <circle cx="92" cy="58" r="40" fill={tone(hue - 30, 0.6, 0.18)} opacity="0.6" />
    </>
  )
}

/** An illustration of overlapping flat shapes. */
function Collage({ hue }: { hue: number }) {
  return (
    <>
      <rect width="120" height="80" fill={tone(hue, 0.95, 0.03)} />
      <circle cx="40" cy="36" r="24" fill={tone(hue, 0.7, 0.16)} />
      <rect x="56" y="22" width="40" height="40" rx="4" fill={tone(hue + 60, 0.62, 0.17)} opacity="0.9" />
      <path d="M22 70 L50 30 L78 70Z" fill={tone(hue - 50, 0.5, 0.15)} opacity="0.85" />
      <circle cx="96" cy="20" r="7" fill={tone(hue + 120, 0.8, 0.14)} />
    </>
  )
}

/** An illustration of someone at a desk. */
function Figure({ hue }: { hue: number }) {
  return (
    <>
      <rect width="120" height="80" fill={tone(hue, 0.93, 0.04)} />
      <rect x="18" y="58" width="84" height="4" rx="2" fill={tone(hue, 0.35, 0.05)} />
      <path d="M46 58 Q46 36 60 36 Q74 36 74 58Z" fill={tone(hue, 0.55, 0.16)} />
      <circle cx="60" cy="26" r="9" fill={tone(hue + 40, 0.82, 0.07)} />
      <rect x="66" y="46" width="22" height="12" rx="1.5" fill={tone(hue, 0.3, 0.04)} />
      <path d="M24 58 V44 Q20 38 24 32 Q28 38 24 44" stroke={tone(hue + 100, 0.5, 0.14)} strokeWidth="2" fill="none" />
      <rect x="20" y="52" width="8" height="6" rx="1" fill={tone(hue + 100, 0.45, 0.1)} />
    </>
  )
}

/** A vector of a rocket, on nothing. */
function Rocket({ hue }: { hue: number }) {
  return (
    <>
      <path d="M60 10 Q76 28 72 52 H48 Q44 28 60 10Z" fill={tone(hue, 0.62, 0.19)} />
      <circle cx="60" cy="32" r="6" fill={tone(hue + 180, 0.92, 0.05)} />
      <path d="M48 44 L36 60 L48 56Z M72 44 L84 60 L72 56Z" fill={tone(hue, 0.45, 0.16)} />
      <path d="M54 54 L60 72 L66 54Z" fill={tone(70, 0.82, 0.17)} />
    </>
  )
}

/** A vector of a heart, on nothing. */
function Heart({ hue }: { hue: number }) {
  return (
    <path
      d="M60 68 C28 46 30 18 46 18 C54 18 58 24 60 28 C62 24 66 18 74 18 C90 18 92 46 60 68Z"
      fill={tone(hue, 0.62, 0.2)}
    />
  )
}

/** A vector of a star, on nothing. */
function Star({ hue }: { hue: number }) {
  return (
    <path
      d="M60 12 L68 32 L90 34 L73 48 L79 70 L60 58 L41 70 L47 48 L30 34 L52 32Z"
      fill={tone(hue, 0.78, 0.17)}
      stroke={tone(hue, 0.5, 0.14)}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  )
}

const scenes: Record<Scene, (props: { hue: number }) => ReactNode> = {
  hills: Hills,
  coast: Coast,
  city: City,
  desk: Desk,
  portrait: Portrait,
  leaves: Leaves,
  abstract: Abstract,
  collage: Collage,
  figure: Figure,
  rocket: Rocket,
  heart: Heart,
  star: Star
}

/**
 * A sample's drawing, filling its box and cropped to it, as a photo is. A sample with nothing behind it, as a vector
 * has, sits on the checks that stand for see-through. `at` is how far through a sample video is, from 0 to 1: the
 * drawing drifts out and back over its length, so playing it and scrubbing it both show.
 */
export function PhotoArt({ photo, at = 0 }: { photo: SamplePhoto; at?: number }) {
  const Drawn = scenes[photo.scene]
  const drift = Math.sin(Math.PI * at)

  return (
    <svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice" aria-hidden className="absolute inset-0 size-full">
      <defs>
        <linearGradient id={`sky-${photo.hue}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tone(photo.hue, 0.72, 0.12)} />
          <stop offset="1" stopColor={tone(photo.hue + 30, 0.92, 0.06)} />
        </linearGradient>
        <pattern id="see-through" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="white" />
          <path d="M0 0H5V5H0Z M5 5H10V10H5Z" fill="oklch(0.9 0 0)" />
        </pattern>
      </defs>
      {photo.color === "transparent" && <rect width="120" height="80" fill="url(#see-through)" />}
      <g transform={`translate(${-14 * drift} ${-6 * drift}) scale(${1 + 0.18 * drift})`}>
        <Drawn hue={photo.hue} />
      </g>
    </svg>
  )
}
