/** Hands a router library mode made to the page router (`../page.ts`), on `window.__parityDataRouter`, and returns it. */
export function handedOver<T>(router: T): T {
  Reflect.set(globalThis, "__parityDataRouter", router)

  return router
}
