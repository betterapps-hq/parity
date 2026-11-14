import type { AppSettings, ExtensionSettings, SettingKey } from "@parity-app/settings"

/** What main holds of `settings.json` and sends every window (`docs/proposals/settings.md`). */
export interface SettingsState {
  values: AppSettings
  /** Extensions' `app` settings, by extension and then key, unchecked: each extension's schema checks its own. */
  extensions: ExtensionSettings
  /** Settings whose saved value didn't read, and so are at their default. */
  badValues: SettingKey[]
  /** Why the file couldn't be read, when it couldn't. Main then won't write over it. */
  problem?: string
  /** Changes this copy couldn't save yet, which hold for this run and are tried again. */
  unsaved?: true
}
