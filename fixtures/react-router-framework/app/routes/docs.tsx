import styles from "~/styles/pages.module.css"
import type { Route } from "./+types/docs"

export default function Docs({ params }: Route.ComponentProps) {
  const page = params["*"] || "index"
  const title = page.split("/").at(-1)?.replaceAll("-", " ") ?? page

  return (
    <article className={`${styles.page} ${styles.narrow}`}>
      <p className={styles.muted}>Docs / {page}</p>
      <h1 className={styles.title}>{title.charAt(0).toUpperCase() + title.slice(1)}</h1>
      <p className={styles.lead}>Guides and reference for everything in Trellis.</p>
    </article>
  )
}
