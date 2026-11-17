import { createContext, type ReactNode, use, useState } from "react"
import type { LensSideProps, LensView } from "../../lenses/registry.ts"
import { useLensWorkspace } from "../../lenses/shell.ts"
import { type Camera, LensCanvas } from "./canvas.tsx"
import { lensList, type Ref } from "./data.ts"
import { LensInspector } from "./inspector.tsx"
import type { LensId } from "./model.ts"
import { LensPanel } from "./panel.tsx"

/** What the test lenses' views read, wherever their tabs are: selections, views, panel tabs and the link pointed at. */
interface TestLensState {
  selected: Partial<Record<LensId, string>>
  select: (lens: LensId, id: string | undefined) => void
  cameras: Partial<Record<LensId, Camera>>
  setCamera: (lens: LensId, camera: Camera) => void
  /** Each lens's open tab in the left panel and in the inspector, which stays when another lens is shown. */
  tabs: Record<string, string>
  setTab: (key: string, tab: string) => void
  /** What a link in the inspector points at while it's hovered. */
  peek: Ref | undefined
  setPeek: (ref: Ref | undefined) => void
}

const TestLensContext = createContext<TestLensState | undefined>(undefined)

/** Holds what the test lenses' views share, starting from what the story selects. */
export function TestLensProvider({
  selected: initial,
  children
}: {
  selected: Partial<Record<LensId, string>>
  children: ReactNode
}) {
  const [selected, setSelected] = useState(initial)
  const [cameras, setCameras] = useState<Partial<Record<LensId, Camera>>>({})
  const [tabs, setTabs] = useState<Record<string, string>>({})
  const [peek, setPeek] = useState<Ref>()

  const state: TestLensState = {
    selected,
    select: (lens, id) => setSelected((before) => ({ ...before, [lens]: id })),
    cameras,
    setCamera: (lens, camera) => setCameras((before) => ({ ...before, [lens]: camera })),
    tabs,
    setTab: (key, tab) => setTabs((before) => ({ ...before, [key]: tab })),
    peek,
    setPeek
  }

  return <TestLensContext value={state}>{children}</TestLensContext>
}

function useTestLenses(): TestLensState {
  const state = use(TestLensContext)

  if (!state) {
    throw new Error("The test lenses' views need a TestLensProvider around them.")
  }

  return state
}

function TestCanvas({ lens }: { lens: LensId }) {
  const state = useTestLenses()

  return (
    <LensCanvas
      lens={lens}
      selected={state.selected[lens]}
      peek={state.peek?.lens === lens ? state.peek.id : undefined}
      onSelect={(id) => state.select(lens, id)}
      camera={state.cameras[lens]}
      onCamera={(camera) => state.setCamera(lens, camera)}
    />
  )
}

function TestPanel({ lens, onHide }: LensSideProps<LensId>) {
  const state = useTestLenses()

  return (
    <LensPanel
      lens={lens}
      tab={state.tabs[`left:${lens}`] ?? "outline"}
      onTab={(tab) => state.setTab(`left:${lens}`, tab)}
      onHide={onHide}
      selected={state.selected[lens]}
      onSelect={(id) => state.select(lens, id)}
    />
  )
}

function TestInspector({ lens, onHide }: LensSideProps<LensId>) {
  const state = useTestLenses()
  const workspace = useLensWorkspace<LensId>()

  // A link selects its thing and shows its lens where it's open, in any window, else in the tab in focus, as a link
  // does in a browser; beside, in a group to the right.
  const showLink = (ref: Ref, beside: boolean) => {
    state.setPeek(undefined)
    state.select(ref.lens, ref.id)
    workspace.followLink(ref.lens, beside)
  }

  return (
    <LensInspector
      lens={lens}
      selected={state.selected[lens]}
      tab={state.tabs[`right:${lens}`] ?? "design"}
      onTab={(tab) => state.setTab(`right:${lens}`, tab)}
      onHide={onHide}
      onShow={(ref) => showLink(ref, false)}
      onShowBeside={(ref) => showLink(ref, true)}
      onPeek={state.setPeek}
    />
  )
}

/** The exploration's lenses for the real shell: each one's data, with the exploration's canvas, panel and inspector. */
export const testLenses: LensView<LensId>[] = lensList.map((lens) => ({
  ...lens,
  Canvas: TestCanvas,
  Panel: TestPanel,
  Inspector: TestInspector
}))
