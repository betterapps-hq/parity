import { createFileRoute } from "@tanstack/react-router"
import { connectorsResponse } from "../../../server/search.ts"

/** The connectors the service searches, which the app asks for to know which searches to send it (PAR-131). */
export const Route = createFileRoute("/v1/connectors/")({
  server: {
    handlers: {
      GET: () => connectorsResponse()
    }
  }
})
