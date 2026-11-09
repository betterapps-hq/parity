import type { JsonValue } from "@parity-app/core"
import { Promotion, type ReleaseChannel, type SavedPromotion } from "@parity-app/telemetry"
import { z } from "zod"
import type { BuildInfo } from "../shared/protocol.ts"
import { githubRelease, releaseSummary } from "./github-releases.ts"

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

/** What `installed-build.json` is written with: what GitHub last said this version is. */
export type SavedBuild = SavedPromotion

/** Version-keyed offline identity. Promotion changes GitHub metadata, never the installed artifacts. */
export class InstalledBuild {
  /** The build's own identity, before GitHub has answered for this version. */
  private readonly embedded: BuildInfo
  /** What GitHub said, kept between runs. None for a build run from source, which never asks. */
  private readonly promotion: Promotion | undefined

  constructor(options: {
    version: string
    packaged: boolean
    /** The app's package.json, as JSON. */
    metadata?: () => JsonValue
    /** `installed-build.json`'s text. */
    read: () => string
    save: (value: SavedBuild) => void
    request?: typeof fetch
    now?: () => number
  }) {
    const { version, packaged } = options
    this.embedded = { version, channel: packaged ? "unknown" : "development" }

    if (!packaged) {
      return
    }

    try {
      if (appManifest.safeParse(options.metadata?.()).data?.releaseChannel === "beta") {
        this.embedded = { version, channel: "beta" }
      }
    } catch {
      // Optional build metadata must never prevent the app from starting or reading a confirmed cache.
    }

    // Never inferring a channel from the update preference or numeric version, only from this version's own release.
    this.promotion = new Promotion({
      version,
      read: options.read,
      save: options.save,
      now: options.now,
      lookup: () => releaseChannel(version, options.request)
    })
  }

  /**
   * What this version was last known to be, without asking GitHub: the build's own mark, or what was saved when GitHub
   * last answered. Sentry's environment is set from it as the app starts (PAR-779).
   */
  get known(): BuildInfo {
    const channel = this.promotion?.known

    return channel ? { version: this.embedded.version, channel } : this.embedded
  }

  /** Asks GitHub when the last answer is more than five minutes old, then what's known. Never rejects. */
  async get(): Promise<BuildInfo> {
    await this.promotion?.check()

    return this.known
  }
}

/** Whether GitHub's release for this version is a beta or promoted, or nothing when it names no such release. */
async function releaseChannel(version: string, request?: typeof fetch): Promise<ReleaseChannel | undefined> {
  const tag = `v${version}`
  const { status, data } = await githubRelease(`/tags/${encodeURIComponent(tag)}`, request)
  const release = status === 200 ? releaseSummary.safeParse(data).data : undefined

  if (release?.tag_name !== tag || release.draft) {
    return undefined
  }

  return release.prerelease ? "beta" : "stable"
}
