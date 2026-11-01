import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { UpdateState } from "@parity-app/core"
import { app } from "electron"
import electronUpdater from "electron-updater"
import { noStableRelease } from "./github-releases.ts"
import { isPackaged } from "./packaged.ts"
import { UpdateSession } from "./update-session.ts"

/** Installed builds use electron-builder's embedded app-update.yml. Tests can package their own local feed. */
export function createUpdates(changed: (state: UpdateState) => void): UpdateSession {
  const file = join(app.getPath("userData"), "updates.json")
  let beta = false
  try {
    const saved: unknown = JSON.parse(readFileSync(file, "utf8"))
    beta = typeof saved === "object" && saved !== null && "beta" in saved && saved.beta === true
  } catch {
    /* A fresh install starts on the stable channel. */
  }

  const enabled = isPackaged(app.isPackaged, process.env) && (process.platform !== "linux" || !!process.env.APPIMAGE)
  // Only an installed build has an updater. Making one checks the app's version, which a copy run from its bundles, as
  // `pnpm dev` runs on any port but 5310, doesn't have: it was "0.0", and main stopped before its window opened.
  const autoUpdater = enabled ? electronUpdater.autoUpdater : undefined
  if (autoUpdater) {
    autoUpdater.autoDownload = false
    // quitAndInstall starts the installer before asking Electron to quit. Only our acknowledged close flow calls it.
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowDowngrade = false
    autoUpdater.logger = console
  }
  // A disabled session never reaches its driver.
  const updater = () => {
    if (!autoUpdater) throw new Error("Updates are off in this build")
    return autoUpdater
  }
  const session = new UpdateSession({
    enabled,
    manual: process.platform === "darwin",
    beta,
    changed,
    saveBeta: (next) => writeFileSync(file, JSON.stringify({ beta: next })),
    driver: {
      check: async (next) => {
        updater().allowPrerelease = next
        updater().allowDowngrade = false
        try {
          const result = await updater().checkForUpdates()
          return result?.isUpdateAvailable ? result.updateInfo.version : undefined
        } catch (error) {
          if (await noStableRelease(error, next)) return undefined
          throw error
        }
      },
      download: async (progress) => {
        const listener = (reading: { transferred: number; total: number }) =>
          progress(reading.transferred, reading.total)
        updater().on("download-progress", listener)
        try {
          await updater().downloadUpdate()
        } finally {
          updater().removeListener("download-progress", listener)
        }
      },
      install: () => updater().quitAndInstall(true, true)
    }
  })
  // check/download reject too and the session handles those. Install failures are delivered only through this event.
  autoUpdater?.on("error", (error: Error) => {
    if (session.get().phase === "installing") session.fail(error)
  })
  return session
}
