import Container from '@mui/material/Container'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { SiteHeader } from '../components/SiteHeader.jsx'

// Loaded by the router's `lazy`, which draws the module's Component export.
export function Component() {
  return (
    <>
      <SiteHeader />
      <Container component="main" maxWidth="sm" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>
          Settings
        </Typography>
        <Stack spacing={2}>
          <TextField label="Team name" defaultValue="Northwind" />
          <FormControlLabel control={<Switch defaultChecked />} label="Email me when a project changes" />
        </Stack>
      </Container>
    </>
  )
}
