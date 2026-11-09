import { z } from "zod"

/** Whether a published version is still a beta, or has been promoted to everyone. */
export type ReleaseChannel = "beta" | "stable"

/** The file that keeps what was last learned about a version. A bad `checkedAt` only means asking again. */
const savedPromotion = z.looseObject({
  version: z.string(),
  channel: z.enum(["beta", "stable"]),
  checkedAt: z.number().optional().catch(undefined)
})

/** What the file is written with. */
export type SavedPromotion = z.input<typeof savedPromotion>

/** How long an answer stands before it's asked again: five minutes. */
export const promotionRefreshMs = 5 * 60 * 1000

export interface PromotionOptions {
  /** The version running, which the saved answer must name to count. */
  version: string
  /** The saved file's text. May throw, as for a missing file. */
  read: () => string
  /** Saves an answer. May throw, as for a read-only folder. */
  save: (value: SavedPromotion) => void
  /**
   * Asks where the version was published, such as GitHub's releases or npm's dist-tags. Resolves with no channel when
   * the answer doesn't say, and rejects offline. Either keeps what was known.
   */
  lookup: () => Promise<ReleaseChannel | undefined>
  now?: () => number
}

/**
 * Whether this version has been promoted, kept by version between runs (PAR-779, PAR-799). Promotion changes only
 * where a version is published, never what's installed, so the running build learns it by asking, and remembers the
 * answer offline. The desktop app asks GitHub; the CLI asks npm.
 */
export class Promotion {
  private channel: ReleaseChannel | undefined
  private checkedAt = -Infinity
  private pending: Promise<ReleaseChannel | undefined> | undefined
  private readonly options: PromotionOptions

  constructor(options: PromotionOptions) {
    this.options = options

    try {
      const saved = savedPromotion.safeParse(JSON.parse(options.read())).data

      if (saved?.version !== options.version) {
        return
      }

      this.channel = saved.channel

      // A time in the future, as from a clock that's been changed, means asking again.
      if (saved.checkedAt !== undefined && saved.checkedAt <= this.now()) {
        this.checkedAt = saved.checkedAt
      }
    } catch {
      // A missing or unreadable file counts as nothing known.
    }
  }

  /** What this version was last known to be, without asking: what was saved when it was last answered. */
  get known(): ReleaseChannel | undefined {
    return this.channel
  }

  /**
   * Asks again when the last answer is more than five minutes old, sharing one request between callers, and resolves
   * with what's known. Never rejects.
   */
  check(): Promise<ReleaseChannel | undefined> {
    if (this.now() - this.checkedAt < promotionRefreshMs) {
      return Promise.resolve(this.channel)
    }

    this.pending ??= this.refresh().finally(() => {
      this.pending = undefined
    })

    return this.pending
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  private async refresh(): Promise<ReleaseChannel | undefined> {
    try {
      const channel = await this.options.lookup()

      if (channel) {
        this.channel = channel

        try {
          this.options.save({ version: this.options.version, channel, checkedAt: this.now() })
        } catch {
          // A file that can't be written doesn't hide the answer.
        }
      }
    } catch {
      // Offline keeps the last answer, or nothing when this version has never been answered.
    }

    // Failed lookups wait as long as answered ones before asking again.
    this.checkedAt = this.now()

    return this.channel
  }
}
