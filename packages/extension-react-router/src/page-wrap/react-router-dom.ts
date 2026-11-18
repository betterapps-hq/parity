import { createBrowserRouter as createBrowser, createHashRouter as createHash } from "react-router-dom"
import { handedOver } from "./handed-over.ts"

/*
 * `react-router-dom` as the app's own code gets it in Parity's route frames, in library mode (PAR-1299), as
 * `./react-router.ts` serves `react-router`. `react-router-dom` 7 re-exports React Router, whose routers these wrap;
 * React Router 8 has no `react-router-dom`.
 */

export * from "react-router-dom"

export const createBrowserRouter: typeof createBrowser = (...args) => handedOver(createBrowser(...args))

export const createHashRouter: typeof createHash = (...args) => handedOver(createHash(...args))
