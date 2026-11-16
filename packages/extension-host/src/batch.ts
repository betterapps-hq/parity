/**
 * Gathers single requests into batches, for a provider that answers a batch of files at a time (PAR-1095): each call
 * waits for the requests made with it before the event loop turns, up to `size` in a batch, and gets its own answer,
 * the one at its place in what `run` gives. A batch that fails fails each of its calls.
 */
export function batched<Request, Answer>(
  run: (requests: Request[]) => Promise<readonly Answer[]>,
  size = 500
): (request: Request) => Promise<Answer> {
  const waiting: { request: Request; resolve: (answer: Answer) => void; reject: (cause: unknown) => void }[] = []

  const flush = () => {
    const batch = waiting.splice(0, size)

    if (waiting.length > 0) {
      setImmediate(flush)
    }

    run(batch.map(({ request }) => request)).then(
      (answers) => {
        batch.forEach(({ resolve, reject }, index) => {
          if (index < answers.length) {
            resolve(answers[index]!)
          } else {
            reject(new Error(`The batch answered ${answers.length} of ${batch.length} requests`))
          }
        })
      },
      (cause: unknown) => {
        for (const { reject } of batch) {
          reject(cause)
        }
      }
    )
  }

  return (request) =>
    new Promise<Answer>((resolve, reject) => {
      if (waiting.length === 0) {
        setImmediate(flush)
      }

      waiting.push({ request, resolve, reject })
    })
}
