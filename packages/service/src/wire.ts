import { z } from "zod"

/*
 * What Parity's service and the app say to each other about searching (PAR-131): the routes, and the answer that lists
 * what the service searches. A search's body is a `SearchRequest` and its answer a `SearchAnswer`, both from
 * `@parity-app/connectors`.
 */

/** The service's routes for searching, under its address. `v1` is in the path so an old installed copy keeps working. */
export const routes = {
  connectors: "/v1/connectors",
  search: (connector: string) => `/v1/connectors/${encodeURIComponent(connector)}/search`
}

/** The connectors the service searches, by id: the ones it has a key for. */
export const searchedConnectors = z.strictObject({ connectors: z.array(z.string()) })

export type SearchedConnectors = z.infer<typeof searchedConnectors>
