import type { ConnectorInfo, Problem } from "@parity-app/connectors"
import { searchRequest } from "@parity-app/connectors"
import { z } from "zod"

/*
 * Connectors as the window sees them (PAR-829): what each one finds and whether it has a key, never the key itself.
 * Main keeps the keys and runs every search; the window asks over IPC, and agents through the project service.
 */

/**
 * Where a connector's key comes from: none set, saved encrypted in the app's data, kept only until Parity quits (where
 * the system can't encrypt it), an environment variable, as in a development copy, which wins over a saved one, or a
 * service that searches with its own key, used when there's none here.
 */
export type KeySource = "none" | "saved" | "session" | "environment" | "service"

/** A connector, for the window: what it says about itself, and where its key comes from. */
export interface ConnectorState extends ConnectorInfo {
  key: KeySource
}

/** What setting a key gave: where it's kept, or why it wasn't. A key that couldn't be checked is kept, with why. */
export type SetKeyAnswer = { key: KeySource; problem?: Problem } | { problem: Problem }

/** A connector's id, as requests name it. */
export const connectorId = z.string().regex(/^[a-z][a-z0-9-]*$/, "expected a connector's id, such as mobbin")

/** A search the window or an agent asks main to run. */
export const connectorSearch = z.strictObject({ connector: connectorId, request: searchRequest })

export type ConnectorSearch = z.infer<typeof connectorSearch>

/** A key the person typed for a connector. Pasted keys often bring a space or a line break along, so it's trimmed. */
export const connectorKey = z.strictObject({
  connector: connectorId,
  key: z.string().trim().min(1, "Paste the key").max(500, "That's longer than any key")
})
