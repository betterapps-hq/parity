/**
 * A limit on waiting for another process that counts only the time this one was free to wait (PAR-766). It counts ticks
 * of `interval` rather than wall time, and Node runs a late tick once without catching up, so a stretch where this
 * process couldn't run counts as one tick. Its own work, such as `fetch` loading undici, and a CI runner starving it
 * under load no longer use up the limit before the answer, which has already arrived, gets read. A copy that really
 * doesn't answer is still given up on after `limit` of free waiting.
 *
 * `stop` ends the wait once the answer has come, so reading and checking it isn't timed either.
 */
export function waitLimit(limit: number, interval = 100): { signal: AbortSignal; stop(): void } {
  const controller = new AbortController()
  let waited = 0

  const timer = setInterval(() => {
    waited += interval

    if (waited >= limit) {
      clearInterval(timer)
      controller.abort(new DOMException(`No answer after ${limit} ms`, "TimeoutError"))
    }
  }, interval)

  timer.unref()

  return { signal: controller.signal, stop: () => clearInterval(timer) }
}
