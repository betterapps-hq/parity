import Avatar from '@mui/material/Avatar'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'
import { StatusChip } from './StatusChip.jsx'

export function ProjectCard({ id = 'atlas', name = 'Atlas', owner = 'Ada Lovelace', status = 'active', description }) {
  return (
    <Card variant="outlined">
      <CardActionArea component={Link} to={`/projects/${id}`}>
        <CardHeader
          avatar={<Avatar>{owner[0]}</Avatar>}
          title={name}
          subheader={owner}
          action={<StatusChip status={status} />}
        />
        {description && (
          <CardContent sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          </CardContent>
        )}
      </CardActionArea>
    </Card>
  )
}
