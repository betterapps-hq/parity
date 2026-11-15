import type { ReactNode } from "react"

export function Button({ children = "Button" }: { children?: ReactNode }) {
  return (
    <button
      type="button"
      style={{
        border: 0,
        borderRadius: "var(--radius)",
        padding: "8px 16px",
        background: "var(--color-primary)",
        color: "var(--color-primary-foreground)"
      }}
    >
      {children}
    </button>
  )
}
