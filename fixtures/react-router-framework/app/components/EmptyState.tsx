import { FolderOpen } from "@phosphor-icons/react"
import { Link } from "react-router"
import { Button } from "./Button"
import styles from "./EmptyState.module.css"

/** What a page shows when there's nothing to list, with a way forward. */
export function EmptyState({ title, action, to }: { title: string; action: string; to: string }) {
  return (
    <div className={styles.empty}>
      <FolderOpen size={32} weight="duotone" className={styles.icon} />
      <p className={styles.title}>{title}</p>
      <Button asChild variant="secondary">
        <Link to={to}>{action}</Link>
      </Button>
    </div>
  )
}
