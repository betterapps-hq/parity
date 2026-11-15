import type { Route } from "./+types/about"

const headings: Record<string, string> = { en: "About Trellis", fr: "À propos de Trellis", de: "Über Trellis" }

export default function About({ params }: Route.ComponentProps) {
  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-4xl font-bold">{headings[params.lang ?? "en"] ?? headings.en}</h1>
      <p className="text-muted-foreground mt-6">
        We started Trellis in 2024 to give small teams one place for their plans.
      </p>
    </section>
  )
}
