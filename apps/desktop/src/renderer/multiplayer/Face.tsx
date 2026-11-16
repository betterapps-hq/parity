import { Avatar, AvatarFallback, AvatarImage } from "@buildkitgg/shadcn-baseui-kit"
import { Eye, Sparkles } from "lucide-react"
import { gradient, type Member } from "./member.ts"

function initials(member: Member): string {
  return member.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
}

/**
 * Someone's face: a person's is round, their picture or their initials on their color; an agent's is a rounded square,
 * a sparkle on its gradient. Either matches their pointer. Faded while they're away; ringed in their color, with an
 * eye, while you follow them.
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
  const ring = following ? `0 0 0 2px var(--background), 0 0 0 4px ${palette.color}` : "0 0 0 2px var(--background)"
  const corners = member.agent ? "rounded-[30%]" : "rounded-full"
  const avatarCorners = member.agent ? "rounded-[30%] after:rounded-[30%]" : ""

  return (
    <span className={`relative inline-flex shrink-0 ${corners}`} style={{ boxShadow: ring }}>
      <Avatar
        className={`${avatarCorners} transition-[opacity,filter] duration-300 ${away ? "opacity-40 grayscale-[0.6]" : ""}`}
        style={{ width: size, height: size }}
      >
        {member.photo && <AvatarImage src={member.photo} alt="" className={corners} />}
        <AvatarFallback
          className={`${corners} font-semibold`}
          style={{
            background: gradient(palette, 135),
            color: palette.ink,
            fontSize: Math.round(size * 0.38)
          }}
        >
          {member.agent ? <Sparkles style={{ width: size * 0.5, height: size * 0.5 }} /> : initials(member)}
        </AvatarFallback>
      </Avatar>
      {following && (
        <span
          className="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full ring-2 ring-background"
          style={{ background: palette.color, color: palette.ink }}
        >
          <Eye className="size-2.5" strokeWidth={2.5} />
        </span>
      )}
    </span>
  )
}
