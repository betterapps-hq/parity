import type { CSSProperties, ReactNode } from "react"
import { hairline, keyOf, type Member } from "./member.ts"
import { NameTag } from "./NameTag.tsx"

interface OutlinedProps {
  by: Member[]
  children: ReactNode
  className?: string
  /** Dashed, for where something would land rather than where it is. */
  dashed?: boolean
  radius?: number
  /** Which top corner the tags sit on: the end, for a board, whose name is at the start. */
  tagAt?: "start" | "end"
}

/**
 * An outline in someone's color: what they've selected, or what they're moving. Several people on one layer get a
 * ring each, the first nearest, and their tags line up along the top. A hairline of each palette's ink runs outside its
 * ring, so light colors still hold an edge on white.
 */
export function Outlined({ by, children, className = "", dashed, radius = 6, tagAt = "start" }: OutlinedProps) {
  const spread = -2 - (by.length - 1) * 3

  return (
    <div className={`relative ${className}`}>
      {children}
      {by.map((member, index) => {
        const inset = -2 - index * 3

        const style: CSSProperties = {
          inset,
          borderRadius: radius - inset,
          border: `2px ${dashed ? "dashed" : "solid"} ${member.palette.color}`,
          boxShadow: hairline(member.palette.ink)
        }

        return <span key={keyOf(member)} aria-hidden className="pointer-events-none absolute" style={style} />
      })}
      <span
        aria-hidden
        className="pointer-events-none absolute flex gap-px"
        style={{ top: spread - 18, ...(tagAt === "start" ? { left: spread } : { right: spread }) }}
      >
        {by.map((member) => (
          <NameTag key={keyOf(member)} member={member} />
        ))}
      </span>
    </div>
  )
}
