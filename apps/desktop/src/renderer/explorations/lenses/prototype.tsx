import { useState } from "react"
import { StatusBar } from "../../chrome/StatusBar.tsx"
import { LensWorkspace } from "../../lenses/LensWorkspace.tsx"
import { useLensWorkspace } from "../../lenses/shell.ts"
import { HomePage } from "../../start/HomePage.tsx"
import { useProject, workspace } from "../../workspace.ts"
import { type ChromeActions, TitleBar } from "./chrome.tsx"
import { project } from "./data.ts"
import type { LensId } from "./model.ts"
import { TestLensProvider, testLenses } from "./test-lenses.tsx"

/** What a story opens the project on: its groups of lens tabs, left to right, the first tab of each in front. */
export interface LensLayout {
  groups: LensId[][]
  /** The group in focus, which the left panel and the inspector follow. */
  focused?: number
  /** What's selected in each lens, which stays when another lens is shown. */
  selected: Partial<Record<LensId, string>>
}

/** The page a lens's own window opens on, before Dockview moves the lens into it. Storybook serves it. */
const popoutUrl = "/lens-popout/popout.html"

/**
 * The prototype: one project per window, in the app's own lens shell, with the exploration's lenses. The title bar's
 * project menu opens another project in this one's place or closes it, which leaves the window on Home.
 */
export function LensesPrototype({ initial }: { initial: LensLayout }) {
  const [name, setName] = useState<string | undefined>(project.name)
  // Bumped when a project opens in another's place, so the shell lays it out afresh and closes the old windows.
  const [opened, setOpened] = useState(0)
  const resumed = useProject()

  // On Home, a project opened or resumed there opens in the window, in place of Home.
  const shown = name === undefined && resumed ? resumed.title : name

  const openProject = (next: string) => {
    setName(next)
    setOpened((before) => before + 1)
  }

  const closeProject = () => {
    void workspace.close()
    setName(undefined)
  }

  if (shown === undefined) {
    return (
      <div className="flex h-screen flex-col bg-background text-foreground">
        <TitleBar actions={homeActions(openProject)} />
        <HomePage active />
      </div>
    )
  }

  // The story's layout, as a project keeps one.
  const groups = initial.groups.map((tabs) => ({ where: "main", tabs }))

  return (
    <TestLensProvider key={opened} selected={initial.selected}>
      <div className="flex h-screen flex-col">
        <LensWorkspace
          lenses={testLenses}
          layout={initial.focused === undefined ? { groups } : { groups, focus: initial.focused }}
          popoutUrl={popoutUrl}
          title={shown}
          titleBar={<ProjectTitleBar name={shown} openProject={openProject} closeProject={closeProject} />}
          statusBar={<StatusBar />}
        />
      </div>
    </TestLensProvider>
  )
}

/** The title bar over an open project, whose View menu acts on its lenses. */
function ProjectTitleBar({
  name,
  openProject,
  closeProject
}: {
  name: string
  openProject: (name: string) => void
  closeProject: () => void
}) {
  const lenses = useLensWorkspace<LensId>()

  return <TitleBar name={name} actions={{ ...lenses, project: true, openProject, closeProject }} />
}

/** What the title bar does on Home, with no project open: its menus open one; there's no lens to show. */
function homeActions(openProject: (name: string) => void): ChromeActions {
  const never = () => false

  return {
    project: false,
    current: undefined,
    show: () => undefined,
    splitRight: () => undefined,
    canSplit: never,
    toWindow: () => undefined,
    canMoveToWindow: never,
    panels: { left: false, right: false },
    togglePanels: () => undefined,
    closeProject: () => undefined,
    openProject
  }
}
