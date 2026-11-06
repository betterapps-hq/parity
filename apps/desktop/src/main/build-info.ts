import { finiteNumber } from "@parity-app/core"
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

/**
 * What names a built app's Sentry release (PAR-625): whether the release workflow published it, which marks it beta,
 * and the commit it was made from. Neither for one run from source.
 */
export function builtRelease(metadata: () => unknown): { published: boolean; commit?: string } {
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

/** Version-keyed offline identity. Promotion changes GitHub metadata, never the installed artifacts. */
export class InstalledBuild {
  private info: BuildInfo
  private checkedAt = -Infinity
  private pending: Promise<BuildInfo> | undefined

  constructor(
    private readonly options: {
      version: string
      packaged: boolean
      metadata?: () => unknown
      read: () => unknown
      save: (value: unknown) => void
      request?: typeof fetch
      now?: () => number
    }
  ) {
    this.info = { version: options.version, channel: options.packaged ? "unknown" : "development" }
    if (!options.packaged) return
    try {
      if (appManifest.safeParse(options.metadata?.()).data?.releaseChannel === "beta")
        this.info = { version: options.version, channel: "beta" }
    } catch {
      // Optional build metadata must never prevent the app from starting or reading a confirmed cache.
    }
    try {
      const saved = savedBuild.safeParse(options.read()).data
      if (!saved || saved.version !== options.version) return
      this.info = { version: options.version, channel: saved.channel }
      if (saved.checkedAt !== undefined && saved.checkedAt <= this.now()) this.checkedAt = saved.checkedAt
    } catch {
      // Keep the embedded identity, never inferring a channel from the update preference or numeric version.
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  get(): Promise<BuildInfo> {
    if (!this.options.packaged || this.now() - this.checkedAt < refreshMs) return Promise.resolve(this.info)
    if (this.pending) return this.pending
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
        this.info = { version: this.options.version, channel: release.prerelease ? "beta" : "stable" }
        try {
          this.options.save({ ...this.info, checkedAt: this.now() })
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
