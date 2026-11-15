import type { ComponentProps } from "react"
import { Slot } from "radix-ui"
import styles from "./Button.module.css"

interface ButtonStyle {
  variant?: "primary" | "secondary" | "ghost"
  size?: "sm" | "md" | "lg"
  /** Draws its one child, such as a link, as the button. */
  asChild?: boolean
}

/** A button, in one of three looks and sizes. With `asChild`, a link or other element that looks like one. */
export function Button({
  variant = "primary",
  size = "md",
  asChild = false,
  className,
  ...props
}: ComponentProps<"button"> & ButtonStyle) {
  const Element = asChild ? Slot.Root : "button"

  return (
    <Element
      {...(asChild ? {} : { type: "button" as const })}
      className={[styles.button, styles[variant], styles[size], className].filter(Boolean).join(" ")}
      {...props}
    />
  )
}
