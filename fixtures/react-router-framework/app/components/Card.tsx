import styles from "./Card.module.css"

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
    <section className={styles.card}>
      {title && <h2 className={styles.title}>{title}</h2>}
      {description && <p className={styles.description}>{description}</p>}
      {children && <div className={title || description ? styles.body : undefined}>{children}</div>}
    </section>
  )
}
