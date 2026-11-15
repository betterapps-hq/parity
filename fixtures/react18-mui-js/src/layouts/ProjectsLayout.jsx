import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { Outlet } from 'react-router'
import { SiteHeader } from '../components/SiteHeader.jsx'

export function ProjectsLayout() {
  return (
    <>
      <SiteHeader />
      <Container component="main" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>
          Projects
        </Typography>
        <Outlet />
      </Container>
    </>
  )
}
