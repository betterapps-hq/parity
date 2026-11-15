import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { useParams } from 'react-router'
import { SiteHeader } from '../components/SiteHeader.jsx'

export function Docs() {
  const page = useParams()['*'] || 'introduction'

  return (
    <>
      <SiteHeader />
      <Container component="main" sx={{ py: 4 }}>
        <Typography variant="overline">Docs</Typography>
        <Typography variant="h4">{page}</Typography>
      </Container>
    </>
  )
}
