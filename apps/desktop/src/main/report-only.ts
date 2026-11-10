/** The Sentry option the gate turns on for a report: whether the client sends anything. */
export interface SendingSwitch {
  enabled?: boolean
}

/**
 * Lets a report the person asked to send leave while diagnostics are off, and nothing else (PAR-813). `run` turns
 * sending on for the report and back off after, whether it worked or not; while it runs, `drop` holds back every error,
 * span and log main's Sentry hooks see, as they'd be held back while off. With diagnostics on, `run` just sends.
 */
export function createReportOnlyGate() {
  let reportOnly = false

  return {
    async run<Result>(sending: SendingSwitch, send: () => Promise<Result>): Promise<Result> {
      if (sending.enabled) {
        return send()
      }

      sending.enabled = true
      reportOnly = true

      try {
        return await send()
      } finally {
        sending.enabled = false
        reportOnly = false
      }
    },
    /** `null` while only a report may leave, so Sentry drops the item; otherwise what `keep` makes of it. */
    drop<Item, Kept>(item: Item, keep: (item: Item) => Kept): Kept | null {
      return reportOnly ? null : keep(item)
    }
  }
}
