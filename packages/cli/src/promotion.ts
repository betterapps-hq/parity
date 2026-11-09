import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { Promotion, type ReleaseChannel } from "@parity-app/telemetry"
import semver from "semver"
import { z } from "zod"
import { cliVersion } from "./diagnostics.ts"

/*
 * Whether this CLI's version has been promoted to everyone (PAR-799). Every merge publishes the CLI to npm's `next` tag,
 * and Andrew's approval moves `latest` to it, so a version is promoted once it's been `latest`. The detached sender asks
 * npm after it sends, and keeps the answer in `~/.parity/installed-cli.json`, which the next command's diagnostics
 * report from, as the desktop app's `installed-build.json` does. Nothing waits on npm, and offline keeps the last answer.
 */

/** What `vp pack` writes beside the bundles (PAR-719): whether `npm publish` made them, and the commit they're from. */
export interface CliBuild {
  published: boolean
  commit?: string
}

/** `build.json` as the CLI reads it: published only when it says `true`, and a commit only when it names one. */
const buildFile = z
  .looseObject({ published: z.boolean().catch(false), commit: z.string().optional().catch(undefined) })
  .catch({ published: false })

/** This CLI's build, from `build.json` beside the bundle, or nothing when it runs from source. */
export function cliBuild(): CliBuild | undefined {
  try {
    const { published, commit } = buildFile.parse(
      JSON.parse(readFileSync(new URL("./build.json", import.meta.url), "utf8"))
    )

    const build: CliBuild = { published }

    if (commit !== undefined) {
      build.commit = commit
    }

    return build
  } catch {
    return undefined
  }
}

const distTags = z.looseObject({ latest: z.string().optional().catch(undefined) })

/**
 * Where npm's `latest` tag puts this version: `stable` while it's `latest`, `beta` while it's newer than `latest`, so not
 * yet promoted, and nothing for an older one, which keeps what was saved: a version that was `latest` stays promoted
 * once a newer one is, as a promoted desktop release does. Moving `latest` back to an older version, a rollback, makes
 * the newer one a beta again, since it was pulled.
 */
export function cliChannel(version: string, latest: string | undefined): ReleaseChannel | undefined {
  if (!latest || !semver.valid(latest) || !semver.valid(version)) {
    return undefined
  }

  if (semver.eq(version, latest)) {
    return "stable"
  }

  return semver.gt(version, latest) ? "beta" : undefined
}

const distTagsUrl = "https://registry.npmjs.org/-/package/@parity-app%2Fcli/dist-tags"

/** Asks npm's registry for the CLI's dist-tags, giving up after 10 seconds. Rejects offline. */
export async function npmChannel(version: string, request: typeof fetch = fetch): Promise<ReleaseChannel | undefined> {
  const response = await request(distTagsUrl, { signal: AbortSignal.timeout(10_000) })

  return response.ok ? cliChannel(version, distTags.safeParse(await response.json()).data?.latest) : undefined
}

/** `~/.parity/installed-cli.json`, beside the CLI's other files. */
function promotionFile(): string {
  return join(homedir(), ".parity", "installed-cli.json")
}

/** What npm last said about this CLI's version, kept between runs. */
export function cliPromotion(version = cliVersion(), request?: typeof fetch): Promotion {
  const file = promotionFile()

  return new Promotion({
    version,
    read: () => readFileSync(file, "utf8"),
    save: (value) => {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(value))
    },
    lookup: () => npmChannel(version, request)
  })
}

/** Asks npm whether this CLI has been promoted, when `npm publish` made it and the last answer is old. Never rejects. */
export async function checkCliPromotion(): Promise<void> {
  if (cliBuild()?.published) {
    await cliPromotion().check()
  }
}
