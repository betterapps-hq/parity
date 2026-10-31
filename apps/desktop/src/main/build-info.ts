import type { BuildInfo } from "../shared/protocol.ts"
import { githubRelease } from "./github-releases.ts"

const refreshMs = 5 * 60 * 1000

/** Version-keyed offline identity. Promotion changes GitHub metadata, never the installed artifacts. */
export class InstalledBuild {
  private info: BuildInfo
  private checkedAt = -Infinity
  private pending: Promise<BuildInfo> | undefined

  constructor(
    private readonly options: {
      version: string
      packaged: boolean
      metadata?: unknown
      read: () => unknown
      save: (value: unknown) => void
      request?: typeof fetch
      now?: () => number
    }
  ) {
    this.info = { version: options.version, channel: options.packaged ? "unknown" : "development" }
    if (!options.packaged) return
    if (
      options.metadata &&
      typeof options.metadata === "object" &&
      "releaseChannel" in options.metadata &&
      options.metadata.releaseChannel === "beta"
    )
      this.info = { version: options.version, channel: "beta" }
    try {
      const saved = options.read()
      if (
        typeof saved !== "object" ||
        saved === null ||
        !("version" in saved) ||
        saved.version !== options.version ||
        !("channel" in saved) ||
        (saved.channel !== "beta" && saved.channel !== "stable")
      )
        return
      this.info = { version: options.version, channel: saved.channel }
      if (
        "checkedAt" in saved &&
        typeof saved.checkedAt === "number" &&
        Number.isFinite(saved.checkedAt) &&
        saved.checkedAt <= this.now()
      )
        this.checkedAt = saved.checkedAt
    } catch {
      // A fresh install or unreadable cache is unknown, never inferred from the update preference or numeric version.
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
      if (
        status === 200 &&
        typeof data === "object" &&
        data !== null &&
        "tag_name" in data &&
        data.tag_name === tag &&
        "draft" in data &&
        data.draft === false &&
        "prerelease" in data &&
        typeof data.prerelease === "boolean"
      ) {
        this.info = { version: this.options.version, channel: data.prerelease ? "beta" : "stable" }
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
