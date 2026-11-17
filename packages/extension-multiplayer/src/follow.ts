import type { Camera, CameraView, FollowEnd, Following } from "@parity-app/extension/internal"

/*
 * Following someone in the room (docs/proposals/extensions-in-the-window.md, `parity.canvas.camera`): the camera keeps
 * showing what they see until this person's own input ends it, or they leave. What following draws, its frame, banner
 * and the note once it ends, reads this store.
 */

/** Where following stands: whom, and whether it's on or how it ended. Nothing once the note has gone. */
export interface FollowShown {
  leader: string
  state: "following" | "stopped" | "left"
}

/** How long the note saying following ended stays. */
export const endedNoteMs = 4000

export class Follow {
  #shown: FollowShown | undefined
  #following: { leader: string; handle: Following } | undefined
  #noteTimer: ReturnType<typeof setTimeout> | undefined
  readonly #listeners = new Set<() => void>()
  readonly #camera: Camera
  readonly #ended: (why: FollowEnd | "left", durationMs: number) => void

  constructor(camera: Camera, ended: (why: FollowEnd | "left", durationMs: number) => void = () => undefined) {
    this.#camera = camera
    this.#ended = ended
  }

  get = (): FollowShown | undefined => this.#shown

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)

    return () => this.#listeners.delete(listener)
  }

  /** Whom this person follows now. */
  get leader(): string | undefined {
    return this.#following?.leader
  }

  /** Follows `leader`, showing `view`, until it ends. */
  start(leader: string, view: CameraView): void {
    this.#following?.handle.dispose()
    const began = performance.now()
    const handle = this.#camera.follow(view)
    const following = { leader, handle }
    this.#following = following
    let leftRoom = false

    handle.onEnd((why) => {
      if (this.#following === following) {
        this.#following = undefined
        this.#ended(leftRoom ? "left" : why, performance.now() - began)
        // Replaced by following someone else, there's no note: the new frame shows.
        this.#show(why === "replaced" ? this.#shown : { leader, state: leftRoom ? "left" : "stopped" })
      }
    })

    // Kept so `left` can say why it ended.
    this.#leaving = () => {
      leftRoom = true
      handle.dispose()
    }

    this.#show({ leader, state: "following" })
  }

  #leaving: (() => void) | undefined

  /** What the leader sees changed. */
  update(leader: string, view: CameraView): void {
    if (this.#following?.leader === leader) {
      this.#following.handle.update(view)
    }
  }

  /** Stops following, as the banner's Stop does. */
  stop(): void {
    this.#following?.handle.dispose()
  }

  /** Someone left: following them ends, saying so. */
  left(peer: string): void {
    if (this.#following?.leader === peer) {
      this.#leaving?.()
    }
  }

  dispose(): void {
    this.#following?.handle.dispose()
    clearTimeout(this.#noteTimer)
    this.#listeners.clear()
  }

  #show(shown: FollowShown | undefined) {
    clearTimeout(this.#noteTimer)
    this.#shown = shown

    if (shown && shown.state !== "following") {
      this.#noteTimer = setTimeout(() => this.#show(undefined), endedNoteMs)
    }

    for (const listener of this.#listeners) {
      listener()
    }
  }
}
