import { Button, Spinner } from "@buildkitgg/shadcn-baseui-kit"
import {
  clockOf,
  creditOf,
  type Found,
  kindFor,
  labelOf,
  layoutFor,
  type ConnectorInfo,
  type Searched,
  sizeOf
} from "@parity-app/connectors"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Check, Maximize2, Play } from "lucide-react"
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react"
import { chipColors } from "../canvas/kinds.tsx"
import { IconButton } from "../chrome/IconButton.tsx"
import { ResultPicture } from "./ResultPicture.tsx"
import type { MoreState } from "./use-library-search.ts"

/** The space between results, and the room under each picture for its name. */
const spacing = { across: 16, down: 20, caption: 22 }

/** How close to the end the view gets before more are asked for, in pixels. */
const nearEnd = 320

/** The narrowest a result is drawn, which sets how many sit across: phones narrower than web pages. */
function narrowestOf(library: ConnectorInfo, search: Searched): number {
  if (layoutFor(kindFor(library, search.filters)) === "columns") {
    return 240
  }

  return search.filters.platform === "ios" ? 150 : 300
}

interface ResultsGridProps {
  /** What the results scroll in. */
  scroller: RefObject<HTMLDivElement | null>
  library: ConnectorInfo
  search: Searched
  results: Found[]
  more: MoreState
  isPicked: (found: Found) => boolean
  canPick: (found: Found) => boolean
  onToggle: (found: Found) => void
  onView: (id: string) => void
  onMore: () => void
}

/**
 * The results, each as wide as its column and as tall as its own picture, each in whichever column is shortest, so a
 * later page never moves an earlier one. Only the ones in view are drawn, since a search can run to hundreds. More load
 * as the end comes near; a deep search waits to be asked, since each of its pages costs the source more.
 */
export function ResultsGrid({
  scroller,
  library,
  search,
  results,
  more,
  isPicked,
  canPick,
  onToggle,
  onView,
  onMore
}: ResultsGridProps) {
  const list = useRef<HTMLUListElement>(null)
  const [room, setRoom] = useState({ width: 0, above: 0 })

  // The list's width, and how far down the scroller it starts: as it's drawn, once more straight after, since the
  // scroller may not be there to measure in the same pass, and whenever it's resized.
  useLayoutEffect(() => {
    const measure = () => {
      const element = list.current
      const within = scroller.current

      if (!element || !within) {
        return
      }

      const width = element.clientWidth
      const above = element.getBoundingClientRect().top - within.getBoundingClientRect().top + within.scrollTop

      setRoom((now) => (now.width === width && now.above === above ? now : { width, above }))
    }

    measure()
    const soon = setTimeout(measure, 0)
    const observer = new ResizeObserver(measure)

    if (list.current) {
      observer.observe(list.current)
    }

    return () => {
      clearTimeout(soon)
      observer.disconnect()
    }
  }, [scroller])

  const narrowest = narrowestOf(library, search)
  const across = Math.max(1, Math.floor((room.width + spacing.across) / (narrowest + spacing.across)))
  const wide = Math.max(0, (room.width - spacing.across * (across - 1)) / across)

  // The app doesn't use the React Compiler, whose memoizing this rule guards against.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => {
      const { width, height } = sizeOf(results[index]!)

      return wide * (height / width) + spacing.caption
    },
    getItemKey: (index) => results[index]!.id,
    lanes: across,
    gap: spacing.down,
    scrollMargin: room.above,
    overscan: across * 2
  })

  // Every result's height follows its column's width, so a change in either lays them out again.
  useLayoutEffect(() => {
    virtualizer.measure()
  }, [virtualizer, across, wide])

  const automatic = !search.deep

  // Asks for more when the end is near: as results arrive, and as the view scrolls.
  useEffect(() => {
    const within = scroller.current

    if (!within || !automatic || more !== "can" || room.width === 0) {
      return undefined
    }

    const check = () => {
      if (within.scrollHeight - within.scrollTop - within.clientHeight < nearEnd) {
        onMore()
      }
    }

    check()
    within.addEventListener("scroll", check, { passive: true })

    return () => within.removeEventListener("scroll", check)
  }, [scroller, automatic, more, results.length, room.width, onMore])

  return (
    <>
      <ul ref={list} aria-label="Results" className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const found = results[item.index]!

          return (
            <li
              key={item.key}
              className="absolute"
              style={{ top: item.start - room.above, left: item.lane * (wide + spacing.across), width: wide }}
            >
              <ResultCard
                found={found}
                picked={isPicked(found)}
                pickable={canPick(found)}
                onToggle={() => onToggle(found)}
                onView={() => onView(found.id)}
              />
            </li>
          )
        })}
      </ul>
      <div className="flex min-h-8 items-center justify-center">
        <ResultsEnd more={more} automatic={automatic} onMore={onMore} />
      </div>
    </>
  )
}

/** What's under the results: more arriving, or the way to more of a deep search. */
function ResultsEnd({ more, automatic, onMore }: { more: MoreState; automatic: boolean; onMore: () => void }) {
  if (more === "loading") {
    return (
      <output className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner aria-hidden /> Loading more
      </output>
    )
  }

  if (more === "none" || automatic) {
    return null
  }

  return (
    <Button variant="outline" size="sm" onClick={onMore}>
      More results
    </Button>
  )
}

interface ResultCardProps {
  found: Found
  picked: boolean
  /** Whether it can be picked here; one that can't still shows larger. */
  pickable: boolean
  onToggle: () => void
  onView: () => void
}

/**
 * One result: its picture, and the app it's from or who made it. A click picks it or lets it go, or shows it larger
 * when it can't be picked here; a double-click or its corner button shows it larger. A video plays while pointed at.
 */
function ResultCard({ found, picked, pickable, onToggle, onView }: ResultCardProps) {
  const name = creditOf(found)
  const [playing, setPlaying] = useState(false)

  return (
    <div className="group relative flex flex-col gap-1.5">
      <button
        type="button"
        aria-pressed={pickable ? picked : undefined}
        aria-label={labelOf(found)}
        onClick={pickable ? onToggle : onView}
        onDoubleClick={onView}
        onPointerEnter={() => setPlaying(true)}
        onPointerLeave={() => setPlaying(false)}
        onFocus={() => setPlaying(true)}
        onBlur={() => setPlaying(false)}
        className={`relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
          picked ? "ring-3 ring-(--canvas-layer) ring-offset-2 ring-offset-popover" : ""
        }`}
      >
        <ResultPicture found={found} small playing={playing} className="rounded-lg border" />
        {found.video && (
          <span className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-2xs font-medium text-white tabular-nums">
            <Play aria-hidden className="size-2.5 fill-current" /> {clockOf(found.video.duration)}
          </span>
        )}
      </button>
      {picked && <PickedMark />}
      <div className="absolute top-1.5 right-1.5 rounded-md bg-popover/95 opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <IconButton label={`View ${name} larger`} onClick={onView}>
          <Maximize2 />
        </IconButton>
      </div>
      <span className="truncate px-0.5 text-xs">{name}</span>
    </div>
  )
}

/** The check on a picked result, in the selection's color. */
export function PickedMark({ small }: { small?: boolean }) {
  return (
    <span
      className={`pointer-events-none absolute grid place-items-center rounded-full shadow-sm outline-current ${
        small ? "top-1 left-1 size-3.5 outline" : "top-2 left-2 size-5 outline-2"
      }`}
      style={chipColors.layer}
    >
      <Check className={small ? "size-2.5" : "size-3"} strokeWidth={small ? 3.5 : 3} />
    </span>
  )
}
