import { createScrubber, type Scrubber } from "@parity-app/telemetry"

/**
 * A process's scrubber for what Sentry sends and for its telemetry's attributes, which takes the open projects' `.env`
 * values as they change (PAR-672). The service reads them as projects open and close, and main passes them on.
 */
export interface SecretScrubbing {
  /** A copy of the value with secrets replaced, as `Scrubber.value`. */
  value<T>(input: T): T
  /** The text with secrets replaced, as `Scrubber.text`. */
  text(input: string): string
  /** Scrubs these values from now on, in place of those given before, here and in the telemetry given to `follow`. */
  use(secrets: readonly string[]): void
  /** Gives this process's telemetry the values now and whenever they change. */
  follow(telemetry: { setSecrets(secrets: Iterable<string>): void }): void
}

export function secretScrubbing(): SecretScrubbing {
  let secrets: readonly string[] = []
  let scrubber: Scrubber = createScrubber()
  const followers: { setSecrets(secrets: Iterable<string>): void }[] = []

  return {
    value: (input) => scrubber.value(input),
    text: (input) => scrubber.text(input),
    use(next) {
      secrets = [...next]
      scrubber = createScrubber({ secrets })

      for (const follower of followers) {
        follower.setSecrets(secrets)
      }
    },
    follow(telemetry) {
      followers.push(telemetry)
      telemetry.setSecrets(secrets)
    }
  }
}
