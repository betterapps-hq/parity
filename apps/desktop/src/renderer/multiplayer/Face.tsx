import { Avatar, AvatarFallback, AvatarImage } from "@buildkitgg/shadcn-baseui-kit"
import { Sparkles } from "lucide-react"
import { gradient, type Member } from "./member.ts"

/** Someone's initials: two from a face big enough to hold them, else one. */
function initials(member: Member, size: number): string {
  return member.name
    .split(/\s+/)
    .slice(0, size < 22 ? 1 : 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
}

/**
 * Someone's face, round for everyone: a person's picture, or their initials on their gradient; an agent's sparkle on
 * its gradient. Either matches their pointer, and the gradient's style says which they are. It's cut out of whatever
 * it sits on by a ring of `--face-cutout` (the background, unless its surface sets it), so overlapping faces stay
 * apart. Faded while they're away; ringed in their color while you follow them.
 */
export function Face({
  member,
  size = 28,
  away,
  following
}: {
  member: Member
  size?: number
  away?: boolean
  following?: boolean
}) {
  const { palette } = member
  const cutout = "0 0 0 2px var(--face-cutout, var(--background))"
  const edge = `color-mix(in oklch, ${palette.ink} 30%, transparent)`
  const ring = following ? `${cutout}, 0 0 0 3.5px ${palette.color}, 0 0 0 4.5px ${edge}` : cutout
  const type = size > 32 ? "text-sm" : "text-2xs"

  return (
    <span className="relative inline-flex shrink-0 rounded-full" style={{ boxShadow: ring }}>
      <Avatar
        className={`transition-[opacity,filter] duration-300 ${away ? "opacity-45 grayscale" : ""}`}
        style={{ width: size, height: size }}
      >
        {member.photo && <AvatarImage src={member.photo} alt="" />}
        <AvatarFallback
          className={`${type} leading-none font-semibold`}
          style={{ background: gradient(palette, 135), color: palette.ink }}
        >
          {member.agent ? (
            <Sparkles style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={size < 22 ? 2.5 : 2} />
          ) : (
            initials(member, size)
          )}
        </AvatarFallback>
      </Avatar>
    </span>
  )
}
