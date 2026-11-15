import Chip from '@mui/material/Chip'

const colors = { active: 'success', paused: 'warning', archived: 'default' }

export function StatusChip({ status = 'active' }) {
  return <Chip size="small" label={status} color={colors[status]} variant="outlined" />
}
