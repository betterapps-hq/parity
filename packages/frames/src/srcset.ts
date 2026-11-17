/** A `srcset`'s candidates, read as HTML does: a URL up to whitespace, which may hold commas, then its descriptor. */
export function srcsetCandidates(value: string): { url: string; descriptor: string }[] {
  const candidates: { url: string; descriptor: string }[] = []
  let at = 0

  while (at < value.length) {
    while (at < value.length && /[\s,]/.test(value.charAt(at))) {
      at += 1
    }

    const start = at

    while (at < value.length && !/\s/.test(value.charAt(at))) {
      at += 1
    }

    let url = value.slice(start, at)
    let descriptor = ""

    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "")
    } else {
      const end = value.indexOf(",", at)
      descriptor = value.slice(at, end === -1 ? value.length : end).trim()
      at = end === -1 ? value.length : end + 1
    }

    if (url) {
      candidates.push({ url, descriptor })
    }
  }

  return candidates
}
