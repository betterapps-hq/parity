import { createBrowserRouter as createBrowser, createHashRouter as createHash } from "react-router"
import { handedOver } from "./handed-over.ts"

/*
 * `react-router` as the app's own code gets it in Parity's route frames, in library mode (PAR-1265): the builder serves
 * this module in its place, so the routers the app makes reach the page router (`../page.ts`), since library mode puts
 * none on the page's window. Everything else is React Router's own. `./react-router-dom.ts` does the same for apps that
 * import from `react-router-dom`.
 */

export * from "react-router"

export const createBrowserRouter: typeof createBrowser = (...args) => handedOver(createBrowser(...args))

export const createHashRouter: typeof createHash = (...args) => handedOver(createHash(...args))
