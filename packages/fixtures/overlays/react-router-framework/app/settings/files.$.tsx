import { Card } from "~/components/Card"
import type { Route } from "./+types/files.$"

export default function Files({ params }: Route.ComponentProps) {
  return <Card title="Files" description={`In /${params["*"] ?? ""}`} />
}
