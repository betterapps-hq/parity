import { useEffect } from "react"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { serveAgents } from "./agent/handlers.ts"
import { useAppShortcuts } from "./canvas/shortcuts.ts"
import { AboutDialog } from "./chrome/AboutDialog.tsx"
import { ActionsSearch } from "./chrome/ActionsSearch.tsx"
import { QuickInsert } from "./chrome/QuickInsert.tsx"
import { SettingsDialog } from "./chrome/SettingsDialog.tsx"
import { ShortcutsDialog } from "./chrome/ShortcutsDialog.tsx"
import { StartScreen } from "./chrome/StartScreen.tsx"
import { TabBar } from "./chrome/TabBar.tsx"
import { UnsavedPrompt } from "./chrome/UnsavedPrompt.tsx"
import { startUpdates } from "./chrome/updates.tsx"
import { ProjectView } from "./ProjectView.tsx"
import { useActiveTabId, useTabs, workspace } from "./workspace.ts"

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

/** The window's contents: the tabs, each open project, and the app's dialogs, for whatever tabs are open. */
export function AppWindow() {
  const tabs = useTabs()
  const active = useActiveTabId()
  useAppShortcuts()

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-background text-foreground">
        <TabBar />
        {tabs.length === 0 ? (
          <StartScreen />
        ) : (
          tabs.map((tab) => <ProjectView key={tab.id} id={tab.id} active={tab.id === active} />)
        )}
      </div>
      <Toaster position="bottom-right" offset={{ bottom: 40, right: 16 }} />
      <QuickInsert />
      <ActionsSearch />
      <SettingsDialog />
      <ShortcutsDialog />
      <AboutDialog />
      <UnsavedPrompt />
    </TooltipProvider>
  )
}
