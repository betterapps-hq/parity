import type { ComponentProps } from "react"
import { Link } from "react-router"

const variants = {
  primary: "bg-brand text-brand-foreground hover:opacity-90",
  secondary: "bg-muted text-foreground hover:bg-border",
  ghost: "text-foreground hover:bg-muted",
}

const sizes = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
}

interface ButtonStyle {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

function buttonClass({ variant = "primary", size = "md" }: ButtonStyle, className = "") {
  return `inline-flex items-center justify-center gap-2 rounded-md font-medium transition ${variants[variant]} ${sizes[size]} ${className}`
}

/** A button, in one of three looks and sizes. */
export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & ButtonStyle) {
  return <button type="button" className={buttonClass({ variant, size }, className)} {...props} />
}

/** A link that looks like a button. */
export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />
}
