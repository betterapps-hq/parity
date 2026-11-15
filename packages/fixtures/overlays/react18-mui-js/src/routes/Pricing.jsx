import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { PricingTier } from '../components/PricingTier.jsx'

export function Pricing() {
  return (
    <>
      <Typography variant="h3" component="h1" gutterBottom>
        Pricing
      </Typography>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <PricingTier name="Starter" price="$0" features={['Three projects', 'One member']} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <PricingTier featured />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <PricingTier name="Company" price="$30" features={['Everything in Team', 'Single sign-on', 'Audit log']} />
        </Grid>
      </Grid>
    </>
  )
}
