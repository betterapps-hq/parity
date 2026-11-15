import { Alert, Button } from "@chakra-ui/react"

export interface NoticeBannerProps {
  title: string
  description: string
  action?: string
}

export function NoticeBanner({ title, description, action = "Review" }: NoticeBannerProps) {
  return (
    <Alert.Root status="info">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{description}</Alert.Description>
      </Alert.Content>
      <Button size="sm" variant="outline">
        {action}
      </Button>
    </Alert.Root>
  )
}
