import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import { Link, useLoaderData } from 'react-router'
import EmptyState from '../components/EmptyState.jsx'
import { StatusChip } from '../components/StatusChip.jsx'

export function ProjectPage() {
  const project = useLoaderData()

  if (!project) {
    return <EmptyState title="Project not found" action={null} />
  }

  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Button startIcon={<ArrowBackRounded />} component={Link} to="/projects">
        All projects
      </Button>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="h5">{project.name}</Typography>
        <StatusChip status={project.status} />
      </Stack>
      <Typography color="text.secondary">{project.description}</Typography>
    </Stack>
  )
}
