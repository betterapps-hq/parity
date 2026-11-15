import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { styled } from '@mui/material/styles'
import InboxOutlined from '@mui/icons-material/InboxOutlined'

// Styled with Emotion through MUI's styled().
const Frame = styled(Stack)(({ theme }) => ({
  alignItems: 'center',
  gap: theme.spacing(1.5),
  padding: theme.spacing(6, 3),
  border: `1px dashed ${theme.vars.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  textAlign: 'center',
}))

export default function EmptyState({ title = 'No projects yet', action = 'New project' }) {
  return (
    <Frame>
      <InboxOutlined color="disabled" sx={{ fontSize: 48 }} />
      <Typography variant="h6">{title}</Typography>
      {action && <Button variant="contained">{action}</Button>}
    </Frame>
  )
}
