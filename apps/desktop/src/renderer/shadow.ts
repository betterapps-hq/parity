type AttachShadow = (this: Element, init: ShadowRootInit) => ShadowRoot

/**
 * `attachShadow` as the browser gives it, taken when this module loads, before Session Replay starts (PAR-624). The
 * recorder patches it to watch every shadow root attached while it records, and keeps each one until it starts over, even
 * where its host is left out of the replay. So a frame, and with it the closed project's whole canvas, stayed in memory.
 * None where there's no DOM, as in tests that only read this module.
 */
const nativeAttachShadow =
  typeof Element === "undefined"
    ? undefined
    : (Object.getOwnPropertyDescriptor(Element.prototype, "attachShadow")?.value as AttachShadow | undefined)

/**
 * The host's shadow root, attached without the recorder seeing it: for a project's frames and icons, which replays leave
 * out (`replay.ts`).
 */
export function unrecordedShadow(host: Element): ShadowRoot {
  if (host.shadowRoot) return host.shadowRoot
  return nativeAttachShadow ? nativeAttachShadow.call(host, { mode: "open" }) : host.attachShadow({ mode: "open" })
}
