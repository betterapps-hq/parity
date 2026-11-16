import { Avatar as AvatarPrimitive } from "radix-ui"
import styles from "./Avatar.module.css"

/** A person's photo in a circle, or their initials until it loads. */
export function Avatar({ name, src, size = "md" }: { name: string; src?: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <AvatarPrimitive.Root className={`${styles.avatar} ${styles[size]}`}>
      {src && <AvatarPrimitive.Image className={styles.image} src={src} alt={name} />}
      <AvatarPrimitive.Fallback className={styles.fallback} aria-label={name}>
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}
