import type { ReactNode } from "react"

export function Card({ title = "Card", children }: { title?: string; children?: ReactNode }) {
  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: "var(--radius)", padding: 16, maxWidth: 320 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>{title}</h2>
      {children}
    </section>
  )
}
