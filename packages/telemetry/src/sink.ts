import type { Envelope, SpanEnvelope } from "./envelope.ts"

/**
 * Where events go. The package never imports Sentry: the app's sink sends events as Sentry logs and breadcrumbs, spans
 * as Sentry spans and `error.*` events as errors (PAR-627), and another writes the local copy.
 */
export interface Sink {
  event(envelope: Envelope): void
  span(envelope: SpanEnvelope): void
}

/** A sink that keeps what it's given, for unit and end-to-end tests. */
export interface TestSink extends Sink {
  readonly events: Envelope[]
  readonly spans: SpanEnvelope[]
  /** Events and ended spans with this name, in order. */
  named(name: string): Envelope[]
  clear(): void
}

export function createTestSink(): TestSink {
  const events: Envelope[] = []
  const spans: SpanEnvelope[] = []
  return {
    events,
    spans,
    event: (envelope) => events.push(envelope),
    span: (envelope) => spans.push(envelope),
    named: (name) => [...events, ...spans].filter((envelope) => envelope.name === name),
    clear: () => {
      events.length = 0
      spans.length = 0
    }
  }
}
