import { Outlet } from "react-router"
import { SiteHeader } from "~/components/SiteHeader"

export default function MarketingLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-border text-muted-foreground border-t px-6 py-8 text-sm">© 2026 Trellis</footer>
    </div>
  )
}
