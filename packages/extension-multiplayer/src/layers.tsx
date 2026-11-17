import { useBox, useCamera } from "@parity-app/canvas-layer"
import type { NodeRef } from "@parity-app/extension"
import type { Camera, Rect } from "@parity-app/extension/internal"
import {
  FaceStack,
  FollowLayer,
  Marquee,
  type Member,
  Outlined,
  type Presence,
  RemotePointer
} from "@parity-app/presence-ui"
import { type ReactNode, useSyncExternalStore } from "react"
import type { Follow } from "./follow.ts"
import { caretMark, marqueeRect, type People, type RoomPerson, selectionsByNode } from "./people.ts"

/*
 * What the room draws on the canvas (docs/proposals/extensions-in-the-window.md, "The multiplayer extension"), from
 * presence-ui's components, each person in the palette the room assigned them: their pointers with first-name badges,
 * what they've selected or are typing in outlined in their color with their caret, their marquees, the avatar stack with each person's
 * card, and following's frame and banner. Page layers keep what they draw the same size on screen by scaling it by
 * `1 / zoom`.
 */

function usePeople(people: People): readonly RoomPerson[] {
  return useSyncExternalStore(people.subscribe, people.get)
}

/** Someone, as presence-ui draws them, in the palette the room assigned them. */
function memberOf(people: People, person: Pick<RoomPerson, "peer" | "name">): Member {
  return { id: person.peer, name: person.name, palette: people.paletteOf(person.peer) }
}

/** A box on the page whose children are drawn at screen size: placed and sized with the camera, scaled by `1 / zoom`. */
function AtScreenSize({ rect, zoom, children }: { rect: Rect; zoom: number; children: ReactNode }) {
  return (
    <div
      className="absolute origin-top-left"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width * zoom,
        height: rect.height * zoom,
        transform: `scale(${1 / zoom})`
      }}
    >
      {children}
    </div>
  )
}

/** Everyone's pointers, gliding between the positions sent, in the `overSelection` layer. */
export function Pointers({ people }: { people: People }) {
  const everyone = usePeople(people)
  const { zoom } = useCamera()

  return (
    <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${1 / zoom})` }}>
      {everyone.map((person) =>
        person.pointer ? (
          <PersonPointerAt key={person.peer} member={memberOf(people, person)} person={person} zoom={zoom} />
        ) : null
      )}
    </div>
  )
}

function PersonPointerAt({ member, person, zoom }: { member: Member; person: RoomPerson; zoom: number }) {
  const pointer = person.pointer!
  const gesture = person.gesture

  return (
    <RemotePointer
      member={member}
      at={{ x: pointer.at.x * zoom, y: pointer.at.y * zoom }}
      offCanvas={!pointer.over}
      detail={gesture?.kind === "text" ? "Typing…" : undefined}
      pressed={gesture !== undefined && gesture.kind !== "text"}
      // While they drag, what they move carries their name.
      badge={gesture?.kind !== "move"}
      stepMs={40}
    />
  )
}

/** Where a dragged node is drawn: as a board or inside one, in the state and mode it shows. */
interface Placing {
  in: "board" | "node"
  state?: string
  mode?: string
  caret?: number
}

/** What everyone has selected, and where they're typing, outlined in their colors, in the `overDesigns` layer. */
export function Selections({ people }: { people: People }) {
  const everyone = usePeople(people)
  const { zoom } = useCamera()
  const selected = selectionsByNode(everyone)

  const typing = everyone.flatMap((person) =>
    person.gesture?.kind === "text"
      ? [{ person, ref: person.gesture.ref, frame: person.gesture.frame, caret: person.gesture.caret }]
      : []
  )

  return (
    <>
      {selected.map(({ ref, by }) => (
        <SelectionOutline
          key={`${ref.owner}:${ref.type}:${ref.key}`}
          nodeRef={ref}
          by={by}
          members={by.map((person) => memberOf(people, person))}
          zoom={zoom}
        />
      ))}
      {typing.map(({ person, ref, frame, caret }) => (
        <SelectionOutline
          key={`typing:${person.peer}`}
          nodeRef={ref}
          by={[person]}
          members={[memberOf(people, person)]}
          zoom={zoom}
          state={frame?.state}
          mode={frame?.mode}
          caret={caret}
        />
      ))}
    </>
  )
}

function SelectionOutline({
  nodeRef,
  by,
  members,
  zoom,
  state,
  mode,
  caret
}: {
  nodeRef: NodeRef
  by: RoomPerson[]
  members: Member[]
  zoom: number
  state?: string | undefined
  mode?: string | undefined
  /** Where they're typing: their caret is drawn at `focus`. */
  caret?: { anchor: number; focus: number } | undefined
}) {
  const board = nodeRef.type === "design"
  // A layer's outline is drawn in the frame the first of them sees it in.
  const viewing = by[0]?.viewing
  const design = board ? nodeRef.key : nodeRef.key.slice(0, nodeRef.key.indexOf("/"))
  const seen = viewing?.design === design ? viewing : undefined
  const options: Placing = { in: board ? "board" : "node" }
  const inState = state ?? seen?.state
  const inMode = mode ?? seen?.mode

  if (inState !== undefined) {
    options.state = inState
  }

  if (inMode !== undefined) {
    options.mode = inMode
  }

  if (caret) {
    options.caret = caret.focus
  }

  const box = useBox(nodeRef, options)

  if (box.kind !== "drawn") {
    return null
  }

  const mark = box.caret && caretMark(box.caret, zoom)

  return (
    <>
      <AtScreenSize rect={box.box} zoom={zoom}>
        <Outlined by={members} radius={box.radius * zoom} className="size-full">
          <span className="block size-full" />
        </Outlined>
      </AtScreenSize>
      {mark && caret && (
        // A caret as a text field draws one: thin, a little shorter than the letters' box, blinking once it rests.
        // Keyed by where it is, so it shows steadily again each time it moves. People's colors are soft, so it has
        // the outline's hairline of ink round it, a screen pixel wide, to read on light text.
        <span
          key={`${caret.anchor}:${caret.focus}`}
          aria-hidden
          className="absolute animate-[room-caret-blink_1.06s_step-end_0.5s_infinite] motion-reduce:animate-none"
          style={{
            ...mark,
            background: members[0]?.palette.color,
            boxShadow: `0 0 0 ${1 / zoom}px color-mix(in oklch, ${members[0]?.palette.ink} 35%, transparent)`
          }}
        />
      )}
    </>
  )
}

/** Everyone's marquees, from where they started to their pointer, in the `overDesigns` layer. */
export function Marquees({ people }: { people: People }) {
  const everyone = usePeople(people)
  const { zoom } = useCamera()

  return everyone.map((person) =>
    person.gesture?.kind === "marquee" && person.pointer ? (
      <MarqueeOf
        key={person.peer}
        member={memberOf(people, person)}
        person={person}
        zoom={zoom}
        from={person.gesture.from}
      />
    ) : null
  )
}

function MarqueeOf({
  member,
  person,
  zoom,
  from
}: {
  member: Member
  person: RoomPerson
  zoom: number
  from: { x: number; y: number }
}) {
  const rect = marqueeRect(from, person.pointer!.at)

  return (
    <AtScreenSize rect={{ x: rect.x, y: rect.y, width: rect.w, height: rect.h }} zoom={zoom}>
      <Marquee member={member} rect={{ x: 0, y: 0, w: rect.w * zoom, h: rect.h * zoom }} />
    </AtScreenSize>
  )
}

/** Who's here, top-right of the canvas, with each person's card, Follow and Go to. */
export function Faces({
  people,
  you,
  follow,
  camera
}: {
  people: People
  you: { peer: string; name: string }
  follow: Follow
  camera: Camera
}) {
  const everyone = usePeople(people)
  const shown = useSyncExternalStore(follow.subscribe, follow.get)
  const self = memberOf(people, you)
  const presences: Presence[] = everyone.map((person) => ({ member: memberOf(people, person) }))
  const following = shown?.state === "following" ? presences.find((each) => each.member.id === shown.leader) : undefined

  const find = (member: Member) => everyone.find((person) => person.peer === member.id)

  return (
    <div data-canvas-interactive>
      <FaceStack
        here={presences}
        you={self}
        following={following?.member}
        onFollow={(member) => {
          const person = find(member)

          if (person?.camera) {
            follow.start(person.peer, person.camera)
          }
        }}
        onGoTo={(member) => {
          const view = find(member)?.camera

          if (view) {
            void camera.show(view).catch(() => undefined)
          }
        }}
      />
    </div>
  )
}

/** Following's frame and banner while it's on, then the note saying why it ended, over the whole canvas. */
export function Following({ people, follow }: { people: People; follow: Follow }) {
  const shown = useSyncExternalStore(follow.subscribe, follow.get)
  usePeople(people)

  if (!shown) {
    return null
  }

  const person = people.person(shown.leader)

  return (
    <div className="absolute inset-0">
      <FollowLayer
        leader={memberOf(people, { peer: shown.leader, name: person?.name ?? "Someone" })}
        state={shown.state}
        onStop={() => follow.stop()}
      />
    </div>
  )
}
