import { createFileRoute } from "@tanstack/react-router"
import { organizationChoiceResponse } from "../../../server/sign-in.ts"

/** Finishes a sign-in once the person chose an organization, with WorkOS's API key (PAR-1143). */
export const Route = createFileRoute("/v1/sign-in/organization")({
  server: {
    handlers: {
      POST: ({ request }) => organizationChoiceResponse(request)
    }
  }
})
