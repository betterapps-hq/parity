import type { Point } from "./glide.ts"

/*
 * Someone else's pointer positions as they arrive, and where to draw it on each frame (PAR-1307). Positions are taken
 * about 30 times a second in their copy, stamped with when, and reach this one unevenly: a few milliseconds apart, then
 * 150 ms when a main thread is busy. So the pointer is drawn a little behind them, moving between positions by the time
 * each was taken, and a gap shorter than that is filled in without it stopping. How far behind follows the longest gaps
 * lately, from 100 ms to 250 ms. A gap longer than that slows it down rather than stopping it short, and it speeds up
 * again afterwards to catch up, so its path never skips.
 */

/** A position as it was taken, on the sender's clock. */
export interface PointerSample {
  /** When the position was taken, in milliseconds on the sender's clock. */
  t: number
  at: Point
}

/** How far behind the positions a pointer is drawn at least: a little more than the longest usual gap between them. */
export const trailDelayMs = 100

/** How far behind it's drawn at most, however unevenly positions come, so it stays close to where they are. */
const maxDelayMs = 250

/** How much further behind than the longest gap lately it's drawn, for a gap a little longer than those. */
const marginMs = 20

/** How fast the longest gap lately is forgotten, in milliseconds per millisecond. */
const forget = 0.05

/** A gap between arrivals longer than this means they kept still, which isn't a gap to wait out. */
const pauseMs = 1000

/** How far behind it can fall before it jumps to where it should be, as after they keep still and move again. */
const maxLagMs = 400

/** How far behind it has to fall to go twice as fast to catch up. */
const catchUpMs = 200

/** How close to the newest position it gets before slowing down, so it eases into a gap rather than stopping short. */
const lowMs = 40

/** How long its speed takes to settle on a new one, so it never lurches from still to catching up. */
const easeMs = 80

/** How much slower positions may come over time before drawing allows for it, in milliseconds per millisecond. */
const relax = 0.01

/** Positions kept before the one being drawn, enough for a few frames' interpolation. */
const kept = 4

export class PointerTrail {
  readonly #minDelayMs: number
  #samples: PointerSample[] = []
  /** The receiver's clock minus the sender's, for the fastest position to arrive lately. */
  #offset: number | undefined
  #arrived: number | undefined
  /** The longest gap between arrivals lately, forgotten slowly. */
  #gap = 0
  /** Where it's drawn, on the sender's clock. */
  #play: number | undefined
  #frame: number | undefined
  /** How fast it's going, as a share of real time. */
  #rate = 1
  /** Positions that arrived after the time they should have been drawn at. */
  #late = 0

  constructor(minDelayMs = trailDelayMs) {
    this.#minDelayMs = minDelayMs
  }

  /** How far behind the positions it's drawn now. */
  get delayMs(): number {
    return Math.min(Math.max(this.#gap + marginMs, this.#minDelayMs), maxDelayMs)
  }

  /** The newest position, or nothing before the first. */
  get latest(): Point | undefined {
    return this.#samples.at(-1)?.at
  }

  /** Takes a position that arrived at `arrived`, on this copy's clock; one no newer than the latest is ignored. */
  push(sample: PointerSample, arrived: number): void {
    const last = this.#samples.at(-1)

    if (last && sample.t <= last.t) {
      return
    }

    // Late: it arrived after the time it was to be drawn at.
    if (this.#offset !== undefined && arrived - this.#offset - sample.t > this.delayMs) {
      this.#late += 1
    }

    if (this.#arrived !== undefined) {
      const since = arrived - this.#arrived
      const forgotten = Math.max(0, this.#gap - since * forget)
      this.#gap = since < pauseMs ? Math.max(forgotten, since) : forgotten
    }

    // The offset follows the fastest arrival, so the delay covers the slower ones, and slowly lets go of it in case
    // positions come more slowly from now on.
    const offset = arrived - sample.t

    const relaxed =
      this.#offset === undefined || this.#arrived === undefined
        ? offset
        : this.#offset + (arrived - this.#arrived) * relax

    this.#offset = Math.min(relaxed, offset)
    this.#arrived = arrived
    this.#samples.push(sample)
  }

  /** How many positions arrived too late to be drawn on time since the last call, and starts counting again. */
  takeLate(): number {
    const late = this.#late
    this.#late = 0

    return late
  }

  /** Whether it's still on its way to the newest position, so it needs more frames. */
  get moving(): boolean {
    const last = this.#samples.at(-1)

    return last !== undefined && this.#play !== undefined && this.#play < last.t
  }

  /** Where to draw it on the frame at `now`, on this copy's clock, or nothing before the first position. */
  at(now: number): Point | undefined {
    const first = this.#samples[0]
    const last = this.#samples.at(-1)

    if (!first || !last || this.#offset === undefined) {
      return undefined
    }

    const target = now - this.#offset - this.delayMs
    // Several things draw from one trail on a frame, each asking with its own clock reading: time only moves forward.
    const elapsed = this.#frame === undefined ? 0 : Math.min(Math.max(now - this.#frame, 0), 100)
    this.#frame = Math.max(this.#frame ?? now, now)

    if (this.#play === undefined || target - this.#play > maxLagMs) {
      this.#play = target
    } else {
      // Behind, it goes up to twice as fast to catch up; ahead, as when it's drawn further behind, it slows down. Close
      // to the newest position, it slows down too, so a late one finds it still moving.
      const behind = target - this.#play
      const rate = behind >= 0 ? 1 + Math.min(behind / catchUpMs, 1) : Math.max(0, 1 + behind / catchUpMs)
      const ahead = last.t - this.#play
      const wanted = rate * Math.min(1, ahead / lowMs)
      // Slowing down is at once; speeding up again takes a moment.
      this.#rate = wanted < this.#rate ? wanted : this.#rate + (wanted - this.#rate) * Math.min(1, elapsed / easeMs)
      this.#play += elapsed * this.#rate

      // Where they stopped, it stops too.
      if (last.t - this.#play < 0.05) {
        this.#play = last.t
      }
    }

    this.#play = Math.min(Math.max(this.#play, first.t), last.t)
    const play = this.#play

    // The positions either side of where it's drawn, dropping those it's past.
    let next = this.#samples.findIndex((sample) => sample.t >= play)

    if (next > kept) {
      this.#samples.splice(0, next - kept)
      next = kept
    }

    const after = this.#samples[next]!
    const before = this.#samples[next - 1]

    if (!before || after.t === before.t) {
      return after.at
    }

    const share = (play - before.t) / (after.t - before.t)

    return {
      x: before.at.x + (after.at.x - before.at.x) * share,
      y: before.at.y + (after.at.y - before.at.y) * share
    }
  }
}
