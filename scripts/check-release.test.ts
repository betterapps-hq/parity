import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import { checkRelease, releaseProblems, type ReleaseMeta } from "./check-release.ts"

const release = "parity-desktop@0.40.0"

/** Stands in for Sentry, answering each request with the next of `answers`: a summary, or a status with no release. */
function sentry(answers: (ReleaseMeta | number)[]) {
  const requests: { url: string; authorization: string | null }[] = []

  // SAFETY: the check calls `fetch` with a URL and its headers only, which is all this stand-in takes.
  const fetch = (async (url: string, init?: RequestInit) => {
    requests.push({ url, authorization: new Headers(init?.headers).get("Authorization") })
    const answer = answers.shift()!
    const status = z.number().safeParse(answer)

    return status.success ? new Response("nope", { status: status.data }) : Response.json(answer)
  }) as typeof globalThis.fetch

  return { fetch, requests }
}

describe("releaseProblems", () => {
  it("passes a release with maps and commits", () => {
    expect(releaseProblems(release, { releaseFileCount: 12, commitCount: 1 })).toEqual([])
  })

  it("names each part a release lacks", () => {
    expect(releaseProblems(release, { releaseFileCount: 0, commitCount: 0 })).toEqual([
      `${release} has no source maps.`,
      `${release} isn't linked to its commits.`
    ])
    expect(releaseProblems(release, { releaseFileCount: 12, commitCount: 0 })).toEqual([
      `${release} isn't linked to its commits.`
    ])
  })

  it("fails a release Sentry doesn't have", () => {
    expect(releaseProblems(release, undefined)).toEqual([`Sentry has no release ${release}.`])
  })
})

describe("checkRelease", () => {
  it("asks for the release's summary with the token", async () => {
    const { fetch, requests } = sentry([{ releaseFileCount: 12, commitCount: 3 }])

    expect(await checkRelease(release, { token: "token", fetch, wait: 0 })).toEqual([])
    expect(requests).toEqual([
      {
        url: "https://sentry.io/api/0/organizations/better-apps/releases/parity-desktop%400.40.0/meta/",
        authorization: "Bearer token"
      }
    ])
  })

  it("asks again while Sentry is still processing the upload", async () => {
    const { fetch, requests } = sentry([
      { releaseFileCount: 0, commitCount: 1 },
      { releaseFileCount: 12, commitCount: 1 }
    ])

    expect(await checkRelease(release, { token: "token", fetch, wait: 0 })).toEqual([])
    expect(requests).toHaveLength(2)
  })

  it("gives up after 6 tries with what's still missing", async () => {
    const { fetch, requests } = sentry([
      404,
      404,
      { releaseFileCount: 0, commitCount: 0 },
      { releaseFileCount: 12, commitCount: 0 },
      { releaseFileCount: 12, commitCount: 0 },
      { releaseFileCount: 12, commitCount: 0 }
    ])

    expect(await checkRelease(release, { token: "token", fetch, wait: 0 })).toEqual([
      `${release} isn't linked to its commits.`
    ])
    expect(requests).toHaveLength(6)
  })

  it("stops on any other answer from Sentry", async () => {
    const { fetch } = sentry([401])

    await expect(checkRelease(release, { token: "token", fetch, wait: 0 })).rejects.toThrow(
      `Sentry answered 401 for ${release}: nope`
    )
  })
})
