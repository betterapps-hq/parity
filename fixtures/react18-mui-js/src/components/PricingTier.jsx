import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import CheckRounded from '@mui/icons-material/CheckRounded'

export function PricingTier({
  name = 'Team',
  price = '$12',
  features = ['Unlimited projects', 'Shared designs'],
  featured = false,
}) {
  return (
    <Card variant={featured ? 'elevation' : 'outlined'} raised={featured}>
      <CardContent>
        <Typography variant="overline">{name}</Typography>
        <Typography variant="h3" component="p">
          {price}
          <Typography component="span" color="text.secondary">
            {' a month'}
          </Typography>
        </Typography>
        <List dense>
          {features.map((feature) => (
            <ListItem key={feature} disableGutters>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <CheckRounded color="primary" fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={feature} />
            </ListItem>
          ))}
        </List>
      </CardContent>
      <CardActions>
        <Button fullWidth variant={featured ? 'contained' : 'outlined'}>
          Choose {name}
        </Button>
      </CardActions>
    </Card>
  )
}
