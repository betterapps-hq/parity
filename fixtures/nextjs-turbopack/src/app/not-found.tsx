import Link from "next/link"

export default function NotFound() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Not found</h1>
      <Link href="/" className="text-brand underline">
        Back to the dashboard
      </Link>
    </main>
  )
}
