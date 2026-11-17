import { createBrowserRouter as createBrowser, createHashRouter as createHash } from "react-router"

/*
 * `react-router` as the app's own code gets it in Parity's route frames, in library mode (PAR-1265): the builder serves
 * this module in its place, so the routers the app makes reach the page router (`../page.ts`), since library mode puts
 * none on the page's window. Everything else is React Router's own.
 */

export * from "react-router"

/** Hands the router to the page router, and returns it. */
function handedOver<T>(router: T): T {
  Reflect.set(globalThis, "__parityDataRouter", router)

  return router
}

export const createBrowserRouter: typeof createBrowser = (...args) => handedOver(createBrowser(...args))

export const createHashRouter: typeof createHash = (...args) => handedOver(createHash(...args))
