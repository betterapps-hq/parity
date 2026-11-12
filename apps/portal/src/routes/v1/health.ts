import { createFileRoute } from "@tanstack/react-router"

/** Says the service is up, for the deploy's check and anyone watching it. */
export const Route = createFileRoute("/v1/health")({
  server: {
    handlers: {
      GET: () => Response.json({ status: "ok" })
    }
  }
})
