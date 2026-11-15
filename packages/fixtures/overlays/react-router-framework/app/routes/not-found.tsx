import { EmptyState } from "~/components/EmptyState"
import styles from "~/styles/pages.module.css"

export default function NotFound() {
  return (
    <main className={`${styles.page} ${styles.narrow}`}>
      <EmptyState title="There's no page here" action="Go home" to="/" />
    </main>
  )
}
