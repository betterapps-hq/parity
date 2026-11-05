import { SonnerToaster, TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { useEffect } from "react"
import { serveAgents } from "./agent/handlers.ts"
import { useAppShortcuts } from "./canvas/shortcuts.ts"
import { AboutDialog } from "./chrome/AboutDialog.tsx"
import { ActionsSearch } from "./chrome/ActionsSearch.tsx"
import { QuickInsert } from "./chrome/QuickInsert.tsx"
import { SettingsDialog } from "./chrome/SettingsDialog.tsx"
import { ShortcutsDialog } from "./chrome/ShortcutsDialog.tsx"
import { TabBar } from "./chrome/TabBar.tsx"
import { UnsavedPrompt } from "./chrome/UnsavedPrompt.tsx"
import { startUpdates } from "./chrome/updates.tsx"
import { ProjectView } from "./ProjectView.tsx"
import { HomePage } from "./start/HomePage.tsx"
import { NewTabPage } from "./start/NewTabPage.tsx"
import { useResolvedTheme } from "./theme.ts"
import { useActiveTabId, useHomeActive, useTabs, workspace } from "./workspace.ts"

let started = false

export function App() {
  useEffect(() => {
    if (started) return
    started = true
    serveAgents()
    workspace.restore()
    // Closing the window first asks about unsaved changes, and can be cancelled.
    window.canvasHost.onClosing(() => workspace.confirmQuit())
    window.canvasHost.onReconnect(() => void workspace.reconnect())
    startUpdates()
  }, [])

  return <AppWindow />
}

/** The window's contents: the tabs, Home, each open project or new tab, and the app's dialogs. */
export function AppWindow() {
  const tabs = useTabs()
  const active = useActiveTabId()
  const home = useHomeActive()
  const theme = useResolvedTheme()
  useAppShortcuts()

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-background text-foreground">
        <TabBar />
        <HomePage active={home} />
        {tabs.map((tab) =>
          tab.blank ? (
            <NewTabPage key={tab.id} active={tab.id === active} />
          ) : (
            <ProjectView key={tab.id} id={tab.id} active={tab.id === active} />
          )
        )}
      </div>
      <SonnerToaster
        theme={theme}
        position="bottom-right"
        offset={{ bottom: 40, right: 16 }}
        mobileOffset={{ bottom: 40, left: 16, right: 16 }}
      />
      <QuickInsert />
      <ActionsSearch />
      <SettingsDialog />
      <ShortcutsDialog />
      <AboutDialog />
      <UnsavedPrompt />
    </TooltipProvider>
  )
}
