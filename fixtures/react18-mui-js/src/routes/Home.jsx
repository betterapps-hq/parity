import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'

export function Home() {
  return (
    <Stack spacing={3} sx={{ maxWidth: 560 }}>
      <Typography variant="h2" component="h1">
        Plan every project in one place
      </Typography>
      <Typography color="text.secondary">Northwind keeps your team's projects, owners and status together.</Typography>
      <Stack direction="row" spacing={2}>
        <Button variant="contained" component={Link} to="/projects">
          See projects
        </Button>
        <Button component={Link} to="/pricing">
          Pricing
        </Button>
      </Stack>
    </Stack>
  )
}
