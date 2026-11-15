import { Avatar } from "@/components/Avatar"

export default async function Doc({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold">{slug.join(" / ")}</h1>
      <Avatar name="Ada Lovelace" />
    </main>
  )
}
