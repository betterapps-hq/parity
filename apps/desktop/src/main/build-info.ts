import { finiteNumber, type JsonValue } from "@parity-app/core"
import { z } from "zod"
import type { BuildInfo } from "../shared/protocol.ts"
import { githubRelease, releaseSummary } from "./github-releases.ts"

const refreshMs = 5 * 60 * 1000

/**
 * The app's own package.json, which a beta build marks with `releaseChannel`, and `scripts/build.ts` stamps with the
 * commit it built.
 */
const appManifest = z.looseObject({
  releaseChannel: z.unknown().optional(),
  commit: z.string().optional().catch(undefined)
})

/** Whether the release workflow published this build, and the commit it was made from. */
export interface BuiltRelease {
  published: boolean
  commit?: string
}

/**
 * What names a built app's Sentry release (PAR-625): whether the release workflow published it, which marks it beta,
 * and the commit it was made from. Neither for one run from source.
 */
export function builtRelease(metadata: () => JsonValue): BuiltRelease {
  try {
    const manifest = appManifest.safeParse(metadata()).data

    return { published: manifest?.releaseChannel === "beta", commit: manifest?.commit }
  } catch {
    // A missing or unreadable package.json leaves the release named by the dev runner's commit, if any.
    return { published: false }
  }
}

/** `installed-build.json`, a cache of what GitHub said this version is. A bad `checkedAt` only means asking again. */
const savedBuild = z.looseObject({
  version: z.string(),
  channel: z.enum(["beta", "stable"]),
  checkedAt: finiteNumber.optional().catch(undefined)
})

/** What `installed-build.json` is written with. */
export type SavedBuild = z.input<typeof savedBuild>

/** Version-keyed offline identity. Promotion changes GitHub metadata, never the installed artifacts. */
export class InstalledBuild {
  private info: BuildInfo
  private checkedAt = -Infinity
  private pending: Promise<BuildInfo> | undefined

  constructor(
    private readonly options: {
      version: string
      packaged: boolean
      /** The app's package.json, as JSON. */
      metadata?: () => JsonValue
      /** `installed-build.json`, as JSON. */
      read: () => JsonValue
      save: (value: SavedBuild) => void
      request?: typeof fetch
      now?: () => number
    }
  ) {
    this.info = { version: options.version, channel: options.packaged ? "unknown" : "development" }

    if (!options.packaged) {
      return
    }

    try {
      if (appManifest.safeParse(options.metadata?.()).data?.releaseChannel === "beta") {
        this.info = { version: options.version, channel: "beta" }
      }
    } catch {
      // Optional build metadata must never prevent the app from starting or reading a confirmed cache.
    }

    try {
      const saved = savedBuild.safeParse(options.read()).data

      if (!saved || saved.version !== options.version) {
        return
      }

      this.info = { version: options.version, channel: saved.channel }

      if (saved.checkedAt !== undefined && saved.checkedAt <= this.now()) {
        this.checkedAt = saved.checkedAt
      }
    } catch {
      // Keep the embedded identity, never inferring a channel from the update preference or numeric version.
    }
  }

  /**
   * What this version was last known to be, without asking GitHub: the build's own mark, or what was saved when GitHub
   * last answered. Sentry's environment is set from it as the app starts (PAR-779).
   */
  get known(): BuildInfo {
    return this.info
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  get(): Promise<BuildInfo> {
    if (!this.options.packaged || this.now() - this.checkedAt < refreshMs) {
      return Promise.resolve(this.info)
    }

    if (this.pending) {
      return this.pending
    }

    this.pending = this.refresh().finally(() => {
      this.pending = undefined
    })

    return this.pending
  }

  private async refresh(): Promise<BuildInfo> {
    try {
      const tag = `v${this.options.version}`
      const { status, data } = await githubRelease(`/tags/${encodeURIComponent(tag)}`, this.options.request)
      const release = status === 200 ? releaseSummary.safeParse(data).data : undefined

      if (release?.tag_name === tag && !release.draft) {
        const channel = release.prerelease ? "beta" : "stable"
        this.info = { version: this.options.version, channel }

        try {
          this.options.save({ version: this.options.version, channel, checkedAt: this.now() })
        } catch {
          // Read-only user data must not hide a successfully resolved identity.
        }
      }
    } catch {
      // Keep the last confirmed identity offline, or unknown when this version has never been resolved.
    }

    this.checkedAt = this.now()

    return this.info
  }
}
