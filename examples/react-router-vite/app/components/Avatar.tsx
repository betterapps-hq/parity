/** A person's initials in a circle. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  const sizes = { sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-12 text-base" }

  return (
    <span
      aria-label={name}
      className={`bg-brand/15 text-brand inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${sizes[size]}`}
    >
      {initials}
    </span>
  )
}
