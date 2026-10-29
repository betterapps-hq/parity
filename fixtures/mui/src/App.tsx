import { Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material"

export function App() {
  return (
    <Stack spacing={2} sx={{ p: 4, maxWidth: 480 }}>
      <Typography variant="h4">MUI validation</Typography>
      <Card>
        <CardContent>
          Material UI 9, styled with Emotion. <Chip label="New" size="small" />
        </CardContent>
      </Card>
      <Button variant="contained">Continue</Button>
    </Stack>
  )
}
