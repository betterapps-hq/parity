import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { agentPalettes } from "../agent/agent-colors.ts"
import type { Typist } from "../live-room.ts"
import type { Member } from "../multiplayer/member.ts"
import { Outlined } from "../multiplayer/Outlined.tsx"
import { useProject } from "./context.ts"
import { areaSpace, type Box } from "./frame-geometry.ts"
import { nodeInFrames } from "./hit.ts"
import { scheduleOverlay } from "./overlay-scheduler.ts"
import { caretLine, drawnText } from "./text-caret.ts"

const nobody: readonly Typist[] = []

/** How much of the letters' box a caret leaves out, at the top and at the bottom, so it's as tall as a text field's. */
const caretTrim = 0.1
const never = () => () => undefined

/**
 * Where others in a live room are typing (live-room.ts): each one's text outlined in their color with their name, as
 * Multiplayer's Selections stories draw it (PAR-1188), and their caret in that color, in every frame that draws the text
 * they're typing in.
 */
export function RoomTyping() {
  const { room } = useProject()

  const typists = useSyncExternalStore(
    (listener) => room?.subscribeTypists(listener) ?? never(),
    () => room?.typists() ?? nobody
  )

  return typists.map((typist) => <TypistMarks key={typist.id} typist={typist} />)
}

/** What a typist's marks are drawn as in one frame: the text's box, and their caret in it. */
interface Marks {
  box: Box
  caret?: { x: number; y: number; h: number }
}

function TypistMarks({ typist }: { typist: Typist }) {
  const session = useProject()
  const ref = useRef<HTMLDivElement>(null)
  const [marks, setMarks] = useState<Marks[]>([])
  const { design, node, focus } = typist.typing

  useEffect(() => {
    const area = ref.current?.closest<HTMLElement>(".canvas-area")

    if (!area) {
      return undefined
    }

    return scheduleOverlay(area, session, {
      showing: () => true,
      designs: () => new Set([design]),
      measure: () => {
        const space = areaSpace(area)

        // Every frame drawing the text, so each viewport shows where they are; the caret only where the text drawn is
        // as long as the place it's at, since another state or mode can draw other text.
        return nodeInFrames(area, design, node, undefined).map(({ element, rect }): Marks => {
          const box = space.box(rect)
          const line = element && focus <= drawnText(element).length ? caretLine(element, focus) : undefined

          return line
            ? { box, caret: { ...space.point({ x: line.x, y: line.top }), h: line.bottom - line.top } }
            : { box }
        })
      },
      draw: setMarks
    })
  }, [session, design, node, focus])

  const index = Math.max(
    0,
    agentPalettes.findIndex((each) => each.name === typist.palette)
  )

  const member: Member = { name: typist.name, palette: { n: index, ...agentPalettes[index]! } }

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0" data-typist={typist.name}>
      {marks.map(({ box, caret }, at) => (
        <div key={at}>
          <div className="absolute" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
            <Outlined by={[member]} radius={2} className="size-full">
              <span />
            </Outlined>
          </div>
          {caret && (
            // A caret as a text field draws one: thin, a little shorter than the letters' box, blinking once it rests.
            // Keyed by where it is, so it shows steadily again each time it moves.
            <span
              key={`${typist.typing.anchor}:${focus}`}
              aria-hidden
              className="absolute w-[1.5px] animate-[room-caret-blink_1.06s_step-end_0.5s_infinite] motion-reduce:animate-none"
              style={{
                left: caret.x - 0.75,
                top: caret.y + caret.h * caretTrim,
                height: caret.h * (1 - 2 * caretTrim),
                background: member.palette.color
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}
