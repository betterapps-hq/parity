import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { Outlet } from 'react-router'
import { SiteHeader } from '../components/SiteHeader.jsx'

export function MarketingLayout() {
  return (
    <>
      <SiteHeader />
      <Container component="main" sx={{ py: 6 }}>
        <Outlet />
      </Container>
      <Container component="footer" sx={{ py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          Northwind, since 2024
        </Typography>
      </Container>
    </>
  )
}
