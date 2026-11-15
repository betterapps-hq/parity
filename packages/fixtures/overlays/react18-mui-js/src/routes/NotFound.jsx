import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'

export function NotFound() {
  return (
    <Container component="main" sx={{ py: 8 }}>
      <Typography variant="h4" gutterBottom>
        Page not found
      </Typography>
      <Typography color="text.secondary" gutterBottom>
        Check the address and try again.
      </Typography>
      <Button component={Link} to="/">
        Go home
      </Button>
    </Container>
  )
}
