import { hairline, type Member } from "./member.ts"

interface MarqueeProps {
  member: Member
  rect: { x: number; y: number; w: number; h: number }
}

/**
 * Someone's marquee: the area they're dragging out, tinted in their color, with the layers it touches outlined
 * faintly so you can see what they're about to select.
 */
export function Marquee({ member, rect }: MarqueeProps) {
  const { color, ink } = member.palette

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute rounded-[1px]"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        border: `1px solid ${color}`,
        boxShadow: hairline(ink),
        background: `color-mix(in oklch, ${color} 12%, transparent)`
      }}
    />
  )
}
