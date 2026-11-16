import { createFileRoute } from "@tanstack/react-router"
import { searchResponse } from "../../../server/search.ts"

/** A search of one connector with Parity's key, for a signed-in person (PAR-131). */
export const Route = createFileRoute("/v1/connectors/$id/search")({
  server: {
    handlers: {
      POST: ({ request, params }) => searchResponse(request, params.id)
    }
  }
})
