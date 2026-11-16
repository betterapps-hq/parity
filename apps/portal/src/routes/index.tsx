import { createFileRoute } from "@tanstack/react-router"

/** The portal's first page, blank until its screens are built, so its host has something to answer with. */
export const Route = createFileRoute("/")({ component: Blank })

function Blank() {
  return <main />
}
