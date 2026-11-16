/** As much of a Sentry event as grouping reads. */
export interface GroupedEvent {
  message?: string | undefined
  exception?: { values?: { type?: string | undefined; value?: string | undefined }[] | undefined } | undefined
  fingerprint?: string[] | undefined
}

/**
 * Errors that are one problem however they're reached, each with the fingerprint that keeps it in one Sentry issue.
 * Grouped by stack, each caller made its own issue, and Sentry's alert filed each in Linear as a new bug (PAR-879).
 */
const oneIssue: { pattern: RegExp; fingerprint: string }[] = [
  // Chromium's `capturePage` failing to draw, reached from bitmaps, exports, reports and previews alike.
  { pattern: /\bUnknownVizError\b/, fingerprint: "unknown-viz-error" }
]

/**
 * `event` with the fingerprint of the problem it's one case of, if it's one of those errors. Any other event, or one
 * already given a fingerprint, comes back as it was.
 */
export function withGrouping<Event extends GroupedEvent>(event: Event): Event & Pick<GroupedEvent, "fingerprint"> {
  if (event.fingerprint && event.fingerprint.length > 0) {
    return event
  }

  const texts = [event.message, ...(event.exception?.values ?? []).flatMap(({ type, value }) => [type, value])]
  const match = oneIssue.find(({ pattern }) => texts.some((text) => text !== undefined && pattern.test(text)))

  return match ? { ...event, fingerprint: [match.fingerprint] } : event
}
