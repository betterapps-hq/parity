import { Badge, Button, Card, FluentProvider, Text, webLightTheme } from "@fluentui/react-components"
import { AddRegular } from "@fluentui/react-icons"

export function App() {
  return (
    <FluentProvider theme={webLightTheme}>
      <Card style={{ margin: 32, maxWidth: 480 }}>
        <Text weight="semibold">Fluent validation</Text>
        <Text>
          Fluent UI v9 with Griffel, and Fluent icons. <Badge>New</Badge>
        </Text>
        <Button appearance="primary" icon={<AddRegular />}>
          Add
        </Button>
      </Card>
    </FluentProvider>
  )
}
