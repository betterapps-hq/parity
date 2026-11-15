import type { ReactNode } from "react"
import { NavBar } from "@/components/NavBar"

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NavBar />
      <section className="mx-auto max-w-3xl p-6">{children}</section>
    </>
  )
}
