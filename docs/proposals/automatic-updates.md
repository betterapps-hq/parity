# Automatic updates before publisher signing

PAR-160 can ship Windows and Linux updates before PAR-399 finishes signing. macOS keeps update checks and a download
link until Developer ID signing is available; the standard Mac updater cannot install unsigned updates.

## Behaviour

- The installed app checks GitHub Releases on startup and through Help > Check for updates. The Mac application menu
  offers the same check. Development builds never download or install updates.
- Windows NSIS and Linux AppImage installations download a newer version in the background. One bottom-right toast
  updates its progress in place while the person keeps working. Dismissing it does not cancel the download. When ready,
  it becomes a persistent notice with Restart to update and Later. Restart uses the existing unsaved-work flow;
  cancelling it leaves the update ready for later. About keeps the update status and restart action available after a
  notice is dismissed. The app does not install automatically while quitting.
- Unsigned macOS builds check for a newer version and offer its GitHub release download page. They never attempt an
  in-place installation. Signing later enables the normal Mac updater.
- Get beta updates is saved across runs. It chooses GitHub pre-releases as well as stable releases without allowing
  downgrades. About identifies the selected channel. Beta and stable selection must work with the existing GitHub
  pre-release flags and numeric desktop versions.
- Keep the installers, Mac ZIPs, blockmaps, latest manifests and desktop-release.json together. Existing 0.2.0 users
  install the first updater-enabled version manually once.

## Implementation and verification

Use electron-updater, the library already named in the release proposal, with a version compatible with the installed
electron-builder. It handles platform-specific download, checksum verification and installation rather than a custom
installer. Until publisher signing is configured, Windows updates cannot authenticate a publisher signature; they rely
on the official HTTPS release feed and its checksums. Signing remains separate work.

Keep update state and settings in the main process, with a narrow preload API for the UI. Only the app's own renderer
can request a check, change the channel or request restart. Tests cover channel selection, concurrent checks, progress,
failures, unsigned Mac fallback and cancelling restart with unsaved changes. CI additionally exercises two installed
versions through the real download/install/relaunch path. No local E2E tests.

The owner approved adding electron-updater on 2026-10-31 and signed off on the implemented toast stories in both themes.
`UpdateToast.stories.tsx` keeps the approved download, restart and Mac designs alongside an interactive toast-host
preview. `UpdateDialogs.stories.tsx` shows About and the beta setting for review. E2E runs only in CI.
