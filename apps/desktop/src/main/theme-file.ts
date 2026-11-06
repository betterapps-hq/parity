import { jsonText } from "@parity-app/core"
import { z } from "zod"
import { type ThemeSource, themeSource } from "../shared/ipc-checks.ts"

/** `theme.json`, where main keeps the app's theme so the window opens in it before the page loads. */
const themeFile = jsonText(z.object({ theme: themeSource.catch("dark") }))

/** The theme `theme.json`'s text keeps; dark when there's no file or it's malformed. */
export function savedTheme(text: string | undefined): ThemeSource {
  return themeFile.safeParse(text).data?.theme ?? "dark"
}
