import { useBox, useZoom } from "@parity-app/canvas-layer"
import type { NodeRef } from "@parity-app/extension"
import type { Camera, Point, Rect, Self } from "@parity-app/extension/internal"
import {
  FaceStack,
  FollowLayer,
  Marquee,
  type Member,
  Outlined,
  type PointerTrail,
  type Presence,
  RemotePointer
} from "@parity-app/presence-ui"
import { type ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react"
import type { Follow } from "./follow.ts"
import {
  caretMark,
  marqueeRect,
  type People,
  type RoomPerson,
  type Someone,
  selectionsByNode,
  yourMember
} from "./people.ts"

/*
 * What the room draws on the canvas (docs/proposals/extensions-in-the-window.md, "The multiplayer extension"), from
 * presence-ui's components, each person in the palette the room assigned them: their pointers with first-name badges,
 * what they've selected or are typing in outlined in their color with their caret, their marquees, the avatar stack with
 * each person's card, and following's frame and banner. Page layers keep what they draw the same size on screen by
 * scaling it by `1 / zoom`, and read only the zoom, so a pan draws none of them again.
 *
 * Each layer reads only the store it draws (PAR-1327): who's here for the avatar stack, everyone's selections for the
 * outlines, and each person's own for their pointer and marquee. What moves with a pointer is drawn from its trail by
 * writing styles on every frame, so a position arriving draws nothing again in React.
 */

function useRoster(people: People): readonly Someone[] {
  return useSyncExternalStore(people.onRoster, people.roster)
}

function usePerson(people: People, peer: string): RoomPerson | undefined {
  const subscribe = useCallback((listener: () => void) => people.onPerson(peer, listener), [people, peer])

  return useSyncExternalStore(subscribe, () => people.person(peer))
}

/** Someone, as presence-ui draws them, in the palette the room assigned them. */
function memberOf(people: People, person: Pick<Someone, "peer" | "name">): Member {
  return { id: person.peer, name: person.name, palette: people.paletteOf(person.peer) }
}

/** Someone as presence-ui draws them, the same object until their name or palette changes. */
function useMember(people: People, person: Someone | undefined): Member | undefined {
  const peer = person?.peer
  const name = person?.name
  // Held, so the same object until the room assigns numbers.
  const palette = peer === undefined ? undefined : people.paletteOf(peer)

  return useMemo(
    () => (peer === undefined || name === undefined || !palette ? undefined : { id: peer, name, palette }),
    [peer, name, palette]
  )
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

/**
 * Calls `draw` with each frame's time: once after each render, then on every frame while `trail` is on its way, started
 * again by each position it takes. For what follows someone's pointer, written straight to the page.
 */
function useTrailFrames(trail: PointerTrail | undefined, draw: (now: number) => void): void {
  const latest = useRef(draw)
  const frame = useRef<number | undefined>(undefined)

  const step = useCallback(
    function step(now: number) {
      frame.current = undefined
      latest.current(now)

      if (trail?.moving) {
        frame.current = requestAnimationFrame(step)
      }
    },
    [trail]
  )

  // Drawn after each render, for whatever changed, such as the zoom.
  useLayoutEffect(() => {
    latest.current = draw

    if (frame.current !== undefined) {
      cancelAnimationFrame(frame.current)
    }

    step(performance.now())
  })

  useLayoutEffect(() => {
    const stop = trail?.onPush(() => {
      frame.current ??= requestAnimationFrame(step)
    })

    return () => {
      stop?.()

      if (frame.current !== undefined) {
        cancelAnimationFrame(frame.current)
        frame.current = undefined
      }
    }
  }, [trail, step])
}

/** Everyone's pointers, moving between the positions sent on every frame, in the `overSelection` layer. */
export function Pointers({ people }: { people: People }) {
  const roster = useRoster(people)
  const zoom = useZoom()

  return (
    <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${1 / zoom})` }}>
      {roster.map(({ peer }) => (
        <PersonPointerAt key={peer} people={people} peer={peer} zoom={zoom} />
      ))}
    </div>
  )
}

function PersonPointerAt({ people, peer, zoom }: { people: People; peer: string; zoom: number }) {
  const person = usePerson(people, peer)
  const member = useMember(people, person)

  if (!person?.pointer || !member) {
    return null
  }

  const gesture = person.gesture

  return (
    <RemotePointer
      member={member}
      trail={people.trail(peer)}
      scale={zoom}
      offCanvas={!person.pointer.over}
      detail={gesture?.kind === "text" ? "Typing…" : undefined}
      pressed={gesture !== undefined && gesture.kind !== "text"}
      // While they drag, what they move carries their name.
      badge={gesture?.kind !== "move"}
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
  const everyone = useSyncExternalStore(people.onSelections, people.everyone)
  const zoom = useZoom()
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
        // A caret a little shorter than the letters' box, as a text field draws one, but 2px wide and steady, so
        // someone else's is easy to see. People's colors are soft, so it's their color a third of the way to their
        // ink, with the outline's hairline of ink round it, a screen pixel wide, to read on a white board.
        <span
          aria-hidden
          className="absolute"
          style={{
            ...mark,
            background: `color-mix(in oklch, ${members[0]?.palette.color}, ${members[0]?.palette.ink} 35%)`,
            boxShadow: `0 0 0 ${1 / zoom}px color-mix(in oklch, ${members[0]?.palette.ink} 35%, transparent)`
          }}
        />
      )}
    </>
  )
}

/** Everyone's marquees, from where they started to their pointer, in the `overDesigns` layer. */
export function Marquees({ people }: { people: People }) {
  const roster = useRoster(people)
  const zoom = useZoom()

  return roster.map(({ peer }) => <MarqueeOf key={peer} people={people} peer={peer} zoom={zoom} />)
}

function MarqueeOf({ people, peer, zoom }: { people: People; peer: string; zoom: number }) {
  const person = usePerson(people, peer)
  const member = useMember(people, person)
  const gesture = person?.gesture

  if (gesture?.kind !== "marquee" || !person?.pointer || !member) {
    return null
  }

  return <MovingMarquee member={member} trail={people.trail(peer)} zoom={zoom} from={gesture.from} />
}

/** A marquee whose corner follows someone's pointer as it's drawn, its box written on every frame. */
function MovingMarquee({
  member,
  trail,
  zoom,
  from
}: {
  member: Member
  trail: PointerTrail | undefined
  zoom: number
  from: Point
}) {
  const box = useRef<HTMLDivElement>(null)

  useTrailFrames(trail, (now) => {
    const element = box.current
    const to = trail?.at(now)

    if (!element || !to) {
      return
    }

    // Placed on the page and sized at screen size, scaled by `1 / zoom`, as `AtScreenSize` does.
    const rect = marqueeRect(from, to)
    element.style.left = `${rect.x}px`
    element.style.top = `${rect.y}px`
    element.style.width = `${rect.w * zoom}px`
    element.style.height = `${rect.h * zoom}px`
    element.style.transform = `scale(${1 / zoom})`
  })

  return (
    <div ref={box} className="absolute origin-top-left" data-remote-marquee>
      <Marquee member={member} />
    </div>
  )
}

/**
 * Who's here, top-right of the canvas, with each person's card, Follow and Go to. Your own face is drawn as your account
 * avatar shows you (`yourMember`); everyone else's in their palette.
 */
export function Faces({
  people,
  you,
  follow,
  camera
}: {
  people: People
  /** Your peer, and who's signed in, drawn again each time that changes (`parity.presence.onSelfChange`). */
  you: { peer: string; self: () => Self; onSelfChange: (listener: () => void) => () => void }
  follow: Follow
  camera: Camera
}) {
  const roster = useRoster(people)
  const shown = useSyncExternalStore(follow.subscribe, follow.get)
  const signedIn = useSyncExternalStore(you.onSelfChange, you.self)
  const self = yourMember(you.peer, signedIn, people.paletteOf(you.peer))
  const presences: Presence[] = roster.map((person) => ({ member: memberOf(people, person) }))
  const following = shown?.state === "following" ? presences.find((each) => each.member.id === shown.leader) : undefined

  return (
    <div data-canvas-interactive>
      <FaceStack
        here={presences}
        you={self}
        following={following?.member}
        onFollow={(member) => {
          const view = member.id === undefined ? undefined : people.cameraOf(member.id)

          if (member.id !== undefined && view) {
            follow.start(member.id, view)
          }
        }}
        onGoTo={(member) => {
          const view = member.id === undefined ? undefined : people.cameraOf(member.id)

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
  const roster = useRoster(people)

  if (!shown) {
    return null
  }

  const name = roster.find((person) => person.peer === shown.leader)?.name ?? "Someone"

  return (
    <div className="absolute inset-0">
      <FollowLayer
        leader={memberOf(people, { peer: shown.leader, name })}
        state={shown.state}
        onStop={() => follow.stop()}
      />
    </div>
  )
}
