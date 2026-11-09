import { SonnerToaster, TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { type ReactNode, useEffect } from "react"
import { accountActions, startAccount, useAccount } from "./account/account.ts"
import { SignInDialog, SignInScreen, UntilQuitDialog } from "./account/SignIn.tsx"
import { serveAgents } from "./agent/handlers.ts"
import { useAppShortcuts } from "./canvas/shortcuts.ts"
import { AboutDialog } from "./chrome/AboutDialog.tsx"
import { ActionsSearch } from "./chrome/ActionsSearch.tsx"
import { closeDialog } from "./chrome/app-dialogs.ts"
import { ConvertToFrameDialog, stopAskingToConvert } from "./chrome/ConvertToFrameDialog.tsx"
import { ErrorBoundary } from "./chrome/ErrorBoundary.tsx"
import { closeQuickInsert, QuickInsert } from "./chrome/QuickInsert.tsx"
import { offerLastCrashReport, ReportProblemDialog } from "./chrome/ReportProblemDialog.tsx"
import { SettingsDialog } from "./chrome/SettingsDialog.tsx"
import { ShortcutsDialog } from "./chrome/ShortcutsDialog.tsx"
import { TabBar } from "./chrome/TabBar.tsx"
import { cancelUnsaved } from "./chrome/unsaved.ts"
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
    if (started) {
      return
    }

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

  return (
    <WindowBoundary>
      <AppWindow />
    </WindowBoundary>
  )
}

/** The last resort: anything the boundaries closer in don't catch (PAR-667). */
export function WindowBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary name="window" label="Parity" kind="window" onReopen={reloadWindow} reopenLabel="Reload window">
      {children}
    </ErrorBoundary>
  )
}

/** Saves every project's changes, then loads the window afresh. If saving fails, the window stays as it is. */
function reloadWindow(): void {
  void workspace.flush().then(
    () => location.reload(),
    (error: unknown) => console.error("[window] couldn't save before reloading:", error)
  )
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
    if (signInScreen && tabs.length > 0) {
      accountActions.leaveScreen()
    }
  }, [signInScreen, tabs.length])

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-background text-foreground">
        <ErrorBoundary
          name="tab-bar"
          label="Tabs"
          kind="strip"
          className="h-10 shrink-0 border-b bg-neutral-100 pr-[150px] [-webkit-app-region:drag] *:[-webkit-app-region:no-drag] dark:bg-[#0a0a0a]"
        >
          <TabBar />
        </ErrorBoundary>
        {signInScreen && tabs.length === 0 && (
          <ErrorBoundary name="sign-in" label="Sign in" kind="page">
            <SignInScreen state={account.state} />
          </ErrorBoundary>
        )}
        <ErrorBoundary name="home" label="Home" kind="page" hidden={!home || (signInScreen && tabs.length === 0)}>
          <HomePage active={home && !(signInScreen && tabs.length === 0)} />
        </ErrorBoundary>
        {tabs.map((tab) =>
          tab.blank ? (
            <ErrorBoundary key={tab.id} name="new-tab" label="New tab" kind="page" hidden={tab.id !== active}>
              <NewTabPage active={tab.id === active} />
            </ErrorBoundary>
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
      {/* Each dialog fails on its own, and closing what it shows closes it (PAR-667). */}
      <ErrorBoundary name="quick-insert" label="Insert" kind="dialog" onClose={closeQuickInsert}>
        <QuickInsert />
      </ErrorBoundary>
      <ErrorBoundary name="search" label="Search" kind="dialog" onClose={closeDialog}>
        <ActionsSearch />
      </ErrorBoundary>
      <ErrorBoundary name="settings" label="Settings" kind="dialog" onClose={closeDialog}>
        <SettingsDialog />
      </ErrorBoundary>
      <ErrorBoundary name="convert-to-frame" label="Convert to frame" kind="dialog" onClose={stopAskingToConvert}>
        <ConvertToFrameDialog />
      </ErrorBoundary>
      <ErrorBoundary name="shortcuts" label="Keyboard shortcuts" kind="dialog" onClose={closeDialog}>
        <ShortcutsDialog />
      </ErrorBoundary>
      <ErrorBoundary name="about" label="About Parity" kind="dialog" onClose={closeDialog}>
        <AboutDialog />
      </ErrorBoundary>
      <ErrorBoundary name="report" label="Report a problem" kind="dialog" onClose={closeDialog}>
        <ReportProblemDialog />
      </ErrorBoundary>
      <ErrorBoundary name="unsaved" label="Save changes" kind="dialog" onClose={cancelUnsaved}>
        <UnsavedPrompt />
      </ErrorBoundary>
      <ErrorBoundary name="sign-in-dialog" label="Sign in" kind="dialog" onClose={accountActions.close}>
        <SignInDialog />
      </ErrorBoundary>
      <ErrorBoundary
        name="until-quit"
        label="Signed in until Parity quits"
        kind="dialog"
        onClose={() => accountActions.explainUntilQuit(false)}
      >
        <UntilQuitDialog />
      </ErrorBoundary>
    </TooltipProvider>
  )
}
