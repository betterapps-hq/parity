import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react"
import type { Editor } from "tldraw"
import { CanvasDrop } from "../canvas/CanvasDrop.tsx"
import { type CanvasDraws, CanvasEditor, canvasOf } from "../canvas/CanvasEditor.tsx"
import { CanvasOverlay } from "../canvas/CanvasOverlay.tsx"
import { useProject } from "../canvas/context.ts"
import { TabOrderOverlay } from "../canvas/TabOrderOverlay.tsx"
import { CanvasMenu } from "../chrome/CanvasMenu.tsx"
import { ConsolePanel, ResizeTop } from "../chrome/ConsolePanel.tsx"
import { ErrorBoundary } from "../chrome/ErrorBoundary.tsx"
import { FloatingToolbar } from "../chrome/FloatingToolbar/FloatingToolbar.tsx"
import { setLayout, useLayout } from "../chrome/layout.ts"
import { revealOnceShown } from "../chrome/reveal.ts"
import { ZoomControls } from "../chrome/ZoomControls.tsx"
import { useTool } from "../selection.ts"
import { CanvasShown, WindowLayers } from "../window-canvas.tsx"
import { workspace } from "../workspace.ts"
import { lensOf, onLensRequest } from "./lens-requests.ts"
import { useLensWorkspace } from "./shell.ts"

/** What the open project's lenses read from the window: which project, whether it shows, and how to reopen it. */
export interface OpenProjectParts {
  projectId: string
  /** The project shows, not hidden under an extension's page or the sign-in screen. */
  shown: boolean
  /** Opens the project again, as a part that failed offers. */
  reopen: () => void
}

/** The lens whose canvas draws each kind of design. */

export const OpenProjectContext = createContext<OpenProjectParts | undefined>(undefined)

export function useOpenProject(): OpenProjectParts {
  const parts = use(OpenProjectContext)

  if (!parts) {
    throw new Error("The project's lenses need the open project around them.")
  }

  return parts
}

/**
 * A lens's canvas over the open project: a tldraw canvas of its own, drawing the app's pages or its designs. The
 * project holds the editor of the canvas in focus, which the panels, menus and shortcuts act on, and what draws over a
 * canvas, its overlays and bars, shows on that one, with the console docked under it (PAR-147).
 */
export function ProjectCanvas({
  lens,
  draws,
  visible,
  tools = true
}: {
  lens: string
  draws: CanvasDraws
  /** Its tab is the one in front of its group. */
  visible: boolean
  /** It has the drawing toolbar, as the lenses that hold designs do. */
  tools?: boolean
}) {
  const { projectId, shown, reopen } = useOpenProject()
  const lenses = useLensWorkspace()
  const focused = lenses.current === lens
  const [own, setOwn] = useState<Editor>()
  const { editor, selection } = useProject()
  const inFocus = own !== undefined && editor === own

  // Something selected that another lens's canvas draws, from Search or a design just made, shows that lens in this one's
  // place, as a link does, with what's selected in view.
  useEffect(() => {
    if (!focused) {
      return
    }

    // The store tells of the tool and hover changing too, and what was selected before this lens showed stays selected,
    // so only a newly selected design is followed.
    const selectedKey = () => {
      const { design, note, reference } = selection.get()

      return note ?? reference ?? design
    }

    let last = selectedKey()

    const follow = () => {
      const key = selectedKey()

      if (key === last) {
        return
      }

      last = key

      if (key && canvasOf(key) !== draws) {
        lenses.followLink(lensOf(key), false)
        revealOnceShown(key)
      }
    }

    return selection.subscribe(follow)
  }, [focused, selection, draws, lenses])

  // A lens asked for from outside the shell, as by an extension's Show routes, shows as a link would.
  useEffect(() => (focused ? onLensRequest((other) => lenses.followLink(other, false)) : undefined), [focused, lenses])

  // The canvas in focus is the project's.
  useEffect(() => {
    if (focused && own) {
      workspace.setEditor(projectId, own)
    }
  }, [focused, own, projectId])

  // As it goes, it's no longer, unless another canvas has taken the focus already.
  useEffect(
    () => () => {
      if (own && workspace.getProject()?.session?.editor === own) {
        workspace.setEditor(projectId, undefined)
      }
    },
    [own, projectId]
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ErrorBoundary name="canvas" label="Canvas" onReopen={reopen} className="justify-center">
        <CanvasArea
          draws={draws}
          own={own}
          onEditor={setOwn}
          shown={shown && visible}
          inFocus={inFocus}
          tools={tools}
        />
      </ErrorBoundary>
      {inFocus && (
        <ConsoleBoundary onReopen={reopen}>
          <ConsolePanel />
        </ConsoleBoundary>
      )}
    </div>
  )
}

/** The console's boundary: says it failed in the console's own height, and can hide it. */
function ConsoleBoundary({ onReopen, children }: { onReopen: () => void; children: ReactNode }) {
  const { consoleHeight } = useLayout()

  return (
    <ErrorBoundary
      name="console"
      label="Console"
      kind="docked"
      onReopen={onReopen}
      onClose={() => setLayout({ console: false })}
      closeLabel="Close the console"
      className="flex-none border-t"
      style={{ height: consoleHeight }}
      edge={<ResizeTop height={consoleHeight} />}
    >
      {children}
    </ErrorBoundary>
  )
}

function CanvasArea({
  draws,
  own,
  onEditor: setOwn,
  shown,
  inFocus,
  tools
}: {
  draws: CanvasDraws
  own: Editor | undefined
  onEditor: (editor: Editor | undefined) => void
  shown: boolean
  inFocus: boolean
  tools: boolean
}) {
  const { selection } = useProject()
  const tool = useTool(selection)
  const onEditor = useCallback((editor: Editor | undefined) => setOwn(editor), [setOwn])

  useEffect(() => {
    own?.setCurrentTool(tool === "hand" ? "hand" : "select")
  }, [own, tool])

  // A canvas without the drawing toolbar draws what the project's code does, so the keys that pick a drawing tool, F and
  // T, leave it on Move and select.
  useEffect(() => {
    if (!tools && inFocus && (tool === "frame" || tool === "text")) {
      selection.setTool("select")
    }
  }, [tools, inFocus, tool, selection])

  // Isolated, so the canvas's floating controls and overlays, high up within it, stay below menus and dialogs. It sits
  // above the panels beside it, so a floating bar wider than a narrow canvas lies over them rather than under them
  // (PAR-893); its overlays clip to it, so only the bars reach out. The panels' resize edges, z-10, stay above it. A
  // right-click on it opens the canvas's menu.
  return (
    <CanvasMenu>
      <div
        className={`canvas-area relative isolate z-[5] min-w-0 flex-1 ${tool === "text" ? "cursor-text" : ""} ${tool === "frame" ? "cursor-crosshair" : ""}`}
        data-tool={tool}
        // Dockview moves a lens's canvas without resizing it, as when tabs or a split appear, and tldraw keeps where the
        // canvas was until it next measures; it's told where it is before it takes a press or the pointer.
        onPointerDownCapture={() => measureCanvas(own)}
        onPointerEnter={() => measureCanvas(own)}
      >
        <CanvasShown value={shown}>
          <CanvasEditor onEditor={onEditor} draws={draws} shown={shown} />
          {inFocus && (
            <>
              {/* Internal extensions' layers, each with an error boundary of its own (window-canvas.tsx). */}
              <WindowLayers order="overDesigns" />
              {/* What's drawn over the canvas fails without a word, leaving the canvas as it is; Sentry still hears. */}
              <ErrorBoundary name="canvas.overlay" label="Outlines" kind="silent">
                <CanvasOverlay />
              </ErrorBoundary>
              <ErrorBoundary name="canvas.tab-order" label="Tab order" kind="silent">
                <TabOrderOverlay />
              </ErrorBoundary>
              {/* Files dropped on it would make designs it doesn't draw. */}
              {tools && (
                <ErrorBoundary name="canvas.drop" label="Drop" kind="silent">
                  <CanvasDrop />
                </ErrorBoundary>
              )}
              <WindowLayers order="overSelection" />
              <WindowLayers order="edge" />
              {tools && (
                <ErrorBoundary name="canvas.toolbar" label="Toolbar" kind="silent">
                  <FloatingToolbar />
                </ErrorBoundary>
              )}
              <ErrorBoundary name="canvas.view-controls" label="Zoom" kind="silent">
                <ZoomControls />
              </ErrorBoundary>
            </>
          )}
        </CanvasShown>
      </div>
    </CanvasMenu>
  )
}

/** Tells tldraw where its canvas is on the screen now. */
function measureCanvas(editor: Editor | undefined): void {
  editor?.updateViewportScreenBounds(editor.getContainer())
}
