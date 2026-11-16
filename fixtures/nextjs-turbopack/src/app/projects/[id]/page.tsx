import { ProjectSettings } from "@/components/ProjectSettings"

export default async function Project({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Project {id}</h1>
      <ProjectSettings />
    </>
  )
}
