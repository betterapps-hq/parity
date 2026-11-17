import type { ExtensionsSnapshot } from "@parity-app/extension-host/window-snapshot"

/*
 * What an error from the editor window says about extensions (docs/proposals/extensions-in-the-window.md, "Every error
 * says which extension"): `extensions.json`, beside `frames.json`, and an issue title naming the extension whose window
 * module failed. Kept apart from Sentry, so `window-modules.ts` gives the snapshot without loading it.
 */

let snapshot: (() => ExtensionsSnapshot) | undefined

/** How the window gets `extensions.json` now: `window-modules.ts` gives it once it loads. */
export function setExtensionsSnapshot(get: () => ExtensionsSnapshot): void {
  snapshot = get
}

/**
 * `extensions.json` for an error, scrubbed by `scrub`, when a window module is running or stopped in a tab. None
 * otherwise, and none if building it fails, which mustn't keep the error from being sent.
 */
export function extensionsAttachment(
  scrub: <T>(value: T) => T
): { filename: string; data: string; contentType: string } | undefined {
  try {
    const now = snapshot?.()

    return now && now.tabs.length > 0
      ? { filename: "extensions.json", data: JSON.stringify(scrub(now), undefined, 2), contentType: "application/json" }
      : undefined
  } catch (error) {
    console.warn("[telemetry] extensions.json couldn't be made:", error)

    return undefined
  }
}

/** An event shaped as Sentry's, as far as its title goes. */
interface Titled {
  exception?: { values?: { type?: string }[] }
}

/**
 * An error event whose issue title starts with the extension's name, as `Multiplayer: TypeError: …`, by its last
 * exception's type, which Sentry titles the issue by.
 */
export function extensionTitled<Event extends Titled>(event: Event, name: string): Event {
  const values = event.exception?.values
  const last = values?.at(-1)

  if (!values || !last || last.type?.startsWith(`${name}: `)) {
    return event
  }

  return {
    ...event,
    exception: {
      ...event.exception,
      values: [...values.slice(0, -1), { ...last, type: `${name}: ${last.type ?? "Error"}` }]
    }
  }
}
