import styles from "./Badge.module.css"

/** A short label, such as a status. */
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning"
  children: React.ReactNode
}) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>
}
