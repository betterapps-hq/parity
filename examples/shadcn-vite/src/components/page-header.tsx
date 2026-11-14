export interface PageHeaderProps {
  title: string
  description?: string
  centered?: boolean
}

export function PageHeader({
  title,
  description,
  centered = false,
}: PageHeaderProps) {
  return (
    <div className={`flex flex-col gap-2 ${centered ? "text-center" : ""}`}>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && <p className="text-muted-foreground">{description}</p>}
    </div>
  )
}
