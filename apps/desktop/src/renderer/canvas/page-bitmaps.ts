import { useEffect, useRef, useState } from "react"
import type { PageJob } from "../../shared/protocol.ts"
import { pageBitmapName } from "../../shared/render-job.ts"
import { sheetTexts } from "../copy-sheets.ts"
import { capture, failed, type KeptBitmap, stored, want } from "./frame-bitmaps.ts"
import type { FrozenCopy } from "./freezer.ts"

/*
 * A route board's picture (docs/proposals/route-frames.md, "Pictures", PAR-1200): a capture of its frozen copy, which the
 * render window builds at the mode's width and the page's full height, kept on disk with the page's trace. A kept one
 * shows as soon as it's read, before the page is frozen again; it's captured once the board's copy comes, when none was
 * kept or the one kept is of other code.
 */

/** A page's picture as a board shows it. */
export interface PagePicture {
  /** As a data URL: nothing while it's read or taken, or when it couldn't be. */
  src?: string
  /** The page's height in its own CSS pixels when it was captured. */
  height?: number
  /** It was kept from other code, and stands in until the page is captured again. */
  stale?: true
}

/** A number for each copy the window has, so a new copy of the same page is captured again. */
const copyNumbers = new WeakMap<FrozenCopy, number>()
let nextCopy = 1

function copyNumber(copy: FrozenCopy): number {
  let number = copyNumbers.get(copy)

  if (number === undefined) {
    number = nextCopy++
    copyNumbers.set(copy, number)
  }

  return number
}

/** A page's job with its copy, which capturing it carries: the copy's body and root, and its sheets' text in order. */
export function withCopy(job: PageJob, copy: FrozenCopy): PageJob {
  return {
    ...job,
    copy: {
      origin: copy.origin,
      loadedAt: copy.loadedAt,
      landed: copy.location.outcome === "landed",
      pageHeight: copy.pageHeight,
      root: copy.root,
      body: copy.body,
      sheets: copy.sheets.map((id) => ({ id, text: sheetTexts.get(id) ?? "" }))
    }
  }
}

/** What `usePagePicture` read from disk for a page, by its picture's name. */
interface Read {
  name: string
  kept?: KeptBitmap
}

/** How long after a failed capture it's tried again, doubling each time it fails, up to eight times as long. */
const retryMs = 2000

/** What `usePagePicture` captured, by the capture's key. */
interface Taken {
  key: string
  src: string
}

/**
 * A route board's picture: the one kept on disk for `job`, or else one captured from `copy` once it comes, nearest the
 * view first (`rank`). A kept picture of other code shows, stale, until the capture replaces it.
 */
export function usePagePicture(job: PageJob, copy: FrozenCopy | undefined, rank: () => number): PagePicture {
  const name = pageBitmapName(job)
  const [read, setRead] = useState<Read>()
  const [taken, setTaken] = useState<Taken>()
  const latest = useRef(job)
  const ranked = useRef(rank)

  useEffect(() => {
    latest.current = job
    ranked.current = rank
  })

  // Asked again for each new copy, which the freezer makes when the code changes, so a picture current when the project
  // opened is checked against its trace again rather than standing in for the new code.
  const copied = copy ? copyNumber(copy) : 0

  useEffect(() => {
    let live = true

    void stored(name, latest.current).then((kept) => {
      if (live) {
        setRead(kept ? { name, kept } : { name })
      }
    })

    return () => {
      live = false
    }
  }, [name, copied])

  const known = read?.name === name ? read : undefined
  const current = known?.kept && !known.kept.stale
  // Captured only once the disk has answered, and only when what it kept isn't current.
  const key = copy && known && !current ? `${name}\n${copyNumber(copy)}` : undefined

  useEffect(() => {
    if (!key || !copy) {
      return undefined
    }

    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    want(key, 1)

    // A capture that failed, as when the offscreen window's renderer went, is tried again later, as frames' are.
    const take = (attempt: number) =>
      void capture(key, withCopy(latest.current, copy), undefined, () => ranked.current()).then((src) => {
        if (!live) {
          return
        }

        if (src === failed) {
          timer = setTimeout(() => take(attempt + 1), retryMs * Math.min(2 ** attempt, 8))
        } else if (src !== undefined) {
          setTaken({ key, src })
        }
      })

    take(0)

    return () => {
      live = false
      clearTimeout(timer)
      want(key, -1)
    }
  }, [key, copy])

  if (taken && taken.key.startsWith(`${name}\n`)) {
    return { src: taken.src, height: copy?.pageHeight }
  }

  if (known?.kept) {
    const { src, height, stale } = known.kept
    const picture: PagePicture = { src }

    if (height !== undefined) {
      picture.height = height
    }

    if (stale) {
      picture.stale = true
    }

    return picture
  }

  return {}
}
