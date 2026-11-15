import { Outlet } from "react-router"
import { SiteHeader } from "~/components/SiteHeader"
import styles from "./marketing.module.css"

export default function MarketingLayout() {
  return (
    <div className={styles.layout}>
      <SiteHeader />
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>© 2026 Trellis</footer>
    </div>
  )
}
