import Stack from '@mui/material/Stack'
import { useLoaderData } from 'react-router'
import EmptyState from '../components/EmptyState.jsx'
import { ProjectCard } from '../components/ProjectCard.jsx'

export function ProjectList() {
  const projects = useLoaderData()

  if (projects.length === 0) {
    return <EmptyState />
  }

  return (
    <Stack spacing={2}>
      {projects.map((project) => (
        <ProjectCard key={project.id} {...project} />
      ))}
    </Stack>
  )
}
