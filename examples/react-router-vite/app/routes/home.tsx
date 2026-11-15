import { ButtonLink } from "~/components/Button"
import type { Route } from "./+types/home"

export function meta(_: Route.MetaArgs) {
  return [{ title: "Trellis" }, { name: "description", content: "Plan projects with your whole team." }]
}

export default function Home() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="text-5xl font-bold tracking-tight">Plan projects with your whole team</h1>
      <p className="text-muted-foreground mt-6 text-lg">
        Trellis keeps every project's plan, people and files in one place.
      </p>
      <div className="mt-10 flex justify-center gap-3">
        <ButtonLink to="/projects" size="lg">
          Get started
        </ButtonLink>
        <ButtonLink to="/pricing" size="lg" variant="secondary">
          See pricing
        </ButtonLink>
      </div>
    </section>
  )
}
