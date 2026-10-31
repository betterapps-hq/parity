const releasesUrl = "https://api.github.com/repos/betterapps-hq/parity/releases"

/** A release body can contain notes and assets; neither is needed here. Bound both time and bytes. */
export async function githubRelease(
  path: string,
  request: typeof fetch = fetch
): Promise<{ status: number; data: unknown }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)
  try {
    const response = await request(`${releasesUrl}${path}`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
      redirect: "error"
    })
    if (response.status !== 200) {
      await response.body?.cancel()
      return { status: response.status, data: undefined }
    }
    if (!response.body) throw new Error("GitHub returned no release metadata")
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 256 * 1024) throw new Error("GitHub release metadata is too large")
        chunks.push(value)
      }
    } finally {
      await reader.cancel()
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    return { status: response.status, data }
  } finally {
    clearTimeout(timeout)
  }
}

/** GitHub's HTML endpoint can answer 404 or 406 for no stable release; confirm through the REST API. */
export async function noStableRelease(error: unknown, beta: boolean, request: typeof fetch = fetch): Promise<boolean> {
  if (
    beta ||
    !(error instanceof Error) ||
    !("code" in error) ||
    !["ERR_UPDATER_LATEST_VERSION_NOT_FOUND", "ERR_UPDATER_INVALID_RELEASE_FEED"].includes(String(error.code)) ||
    !error.message.includes(
      "Unable to find latest version on GitHub (https://github.com/betterapps-hq/parity/releases/latest)"
    ) ||
    !/\b(?:404|406)\b/.test(error.message)
  )
    return false
  try {
    const latest = await githubRelease("/latest", request)
    if (latest.status !== 404) return false
    // A 404 alone could mean an inaccessible repository. Confirm the public releases endpoint works too.
    const releases = await githubRelease("?per_page=1", request)
    return (
      releases.status === 200 &&
      Array.isArray(releases.data) &&
      releases.data.every(
        (release: unknown) =>
          typeof release === "object" &&
          release !== null &&
          "draft" in release &&
          typeof release.draft === "boolean" &&
          "prerelease" in release &&
          typeof release.prerelease === "boolean" &&
          (release.draft || release.prerelease)
      )
    )
  } catch {
    return false
  }
}
