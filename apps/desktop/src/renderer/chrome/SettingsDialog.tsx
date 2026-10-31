import { Monitor, Moon, Sun } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { workspace } from "../workspace.ts"
import { closeDialog, useOpenDialog } from "./app-dialogs.ts"
import { type Preferences, setPreferences, type ThemePreference, usePreferences } from "./preferences.ts"
import { setBetaUpdates, useUpdates } from "./updates.tsx"

const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor }
]

/** Every preference in one place, from Edit > Settings or Ctrl+,. The View menu keeps the ones flipped while working. */
export function SettingsDialog() {
  const open = useOpenDialog() === "settings"
  const preferences = usePreferences()
  const updates = useUpdates()
  const [updateError, setUpdateError] = useState("")
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="gap-0 sm:max-w-lg">
        <DialogHeader className="pb-2">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>For every project, and remembered between runs.</DialogDescription>
        </DialogHeader>
        <Section title="Appearance">
          <Row label="Theme" detail="Parity's own look. Designs show whichever theme their mode picks.">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={preferences.theme}
              onValueChange={(theme) => theme && setPreferences({ theme: theme as ThemePreference })}
              aria-label="Theme"
            >
              {themes.map(({ value, label, icon: Icon }) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  className="gap-1.5 px-2.5 text-muted-foreground aria-checked:text-foreground"
                >
                  <Icon /> {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
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
            label="Snap to designs"
            detail="Designs lock to the edges and centers of the designs around them while dragged."
          >
            <Switch
              checked={preferences.snapping}
              onCheckedChange={(snapping) => setPreferences({ snapping })}
              aria-label="Snap to designs"
            />
          </Row>
          <Row label="Layout grid" detail="Column grids over every frame, sized for its viewport.">
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
        <Section title="Export">
          <Row label="Image scale" detail="How many pixels each CSS pixel becomes in exported PNGs.">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={String(preferences.exportScale)}
              onValueChange={(scale) =>
                scale && setPreferences({ exportScale: Number(scale) as Preferences["exportScale"] })
              }
              aria-label="Image scale"
            >
              {[1, 2, 3].map((scale) => (
                <ToggleGroupItem
                  key={scale}
                  value={String(scale)}
                  className="px-3 text-muted-foreground aria-checked:text-foreground"
                >
                  {scale}x
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
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
          {updateError && (
            <p role="alert" className="text-xs text-destructive">
              {updateError}
            </p>
          )}
        </Section>
      </DialogContent>
    </Dialog>
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

function Row({ label, detail, children }: { label: string; detail: string; children: ReactNode }) {
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
