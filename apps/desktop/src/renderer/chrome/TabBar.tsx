import { FolderOpen, LoaderCircle, Plus, TriangleAlert, X } from "lucide-react"
import { useEffect, useRef, useSyncExternalStore } from "react"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DesignStore } from "../design-store.ts"
import { type Tab, useActiveTabId, useTabs, workspace } from "../workspace.ts"
import { AppMenu } from "./AppMenu.tsx"
import { openProjectFolder } from "./commands.ts"

const mac = navigator.userAgent.includes("Mac")

/**
 * Closes the tab. While the project has unsaved changes it shows a dot instead, like VS Code, which turns back into
 * the close button on hover.
 */
function CloseButton({ tab, selected }: { tab: Tab; selected: boolean }) {
  const unsaved = useUnsaved(tab.session?.store)
  return (
    <button
      type="button"
      aria-label={unsaved ? `Close ${tab.title}, which has unsaved changes` : `Close ${tab.title}`}
      title={unsaved ? "Unsaved changes" : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => void workspace.close(tab.id)}
      className={`group/close grid size-5 shrink-0 place-items-center rounded hover:bg-accent ${
        selected || unsaved ? "" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
      }`}
    >
      {unsaved ? (
        <>
          <span className="size-2 rounded-full bg-foreground/80 group-hover/close:hidden group-focus-visible/close:hidden" />
          <X className="hidden size-3.5 group-hover/close:block group-focus-visible/close:block" />
        </>
      ) : (
        <X className="size-3.5" />
      )}
    </button>
  )
}

/** Whether a tab's project has changes that aren't on disk; tabs still opening have none. */
function useUnsaved(store: DesignStore | undefined): boolean {
  const status = useSyncExternalStore(store?.subscribe ?? ignore, () => store?.getSaveState().status)
  return status === "unsaved" || status === "failed"
}

const ignore = () => () => undefined

/**
 * The app's menus, then open projects as tabs. The strip doubles as the window's title bar; the system's window buttons
 * sit at its end.
 */
export function TabBar() {
  const tabs = useTabs()
  const active = useActiveTabId()
  const strip = useRef<HTMLDivElement>(null)

  // With more tabs than fit, the strip scrolls; the selected tab is always brought into view.
  useEffect(() => {
    const selected = strip.current?.querySelector<HTMLElement>('[role=tab][aria-selected="true"]')
    selected?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [active, tabs.length])

  return (
    <div
      className={`flex h-10 shrink-0 items-end gap-0.5 border-b bg-neutral-100 [-webkit-app-region:drag] dark:bg-[#0a0a0a] ${
        mac ? "pl-20" : "pl-2"
      } pr-[150px]`}
      role="tablist"
      aria-label="Projects"
    >
      <AppMenu />
      {/* Tabs shrink to their minimum width first, then the strip scrolls; a mouse wheel scrolls it sideways. */}
      <div
        ref={strip}
        onWheel={(event) => {
          if (strip.current && event.deltaX === 0) strip.current.scrollLeft += event.deltaY
        }}
        className="flex min-w-0 items-end gap-0.5 overflow-x-auto [scrollbar-width:none]"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active
          return (
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              aria-selected={selected}
              title={tab.session?.info.root ?? tab.message ?? tab.title}
              onPointerDown={(event) => event.button === 0 && workspace.activate(tab.id)}
              onAuxClick={(event) => event.button === 1 && void workspace.close(tab.id)}
              onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && workspace.activate(tab.id)}
              className={`group relative flex h-8 w-56 min-w-24 shrink items-center gap-2 rounded-t-lg border border-b-0 px-3 text-sm [-webkit-app-region:no-drag] ${
                selected
                  ? "bg-background text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              {tab.status === "loading" && <LoaderCircle className="size-3.5 shrink-0 animate-spin" />}
              {tab.status === "error" && <TriangleAlert className="size-3.5 shrink-0 text-destructive" />}
              <span className="min-w-0 flex-1 truncate">{tab.title}</span>
              <CloseButton tab={tab} selected={selected} />
              {selected && <span className="absolute inset-x-0 -bottom-px h-px bg-background" />}
            </div>
          )
        })}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => void openProjectFolder()}
            aria-label="Open project"
            className="mb-1 ml-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground [-webkit-app-region:no-drag]"
          >
            <Plus className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <FolderOpen className="size-3.5" /> Open project <Kbd>Ctrl O</Kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
