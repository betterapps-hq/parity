import { GitHubProvider } from "electron-updater/out/providers/GitHubProvider.js"
import { describe, expect, it } from "vite-plus/test"
import { updateChannel } from "./update-channel.ts"

/** A releases feed entry, as github.com/<repo>/releases.atom lists releases and bare tags alike. */
const entry = (tag: string) =>
  `<entry><id>${tag}</id><updated>2026-11-10T03:58:49Z</updated><title>${tag}</title><content>No content.</content>` +
  `<link rel="alternate" type="text/html" href="https://github.com/betterapps-hq/parity/releases/tag/${tag}"/></entry>`

/** The feed as it stood when PAR-825's checks failed: a package tag pushed after the last release came first. */
const feed = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">${[
  "%40parity-app%2Fcli_v0.31.1",
  "v0.46.0",
  "%40parity-app%2Fdesktop_v0.46.0",
  "v0.45.1"
]
  .map(entry)
  .join("")}</feed>`

const manifest = (version: string) =>
  `version: ${version}\nfiles:\n  - url: Parity-${version}-win-x64.exe\n    sha512: x\n    size: 1\n` +
  `path: Parity-${version}-win-x64.exe\nsha512: x\nreleaseDate: '2026-11-10T05:25:13.000Z'\n`

/** electron-updater's GitHub provider for Windows, over a stand-in for github.com that has only the real releases. */
function provider(beta: boolean) {
  const requested: string[] = []

  const executor = {
    request: async ({ path }: { path: string }) => {
      requested.push(path)

      if (path.endsWith("releases.atom")) {
        return feed
      }

      if (path.endsWith("/releases/latest")) {
        return JSON.stringify({ tag_name: "v0.45.1" })
      }

      const release = /\/download\/(v[\d.]+)\/latest\.yml$/.exec(path)?.[1]

      if (release) {
        return manifest(release.slice(1))
      }

      throw new Error(`404 ${path}`)
    }
  }

  // The provider reads only the running version's prerelease part, which a stable build like 0.45.1 doesn't have.
  const updater = { ...updateChannel(beta), fullChangelog: false }

  // SAFETY: the provider reads only the channel, allowPrerelease, the running version and fullChangelog from its updater,
  // and only request() from its executor, all of which these stand-ins have.
  const github = new GitHubProvider({ provider: "github", owner: "betterapps-hq", repo: "parity" }, updater as never, {
    isUseMultipleRangeRequest: false,
    platform: "win32",
    executor: executor as never
  })

  return { github, requested }
}

describe("the update channel over GitHub's releases feed", () => {
  it("finds the newest beta past package tags that have no release files", async () => {
    const { github } = provider(true)
    await expect(github.getLatestVersion()).resolves.toMatchObject({ tag: "v0.46.0", version: "0.46.0" })
  })

  it("keeps stable on GitHub's latest release and its latest.yml", async () => {
    const { github, requested } = provider(false)
    await expect(github.getLatestVersion()).resolves.toMatchObject({ tag: "v0.45.1", version: "0.45.1" })
    expect(requested).toContain("/betterapps-hq/parity/releases/download/v0.45.1/latest.yml")
  })
})
