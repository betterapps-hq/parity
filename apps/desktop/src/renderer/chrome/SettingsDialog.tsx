import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { type CodeEditorChoice, codeEditors } from "@parity-app/core"
import type { TelemetryLevel } from "@parity-app/telemetry"
import { Monitor, Moon, Sun } from "lucide-react"
import { type ReactNode, useState } from "react"
import { workspace } from "../workspace.ts"
import { closeDialog, useOpenDialog } from "./app-dialogs.ts"
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

/** What the switch means, on and off. */
const telemetryDetails: Record<TelemetryLevel, string> = {
  all: "Errors, crashes and a recording of this window, so the Parity team can find and fix bugs.",
  off: "Nothing leaves this computer."
}

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
                if (autosave) void workspace.flush().catch(() => undefined)
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
            <Select
              items={editorChoices}
              value={preferences.codeEditor}
              onValueChange={(codeEditor) =>
                codeEditor && setPreferences({ codeEditor: codeEditor as CodeEditorChoice })
              }
            >
              <SelectTrigger size="sm" className="w-36" aria-label="Editor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {editorChoices.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </Section>
        <Section title="Export">
          <Row label="Image scale" detail="How many pixels each CSS pixel becomes in exported PNGs.">
            <Choice
              label="Image scale"
              options={scales}
              value={String(preferences.exportScale) as `${Preferences["exportScale"]}`}
              onChange={(scale) => setPreferences({ exportScale: Number(scale) as Preferences["exportScale"] })}
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
  if (!telemetry) return null
  const detail = (
    <>
      {telemetryDetails[telemetry.level]}
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
  if (!message) return null
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  )
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t py-2 first-of-type:border-t-0">
      <h3 className="pt-2 pb-1 text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, detail, children }: { label: string; detail: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
