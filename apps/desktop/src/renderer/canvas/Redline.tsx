/** A distance drawn over the canvas, from and to points on screen. */
export interface Redline {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Layout pixels, as the design sees them. */
  px: number
  /** The spacing step the distance comes to, when it's a whole or half step. */
  steps?: number
}

/** Space between the line and its label, in screen pixels. */
const labelGap = 8

/**
 * Where a redline's label goes: beside the line's midpoint, never on it, so even a line a few pixels long stays in
 * sight. Below a horizontal line, centred on it, and to the right of a vertical one.
 */
export function redlineLabel(line: Redline): { left: number; top: number; transform: string } {
  const mid = { x: (line.x1 + line.x2) / 2, y: (line.y1 + line.y2) / 2 }

  return horizontal(line)
    ? { left: mid.x, top: mid.y + 1 + labelGap, transform: "translateX(-50%)" }
    : { left: mid.x + 1 + labelGap, top: mid.y, transform: "translateY(-50%)" }
}

function horizontal(line: Redline): boolean {
  return Math.abs(line.y2 - line.y1) < 0.5
}

/**
 * A distance between two layers: a red line, and beside it the distance and the spacing step it matches. The label is
 * drawn over the resize handles, which it can reach beside a small selection, and lets presses through to them.
 */
export function RedlineView({ line }: { line: Redline }) {
  const color = line.steps === undefined ? "oklch(0.64 0.21 25)" : "oklch(0.66 0.2 20)"

  const box = horizontal(line)
    ? { left: Math.min(line.x1, line.x2), top: line.y1, width: Math.abs(line.x2 - line.x1), height: 1 }
    : { left: line.x1, top: Math.min(line.y1, line.y2), width: 1, height: Math.abs(line.y2 - line.y1) }

  return (
    <>
      <div className="absolute" style={{ ...box, background: color }} />
      <div
        className="pointer-events-none absolute z-20 flex items-center gap-1 rounded bg-neutral-950 px-1.5 py-px text-2xs font-medium whitespace-nowrap text-white tabular-nums shadow-md ring-1 ring-white/10"
        style={redlineLabel(line)}
      >
        <span className="font-semibold">{formatPx(line.px)}px</span>
        {line.steps === undefined ? (
          <span className="text-amber-300">off scale</span>
        ) : (
          <span className="font-mono text-white/55">spacing-{formatSteps(line.steps)}</span>
        )}
      </div>
    </>
  )
}

export function formatPx(value: number): string {
  const rounded = Math.round(value * 10) / 10

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function formatSteps(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
