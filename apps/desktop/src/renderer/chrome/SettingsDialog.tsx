import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Switch,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { type CodeEditorChoice, codeEditors } from "@parity-app/processes"
import { Monitor, Moon, Sun } from "lucide-react"
import { type ReactNode, useState } from "react"
import { workspace } from "../workspace.ts"
import { closeDialog, useOpenDialog } from "./app-dialogs.ts"
import { AppSelect } from "./AppSelect.tsx"
import { DialogGroupTitle } from "./PanelSection.tsx"
import { type Preferences, setPreferences, type ThemePreference, usePreferences } from "./preferences.ts"
import { setTelemetryLevel, useTelemetry } from "./telemetry-setting.ts"
import { setBetaUpdates, useUpdates } from "./updates.tsx"

const themes: Option<ThemePreference>[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor }
]

const scales: Option<`${Preferences["exportScale"]}`>[] = [
  { value: "1", label: "1x" },
  { value: "2", label: "2x" },
  { value: "3", label: "3x" }
]

const scaleValues = { "1": 1, "2": 2, "3": 3 } as const satisfies Record<
  `${Preferences["exportScale"]}`,
  Preferences["exportScale"]
>

/** What the switch shares. It reads the same on and off, so turning it doesn't move the dialog (PAR-703). */
const telemetryDetail = "Errors and crashes, sent to the Parity team to help fix bugs."

/** Where View code opens a file: the first editor installed, a named one, or the system's choice. */
const editorChoices: { value: CodeEditorChoice; label: string }[] = [
  { value: "auto", label: "Automatic" },
  ...codeEditors.map((editor) => ({ value: editor.id, label: editor.name })),
  { value: "system", label: "System default" }
]

/** Every preference in one place, from Edit > Settings or Ctrl+,. The View menu keeps the ones flipped while working. */
export function SettingsDialog() {
  const open = useOpenDialog() === "settings"
  const preferences = usePreferences()
  const updates = useUpdates()
  const [updateError, setUpdateError] = useState("")

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="max-h-[calc(100%-2rem)] gap-0 overflow-y-auto sm:max-w-lg">
        <DialogHeader className="pb-2">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>For every project, and remembered between runs.</DialogDescription>
        </DialogHeader>
        <Section title="Appearance">
          <Row label="Theme" detail="Parity's own look. Previews show whichever theme their mode picks.">
            <Choice
              label="Theme"
              options={themes}
              value={preferences.theme}
              onChange={(theme) => setPreferences({ theme })}
            />
          </Row>
        </Section>
        <Section title="Saving">
          <Row
            label="Save automatically"
            detail="Each change saves itself a moment after it's made, instead of waiting for Save."
          >
            <Switch
              checked={preferences.autosave}
              onCheckedChange={(autosave) => {
                setPreferences({ autosave })

                // Turning it on saves what's waiting now, rather than at the next edit.
                if (autosave) {
                  void workspace.flush().catch(() => undefined)
                }
              }}
              aria-label="Save automatically"
            />
          </Row>
        </Section>
        <Section title="Canvas">
          <Row
            label="Snap to screens and components"
            detail="Screens and components line up with the edges and centers of those around them while dragged."
          >
            <Switch
              checked={preferences.snapping}
              onCheckedChange={(snapping) => setPreferences({ snapping })}
              aria-label="Snap to screens and components"
            />
          </Row>
          <Row label="Layout grid" detail="Column grids over every preview, sized for its viewport.">
            <Switch
              checked={preferences.layoutGrid}
              onCheckedChange={(layoutGrid) => setPreferences({ layoutGrid })}
              aria-label="Layout grid"
            />
          </Row>
          <Row label="Performance stats" detail="Frame rate, memory and CPU in the status bar.">
            <Switch
              checked={preferences.performanceStats}
              onCheckedChange={(performanceStats) => setPreferences({ performanceStats })}
              aria-label="Performance stats"
            />
          </Row>
        </Section>
        <Section title="Code">
          <Row
            label="Editor"
            detail="Where View code opens a component's file. Automatic uses the first one installed."
          >
            <AppSelect<CodeEditorChoice>
              variant="dialog"
              size="sm"
              aria-label="Editor"
              className="w-36"
              items={editorChoices}
              value={preferences.codeEditor}
              onValueChange={(codeEditor) => codeEditor && setPreferences({ codeEditor })}
            />
          </Row>
        </Section>
        <Section title="Export">
          <Row label="Image scale" detail="How many pixels each CSS pixel becomes in exported PNGs.">
            <Choice
              label="Image scale"
              options={scales}
              value={`${preferences.exportScale}`}
              onChange={(scale) => setPreferences({ exportScale: scaleValues[scale] })}
            />
          </Row>
        </Section>
        <Section title="Updates">
          <Row label="Get beta updates" detail="Include early releases. They may be less stable.">
            <Switch
              checked={updates.beta}
              disabled={["disabled", "checking", "downloading", "installing"].includes(updates.phase)}
              aria-label="Get beta updates"
              onCheckedChange={(beta) => {
                setUpdateError("")
                void setBetaUpdates(beta).catch(() => setUpdateError("Couldn't save the beta setting. Try again."))
              }}
            />
          </Row>
          <Problem message={updateError} />
        </Section>
        <TelemetrySection open={open} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * Whether Parity shares diagnostics to help fix bugs (PAR-626): on is everything, off is nothing. Main keeps the level;
 * a variable set when Parity started decides it for that run, so the switch shows it and can't be changed until the
 * variable is removed.
 */
function TelemetrySection({ open }: { open: boolean }) {
  const telemetry = useTelemetry(open)
  const [error, setError] = useState("")

  if (!telemetry) {
    return null
  }

  const detail = (
    <>
      {telemetryDetail}
      {telemetry.overriddenBy && (
        <>
          {" "}
          Set by <code className="font-mono">{telemetry.overriddenBy}</code> for this run.
        </>
      )}
    </>
  )

  return (
    <Section title="Privacy">
      <Row label="Share diagnostics" detail={detail}>
        <Switch
          checked={telemetry.level !== "off"}
          disabled={telemetry.overriddenBy !== undefined}
          aria-label="Share diagnostics"
          onCheckedChange={(on) => {
            setError("")
            void setTelemetryLevel(on ? "all" : "off").catch(() => setError("Couldn't save this setting. Try again."))
          }}
        />
      </Row>
      <Problem message={error} />
    </Section>
  )
}

interface Option<T extends string> {
  value: T
  label: string
  icon?: typeof Sun
}

/** One of a few values, as a row of buttons: the theme, the export scale. */
function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled
}: {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      value={[value]}
      disabled={disabled}
      // SAFETY: the group's items are the options, whose values are all T.
      onValueChange={([next]) => next && onChange(next as T)}
      aria-label={label}
    >
      {options.map(({ value: option, label: name, icon: Icon }) => (
        <ToggleGroupItem
          key={option}
          value={option}
          className="gap-1.5 px-2.5 text-muted-foreground aria-pressed:text-foreground"
        >
          {Icon && <Icon />}
          {name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** A save that failed, under the section it belongs to. */
function Problem({ message }: { message: string }) {
  if (!message) {
    return null
  }

  return (
    <p role="alert" className="type-message text-destructive">
      {message}
    </p>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t pt-4 pb-2 first-of-type:border-t-0">
      <DialogGroupTitle>{title}</DialogGroupTitle>
      {children}
    </section>
  )
}

function Row({ label, detail, children }: { label: string; detail: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        <div className="type-description text-muted-foreground">{detail}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
