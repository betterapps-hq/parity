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

/**
 * A result someone placed in a design, named by its connector and id: main uses its own copy of the result, so what
 * gets reported is what it found.
 */
export const connectorPlaced = z.strictObject({
  connector: connectorId,
  id: z.string().min(1),
  /** The design it went into: its project's folder and the design's id. */
  design: z.string().min(1)
})

export type ConnectorPlaced = z.infer<typeof connectorPlaced>

/** An agent's search by what it needs, from the connector it names or whichever finds the kind. */
export const connectorFind = z.strictObject({ connector: connectorId.optional(), request: searchRequest })

export type ConnectorFind = z.infer<typeof connectorFind>
