import { SonnerToaster, TabsContent, TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import {
  Accessibility,
  Component,
  ImageIcon,
  Layers,
  MonitorSmartphone,
  Palette,
  SlidersHorizontal,
  Smile,
  X
} from "lucide-react"
import { useCallback, useEffect } from "react"
import type { Editor } from "tldraw"
import { CanvasDrop } from "../../canvas/CanvasDrop.tsx"
import { CanvasEditor } from "../../canvas/CanvasEditor.tsx"
import { CanvasOverlay } from "../../canvas/CanvasOverlay.tsx"
import { ProjectContext, useProject } from "../../canvas/context.ts"
import { useAppShortcuts, useShortcuts } from "../../canvas/shortcuts.ts"
import { AccessibilityPanel } from "../../chrome/AccessibilityPanel.tsx"
import { ComponentsPanel, IconsPanel, ImagesPanel } from "../../chrome/AssetsPanel.tsx"
import { matches } from "../../chrome/keys.ts"
import { ModesPanel } from "../../chrome/ModesPanel.tsx"
import { QuickInsert } from "../../chrome/QuickInsert.tsx"
import { SidePanel } from "../../chrome/SidePanel.tsx"
import { StatusBar } from "../../chrome/StatusBar.tsx"
import { TokensPanel } from "../../chrome/TokensPanel.tsx"
import { FloatingToolbar, ViewControls } from "../../chrome/Toolbar.tsx"
import { useTool } from "../../selection.ts"
import { useResolvedTheme } from "../../theme.ts"
import { type ProjectSession, useActiveTabId, useTabs, workspace } from "../../workspace.ts"
import { keysOf, makeNew } from "./commands.ts"
import { StartDesignTab } from "./StartInspector.tsx"
import { StartLayers } from "./StartLayers.tsx"
import { StartActionsSearch, StartCanvasMenu, StartMenubar } from "./StartMenus.tsx"

/**
 * The whole window as proposed, for the active tab's project: the title bar with the proposed menus, Layers, the
 * canvas with the proposed right-click menu, the inspector and the status bar. Everything else is the app's own: the
 * canvas, its toolbars, the other panels' tabs, the insert picker and the keys. New screen and New component make real
 * ones. There's no start in the middle of an empty canvas: every project opens on a screen (PAR-560).
 */
export function StartWindow({ search }: { search?: string }) {
  const tabs = useTabs()
  const active = useActiveTabId()
  const session = tabs.find((tab) => tab.id === active)?.session
  const theme = useResolvedTheme()
  useAppShortcuts()
  useShortcuts(session, true)
  useStartKeys(session)
  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <TitleBar />
        {session && active ? (
          <ProjectContext value={session}>
            <div className="flex min-h-0 flex-1 flex-col">
              <main className="flex min-h-0 flex-1">
                <StartLeftPanel />
                <StartCanvasArea id={active} />
                <StartInspectorPanel />
              </main>
              <StatusBar />
            </div>
          </ProjectContext>
        ) : (
          <main className="flex-1" />
        )}
      </div>
      <SonnerToaster theme={theme} position="bottom-right" offset={{ bottom: 40, right: 16 }} />
      <QuickInsert />
      <StartActionsSearch initialQuery={search} />
    </TooltipProvider>
  )
}

/** The proposed keys for New screen and New component, anywhere but in a text field. */
function useStartKeys(session: ProjectSession | undefined): void {
  useEffect(() => {
    if (!session) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest("input, textarea, [contenteditable=true]")) return
      const kind = [
        { keys: keysOf("newScreen"), kind: "screen" as const },
        { keys: keysOf("newComponent"), kind: "component" as const }
      ].find((candidate) => matches(event, candidate.keys))?.kind
      if (!kind) return
      event.preventDefault()
      makeNew(session, kind)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [session])
}

/** The title bar: the proposed menus, then the open projects' tabs, drawn as the app draws them. */
function TitleBar() {
  const tabs = useTabs()
  const active = useActiveTabId()
  return (
    <div className="flex h-10 shrink-0 items-end gap-0.5 border-b bg-neutral-100 pr-[150px] pl-2 dark:bg-[#0a0a0a]">
      <StartMenubar />
      <div role="tablist" aria-label="Projects" className="flex min-w-0 items-end gap-0.5">
        {tabs.map((tab) => {
          const selected = tab.id === active
          return (
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              aria-selected={selected}
              onPointerDown={() => workspace.activate(tab.id)}
              onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && workspace.activate(tab.id)}
              className={`relative flex h-8 w-56 min-w-24 shrink items-center gap-2 rounded-t-lg border border-b-0 px-3 text-sm ${
                selected ? "bg-background text-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{tab.title}</span>
              <X className="size-3.5 shrink-0 opacity-70" aria-hidden />
              {selected && <span className="absolute inset-x-0 -bottom-px h-px bg-background" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The left panel as the app has it, with the proposed Layers tab. */
export function StartLeftPanel() {
  return (
    <SidePanel
      side="left"
      label="Layers, assets and tokens"
      defaultTab="layers"
      tabs={[
        { value: "layers", label: "Layers", icon: Layers },
        { value: "components", label: "Components", icon: Component },
        { value: "icons", label: "Icons", icon: Smile },
        { value: "images", label: "Images", icon: ImageIcon },
        { value: "tokens", label: "Tokens", icon: Palette }
      ]}
    >
      <TabsContent value="layers" className="min-h-0 overflow-x-hidden overflow-y-auto">
        <StartLayers />
      </TabsContent>
      <TabsContent value="components" className="flex min-h-0 flex-col">
        <ComponentsPanel />
      </TabsContent>
      <TabsContent value="icons" className="flex min-h-0 flex-col">
        <IconsPanel />
      </TabsContent>
      <TabsContent value="images" className="flex min-h-0 flex-col">
        <ImagesPanel />
      </TabsContent>
      <TabsContent value="tokens" className="flex min-h-0 flex-col">
        <TokensPanel />
      </TabsContent>
    </SidePanel>
  )
}

/** The inspector as the app has it, with the proposed Design tab. */
export function StartInspectorPanel() {
  return (
    <SidePanel
      side="right"
      label="Inspector"
      defaultTab="design"
      tabs={[
        { value: "design", label: "Design", icon: SlidersHorizontal },
        { value: "modes", label: "Modes", icon: MonitorSmartphone },
        { value: "accessibility", label: "Accessibility", icon: Accessibility }
      ]}
    >
      <TabsContent value="design" className="min-h-0 overflow-x-hidden overflow-y-auto">
        <StartDesignTab />
      </TabsContent>
      <TabsContent value="modes" className="min-h-0 overflow-x-hidden overflow-y-auto">
        <ModesPanel />
      </TabsContent>
      <TabsContent value="accessibility" className="min-h-0 overflow-x-hidden overflow-y-auto">
        <AccessibilityPanel />
      </TabsContent>
    </SidePanel>
  )
}

/** The canvas as the app draws it, with the proposed right-click menu around it. */
function StartCanvasArea({ id }: { id: string }) {
  const session = useProject()
  const tool = useTool(session.selection)
  const onEditor = useCallback((editor: Editor | undefined) => workspace.setEditor(id, editor), [id])
  useEffect(() => {
    session.editor?.setCurrentTool(tool === "hand" ? "hand" : "select")
  }, [session.editor, tool])
  return (
    <StartCanvasMenu>
      <div
        className={`canvas-area relative isolate min-w-0 flex-1 ${tool === "text" ? "cursor-text" : ""}`}
        data-tool={tool}
      >
        <CanvasEditor onEditor={onEditor} />
        <CanvasOverlay />
        <CanvasDrop />
        <FloatingToolbar />
        <ViewControls />
      </div>
    </StartCanvasMenu>
  )
}
