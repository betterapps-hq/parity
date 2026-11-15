import styles from "~/styles/pages.module.css"
import type { Route } from "./+types/about"

const headings: Record<string, string> = { en: "About Trellis", fr: "À propos de Trellis", de: "Über Trellis" }

export default function About({ params }: Route.ComponentProps) {
  return (
    <section className={`${styles.page} ${styles.narrow}`}>
      <h1 className={styles.title}>{headings[params.lang ?? "en"] ?? headings.en}</h1>
      <p className={styles.lead}>We started Trellis in 2024 to give small teams one place for their plans.</p>
    </section>
  )
}
