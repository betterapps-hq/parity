import { SonnerToaster, TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { useEffect } from "react"
import { accountActions, startAccount, useAccount } from "./account/account.ts"
import { SignInDialog, SignInScreen, UntilQuitDialog } from "./account/SignIn.tsx"
import { serveAgents } from "./agent/handlers.ts"
import { useAppShortcuts } from "./canvas/shortcuts.ts"
import { AboutDialog } from "./chrome/AboutDialog.tsx"
import { ActionsSearch } from "./chrome/ActionsSearch.tsx"
import { ConvertToFrameDialog } from "./chrome/ConvertToFrameDialog.tsx"
import { QuickInsert } from "./chrome/QuickInsert.tsx"
import { offerLastCrashReport, ReportProblemDialog } from "./chrome/ReportProblemDialog.tsx"
import { SettingsDialog } from "./chrome/SettingsDialog.tsx"
import { ShortcutsDialog } from "./chrome/ShortcutsDialog.tsx"
import { TabBar } from "./chrome/TabBar.tsx"
import { UnsavedPrompt } from "./chrome/UnsavedPrompt.tsx"
import { startUpdates } from "./chrome/updates.tsx"
import { startConsole } from "./console-feed.ts"
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
    startConsole()
    startAccount()
    offerLastCrashReport()
  }, [])

  return <AppWindow />
}

/**
 * The window's contents: the tabs, Home, each open project or new tab, and the app's dialogs. On first launch the
 * sign-in screen shows in Home's place, until the person signs in, goes on without, or opens a project another way.
 */
export function AppWindow() {
  const tabs = useTabs()
  const active = useActiveTabId()
  const home = useHomeActive()
  const theme = useResolvedTheme()
  const account = useAccount()
  const signInScreen = account.place === "screen"
  useAppShortcuts()
  useEffect(() => {
    if (signInScreen && tabs.length > 0) accountActions.leaveScreen()
  }, [signInScreen, tabs.length])

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-background text-foreground">
        <TabBar />
        {signInScreen && tabs.length === 0 && <SignInScreen state={account.state} />}
        <HomePage active={home && !(signInScreen && tabs.length === 0)} />
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
      <ConvertToFrameDialog />
      <ShortcutsDialog />
      <AboutDialog />
      <ReportProblemDialog />
      <UnsavedPrompt />
      <SignInDialog />
      <UntilQuitDialog />
    </TooltipProvider>
  )
}
