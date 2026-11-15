import { Outlet } from "react-router"
import styles from "~/styles/pages.module.css"

// A layout without a path of its own, for the pages that ask for your password again.
export default function Secure() {
  return (
    <div className={styles.inset}>
      <Outlet />
    </div>
  )
}
