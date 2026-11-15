import type { Route } from "./+types/docs"

export default function Docs({ params }: Route.ComponentProps) {
  const page = params["*"] || "index"

  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-muted-foreground text-sm">Docs / {page}</p>
      <h1 className="mt-2 text-3xl font-bold capitalize">{page.split("/").at(-1)?.replaceAll("-", " ")}</h1>
      <p className="text-muted-foreground mt-6">Guides and reference for everything in Trellis.</p>
    </article>
  )
}
