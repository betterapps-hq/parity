import { AgentBadge, AgentPointer } from "@parity-app/presence-ui"
import type { TLCursorProps } from "tldraw"
import { agentPalettes } from "../agent/agent-colors.ts"

/**
 * Another person's cursor in a live room in development (live-room.ts), drawn as agents' cursors are: the pointer and a
 * badge with their first name, in the palette their presence names as its color. tldraw places it in page coordinates;
 * it glides between the positions the room sends, which come a few dozen milliseconds apart.
 */
export function RoomCursor({ className, point, zoom, color, name }: TLCursorProps) {
  if (!point) {
    return null
  }

  const palette = agentPalettes.find((each) => each.name === color)

  return (
    <div
      data-idle="false"
      className={`group/cursor pointer-events-none absolute top-0 left-0 origin-top-left transition-transform duration-100 ease-linear ${className ?? ""}`}
      style={{ transform: `translate(${point.x}px, ${point.y}px) scale(${1 / zoom})` }}
    >
      <AgentPointer palette={palette} />
      {name && <AgentBadge palette={palette} agent={name} />}
    </div>
  )
}
