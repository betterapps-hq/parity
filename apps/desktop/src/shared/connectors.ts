import type { ConnectorInfo } from "@parity-app/connectors"
import { searchRequest } from "@parity-app/connectors"
import { z } from "zod"

/*
 * Connectors as the window sees them (PAR-829): what each one finds and whether this copy of Parity can search it,
 * never a key. The app's owner arranges the keys, and main runs every search; the window asks over IPC, and agents
 * through the project service.
 */

/**
 * Whether this copy can search a connector: with a key `here`, or a connector that needs none; through a `service`
 * that holds the key; or not at all, with `none`.
 */
export type KeySource = "here" | "service" | "none"

/** A connector, for the window: what it says about itself, and whether this copy can search it. */
export interface ConnectorState extends ConnectorInfo {
  key: KeySource
}

/** A connector's id, as requests name it. */
export const connectorId = z.string().regex(/^[a-z][a-z0-9-]*$/, "expected a connector's id, such as mobbin")

/** A search the window or an agent asks main to run. */
export const connectorSearch = z.strictObject({ connector: connectorId, request: searchRequest })

export type ConnectorSearch = z.infer<typeof connectorSearch>

/** An agent's search by what it needs, from the connector it names or whichever finds the kind. */
export const connectorFind = z.strictObject({ connector: connectorId.optional(), request: searchRequest })

export type ConnectorFind = z.infer<typeof connectorFind>
