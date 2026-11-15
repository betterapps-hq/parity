/** A bordered panel with an optional title and description. */
export function Card({
  title,
  description,
  children,
}: {
  title?: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <section className="border-border bg-surface rounded-lg border p-6 shadow-sm">
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      {children && <div className={title || description ? "mt-4" : ""}>{children}</div>}
    </section>
  )
}
