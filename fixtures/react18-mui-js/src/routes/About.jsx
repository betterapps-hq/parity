import Typography from '@mui/material/Typography'
import { useParams } from 'react-router'

export function About() {
  const { lang = 'en' } = useParams()

  return (
    <>
      <Typography variant="h3" component="h1" gutterBottom>
        {lang === 'fr' ? 'À propos' : 'About'}
      </Typography>
      <Typography color="text.secondary">A small team building tools for planners.</Typography>
    </>
  )
}
