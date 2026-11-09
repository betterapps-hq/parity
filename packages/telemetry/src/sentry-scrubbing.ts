import type { Scrubber } from "./scrub.ts"

/** What `sentryScrubbing` needs from a process's Sentry module: its wrapper for a static `beforeSendSpan`. */
export interface StaticSpanSdk<Callback> {
  withStaticSpan(callback: <Span>(span: Span) => Span): Callback
}

/**
 * The Sentry options every process starts with, so nothing it sends leaves unscrubbed (PAR-621): errors, transactions,
 * spans, logs and breadcrumbs each pass the scrubber. A process puts its own `beforeSend` or `beforeSendTransaction`
 * after these to add tags or attachments, and scrubs what it returns.
 *
 * Spans are sent the static way, inside the transaction they belong to (PAR-756). Sentry 11.8 streams them by default,
 * span by span, past `beforeSendTransaction`, so Sentry's own spans would leave unscrubbed once tracing is on. Parity's
 * spans are transactions it builds itself, which pass `beforeSendTransaction` either way. `beforeSendSpan` covers the
 * spans Sentry sends on their own, outside a transaction.
 *
 * With `errorsOnly`, as in CI, transactions and logs are dropped, so only errors and reports leave, with their
 * breadcrumbs (PAR-777). Static spans go inside their transaction, so they're dropped with it.
 */
export function sentryScrubbing<Callback>(
  scrubber: Pick<Scrubber, "value">,
  sdk: StaticSpanSdk<Callback>,
  { errorsOnly = false }: { errorsOnly?: boolean | undefined } = {}
) {
  const scrub = <T>(item: T): T => scrubber.value(item)
  const scrubUnlessErrorsOnly = <T>(item: T): T | null => (errorsOnly ? null : scrub(item))

  return {
    traceLifecycle: "static" as const,
    beforeSend: scrub,
    beforeSendTransaction: scrubUnlessErrorsOnly,
    beforeSendSpan: sdk.withStaticSpan(scrub),
    beforeSendLog: scrubUnlessErrorsOnly,
    beforeBreadcrumb: scrub
  }
}
