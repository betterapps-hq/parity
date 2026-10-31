import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { UpdateState } from "@parity-app/core"
import { app } from "electron"
import electronUpdater from "electron-updater"
import { noStableRelease } from "./github-releases.ts"
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

  const { autoUpdater } = electronUpdater
  autoUpdater.autoDownload = false
  // quitAndInstall starts the installer before asking Electron to quit. Only our acknowledged close flow calls it.
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = console
  const session = new UpdateSession({
    enabled: app.isPackaged && (process.platform !== "linux" || !!process.env.APPIMAGE),
    manual: process.platform === "darwin",
    beta,
    changed,
    saveBeta: (next) => writeFileSync(file, JSON.stringify({ beta: next })),
    driver: {
      check: async (next) => {
        autoUpdater.allowPrerelease = next
        autoUpdater.allowDowngrade = false
        try {
          const result = await autoUpdater.checkForUpdates()
          return result?.isUpdateAvailable ? result.updateInfo.version : undefined
        } catch (error) {
          if (await noStableRelease(error, next)) return undefined
          throw error
        }
      },
      download: async (progress) => {
        const listener = (reading: { transferred: number; total: number }) =>
          progress(reading.transferred, reading.total)
        autoUpdater.on("download-progress", listener)
        try {
          await autoUpdater.downloadUpdate()
        } finally {
          autoUpdater.removeListener("download-progress", listener)
        }
      },
      install: () => autoUpdater.quitAndInstall(true, true)
    }
  })
  // check/download reject too and the session handles those. Install failures are delivered only through this event.
  autoUpdater.on("error", (error: Error) => {
    if (session.get().phase === "installing") session.fail(error)
  })
  return session
}
