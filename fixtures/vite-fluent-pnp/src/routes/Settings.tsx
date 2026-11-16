import { Dropdown, Field, Input, makeStyles, Option, Switch, Title2, tokens } from "@fluentui/react-components"
import { SettingsSection } from "../components/SettingsSection.tsx"

const useStyles = makeStyles({
  sections: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXL,
    marginTop: tokens.spacingVerticalL
  }
})

export function Settings() {
  const styles = useStyles()

  return (
    <>
      <Title2>Settings</Title2>
      <div className={styles.sections}>
        <SettingsSection title="Workspace">
          <Field label="Name">
            <Input defaultValue="Relay support" />
          </Field>
          <Field label="Default priority">
            <Dropdown defaultValue="Normal" defaultSelectedOptions={["normal"]}>
              <Option value="urgent">Urgent</Option>
              <Option value="high">High</Option>
              <Option value="normal">Normal</Option>
              <Option value="low">Low</Option>
            </Dropdown>
          </Field>
        </SettingsSection>
        <SettingsSection title="Notifications">
          <Switch label="Email me when a ticket is assigned to me" defaultChecked />
          <Switch label="Send a daily summary" />
        </SettingsSection>
      </div>
    </>
  )
}
