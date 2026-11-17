type AttachShadow = (this: Element, init: ShadowRootInit) => ShadowRoot

/**
 * `attachShadow` as the browser gives it, taken when this module loads, before Session Replay starts (PAR-624). The
 * recorder patches it to watch every shadow root attached while it records, and keeps each one until it starts over, even
 * where its host is left out of the replay. So a frame, and with it the closed project's whole canvas, stayed in memory.
 * None where there's no DOM, as in tests that only read this module.
 */
// SAFETY: the DOM defines `attachShadow` on Element's prototype as this method.
const nativeAttachShadow =
  typeof Element === "undefined"
    ? undefined
    : (Object.getOwnPropertyDescriptor(Element.prototype, "attachShadow")?.value as AttachShadow | undefined)

/**
 * The host's shadow root, attached without the recorder seeing it: for a project's frames and icons, which replays leave
 * out (`replay.ts`). With `registry`, the root has that custom element registry of its own, as a frozen copy's does.
 */
export function unrecordedShadow(host: Element, registry?: CustomElementRegistry): ShadowRoot {
  if (host.shadowRoot) {
    return host.shadowRoot
  }

  const init: ShadowRootInit = registry ? { mode: "open", customElementRegistry: registry } : { mode: "open" }

  return nativeAttachShadow ? nativeAttachShadow.call(host, init) : host.attachShadow(init)
}
