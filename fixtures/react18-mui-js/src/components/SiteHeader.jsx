import AppBar from '@mui/material/AppBar'
import Button from '@mui/material/Button'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'
import { ThemeToggle } from './ThemeToggle.jsx'

export function SiteHeader({ title = 'Northwind' }) {
  return (
    <AppBar position="static" elevation={0}>
      <Toolbar sx={{ gap: 1 }}>
        <Typography variant="h6" component={Link} to="/" sx={{ flexGrow: 1, color: 'inherit', textDecoration: 'none' }}>
          {title}
        </Typography>
        <Button color="inherit" component={Link} to="/projects">
          Projects
        </Button>
        <Button color="inherit" component={Link} to="/pricing">
          Pricing
        </Button>
        <ThemeToggle />
      </Toolbar>
    </AppBar>
  )
}
