import type { ReactNode } from "react"
import { NavBar } from "@/components/NavBar"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </>
  )
}
