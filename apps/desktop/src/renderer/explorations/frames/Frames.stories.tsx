import type { DesignNode } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ReactNode, useEffect } from "react"
import { toast } from "sonner"
import { expect, fireEvent, within } from "storybook/test"
import { Toaster } from "@/components/ui/sonner"
import { useProject } from "../../canvas/context.ts"
import { ParamsSection } from "../../chrome/ComponentsSection.tsx"
import { StatesSection } from "../../chrome/StatesSection.tsx"
import { useContainerEntries } from "../../design-store.ts"
import { openProjects, ProjectStage } from "../../stories/fixtures.tsx"
import { StickyNote } from "../collaboration/notes.tsx"
import { me } from "../explore-data.ts"
import {
  At,
  Board,
  CanvasFrame,
  CanvasStage,
  DraggedFrame,
  Explainer,
  Guide,
  Pointer,
  type Preview
} from "./canvas.tsx"
import { mode } from "./data.ts"
import { PlanCard, PricingPage, TextLayer, WelcomeSketch } from "./designs.tsx"
import { BackToAFrameDialog, FrameInspector, frameDrops, InspectorPanel, KindHeader } from "./inspector.tsx"
import { LiveCanvas } from "./live.tsx"
import { type ExploreTool, FramesToolbar } from "./toolbar.tsx"

/**
 * Frames, the light weight beside screens and components (docs/proposals/new-user-experience.md, "Three weights" and
 * "Making something is always one visible step"). A frame is drawn once, at its own size, in the primary mode: no
 * states, no previews in other modes, and never written to code. It holds anything a screen holds, and becomes a
 * component or a screen when it's ready. The frame tool (F) draws one, T on the empty canvas makes text in one, and
 * notes get a tool of their own. The app's theme follows the toolbar's Theme switch; the designs keep the project's
 * own light theme, as the primary mode draws them.
 */
const meta = {
  title: "Parity/Explorations/Frames",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const pricing: Preview[] = [
  { mode: mode("desktop-light"), content: <PricingPage width={1280} theme="light" />, width: 1280 },
  { mode: mode("mobile-light"), content: <PricingPage width={390} theme="light" />, width: 390 }
]

const planCard: Preview[] = [{ mode: mode("desktop-light"), content: <PlanCard />, width: 320 }]

/** The Pricing screen at the left of the canvas, as most stories start: zoomed out, the way a project opens. */
function PricingOnCanvas({ selected = false, controls = false }: { selected?: boolean; controls?: boolean }) {
  return (
    <At x={48} y={96}>
      <Board kind="screen" name="Pricing" zoom={0.4} previews={pricing} controls={controls} selected={selected} />
    </At>
  )
}

/** A story's canvas, with the toolbar at the bottom and whatever the story puts on it. */
function Canvas({
  tool,
  menuOpen,
  tooltip,
  children
}: {
  tool: ExploreTool
  menuOpen?: boolean
  tooltip?: ExploreTool
  children: ReactNode
}) {
  return (
    <CanvasStage>
      {children}
      <FramesToolbar tool={tool} menuOpen={menuOpen} tooltip={tooltip} />
    </CanvasStage>
  )
}

/**
 * The canvas with the inspector at its right, in the example project, for stories that show the inspector's real
 * sections. `children` go over both, as a dialog does.
 */
function WithInspector({
  tool = "select",
  canvas,
  panel,
  children
}: {
  tool?: ExploreTool
  canvas: ReactNode
  panel: ReactNode
  children?: ReactNode
}) {
  return (
    <ProjectStage className="flex h-screen bg-background text-foreground">
      <div className="relative min-w-0 flex-1">
        <Canvas tool={tool}>{canvas}</Canvas>
      </div>
      {panel}
      {children}
    </ProjectStage>
  )
}

const inExample = [() => openProjects("example")]

// Three weights

/**
 * A screen, a component and a frame side by side, zoomed out as a project opens. The screen's board holds a preview
 * for each mode it shows, with its state and modes menus; the component's board hugs its one preview, too narrow here
 * for its menus; the frame has no board at all, only its quiet name above the design at its own size.
 */
export const ThreeWeights: Story = {
  render: () => (
    <Canvas tool="select">
      <PricingOnCanvas controls />
      <At x={808} y={96}>
        <Board kind="component" name="Plan card" zoom={0.4} previews={planCard} controls />
      </At>
      <At x={1000} y={96}>
        <CanvasFrame name="Welcome" zoom={0.4}>
          <WelcomeSketch width={640} height={400} />
        </CanvasFrame>
      </At>
      <At x={48} y={580}>
        <Explainer title="Screen, the heavy one">
          A page of your app. A preview in each mode it shows, its states, and it&apos;s written to code.
        </Explainer>
      </At>
      <At x={428} y={580}>
        <Explainer title="Component, the middle weight">
          Reusable, with params and variants, and written to code. Its board hugs one preview until you turn on more
          modes.
        </Explainer>
      </At>
      <At x={808} y={580}>
        <Explainer title="Frame, the light weight">
          A sketch, drawn once at its own size in the primary mode. No board, states or modes, and never written to
          code.
        </Explainer>
      </At>
    </Canvas>
  )
}

/**
 * The three titles on a canvas you can zoom, so you can check each at any zoom instead of one. The screen's names its
 * state and the modes it shows, with its icon in the screen color; the component's the same in purple; the frame's is
 * only its name, smaller and quieter, with Figma's frame icon. Up close, a board's gutter stays 12px at the sides and
 * bottom with a 36px band for the captions, whatever the zoom; past 40% it shrinks with the canvas, so boards zoomed far out don't run into each other, and its captions stay until they're too small to read, at 10%. Captions drop their
 * chips, then the mode's name, before anything is cut off, and a title drops its menus before its name.
 */
export const Titles: Story = {
  render: () => (
    <LiveCanvas
      initialZoom={0.5}
      placed={[
        {
          key: "pricing",
          x: 0,
          y: 0,
          draw: (zoom) => <Board kind="screen" name="Pricing" zoom={zoom} previews={pricing} controls />
        },
        {
          key: "plan-card",
          x: 0,
          y: 1800,
          draw: (zoom) => <Board kind="component" name="Plan card" zoom={zoom} previews={planCard} controls />
        },
        {
          key: "welcome",
          x: 1000,
          y: 1800,
          draw: (zoom) => (
            <CanvasFrame name="Welcome" zoom={zoom}>
              <WelcomeSketch width={640} height={400} />
            </CanvasFrame>
          )
        }
      ]}
    >
      <div className="absolute top-4 right-4 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Explainer title="Zoom to check each zoom">
          Hold Ctrl or ⌘ and scroll, or pinch, to zoom around the pointer. Scroll to pan.
        </Explainer>
      </div>
    </LiveCanvas>
  )
}

// The frame tool

/**
 * The frame tool picked with F (or A, as in Figma), beside Text and a new Note tool. The pointer is a crosshair over
 * the canvas, and the arrow beside the tool opens its sizes.
 */
export const FrameTool: Story = {
  render: () => (
    <Canvas tool="frame" tooltip="frame">
      <PricingOnCanvas />
      <Pointer kind="crosshair" x={1010} y={300} />
    </Canvas>
  ),
  play: async () => {
    await expect(await within(document.body).findByRole("tooltip")).toHaveTextContent("Frame")
  }
}

/**
 * Dragging out a frame: its size shows underneath as it grows, in the canvas's pixels, and it snaps to the edges of
 * the designs around it, here Pricing's top.
 */
export const DrawingAFrame: Story = {
  render: () => (
    <Canvas tool="frame">
      <PricingOnCanvas />
      <Guide x={48} y={96} length={1112} />
      <At x={872} y={96}>
        <DraggedFrame width={288} height={176} size="720 × 440" />
      </At>
      <Pointer kind="crosshair" x={1160} y={272} />
    </Canvas>
  )
}

/**
 * Let go, and it's a frame named Frame 1, selected, with the move tool back, as in Figma. It's filled with the
 * project's background in the primary mode, and can be resized from its corners and edges.
 */
export const FrameDrawn: Story = {
  render: () => (
    <Canvas tool="select">
      <PricingOnCanvas />
      <At x={872} y={96}>
        <CanvasFrame name="Frame 1" zoom={0.4} selected size="720 × 440">
          <div className="bg-white" style={{ width: 720, height: 440 }} />
        </CanvasFrame>
      </At>
      <Pointer kind="arrow" x={1160} y={272} />
    </Canvas>
  )
}

/**
 * The frame tool's menu: a frame at each of the viewports the project's modes use, once each, with the modes that use
 * it. A viewport with only a width takes the nearest device's height. Below them, New screen and New component, so
 * every kind starts from the same place.
 */
export const FrameSizes: Story = {
  render: () => (
    <Canvas tool="frame" menuOpen>
      <PricingOnCanvas />
    </Canvas>
  ),
  play: async () => {
    const menu = await within(document.body).findByRole("menu")
    await expect(within(menu).getByText("New screen")).toBeVisible()
  }
}

/** A frame's design, as its root layout: a row with padding and a gap, at a fixed size, filled with the background. */
const welcomeRoot: DesignNode = {
  id: "welcome",
  type: "layout",
  name: "Welcome",
  style: { direction: "row", gap: 8, padding: 10, width: 160, height: 100, background: "background" },
  children: []
}

/**
 * A frame selected, with the inspector. Its name, then which kind it is with Frame picked, where it's drawn and that it
 * isn't written to code. Then its own layout, size and fill straight away, since selecting a frame selects its root
 * layout: no states, modes or params, which a frame doesn't have. The style sections are the inspector's real ones.
 */
export const SelectedFrame: Story = {
  loaders: inExample,
  render: () => (
    <WithInspector
      canvas={
        <At x={80} y={140}>
          <CanvasFrame name="Welcome" zoom={0.75} selected size="640 × 400">
            <WelcomeSketch width={640} height={400} />
          </CanvasFrame>
        </At>
      }
      panel={<FrameInspector name="Welcome" root={welcomeRoot} />}
    />
  )
}

/** Right-clicking a frame's name: Convert to component and Convert to screen, beside Rename, Duplicate and Delete. */
export const FrameMenu: Story = {
  render: () => (
    <Canvas tool="select">
      <At x={240} y={160}>
        <CanvasFrame name="Welcome" zoom={0.75} selected size="640 × 400">
          <WelcomeSketch width={640} height={400} />
        </CanvasFrame>
      </At>
    </Canvas>
  ),
  play: async ({ canvasElement }) => {
    const title = within(canvasElement).getByRole("button", { name: "Welcome" })
    const box = title.getBoundingClientRect()
    await fireEvent.contextMenu(title, { clientX: box.left + 24, clientY: box.bottom - 4 })
    await expect(await within(document.body).findByRole("menuitem", { name: "Convert to screen" })).toBeVisible()
  }
}

// Text and notes on the empty canvas

const textRoot: DesignNode = {
  id: "plans-text",
  type: "layout",
  name: "Plans for every team",
  style: { padding: 2, width: "hug", height: "hug", background: "background" },
  children: []
}

/** The hugging frame text makes, around its text layer, with a little padding so the fill doesn't clip the letters. */
function TextFrame({ selected = false, caret = false }: { selected?: boolean; caret?: boolean }) {
  return (
    <CanvasFrame name="Plans for every team" zoom={1} selected={selected} outline={!selected} size="Hug × Hug">
      <div className="bg-white p-2 text-neutral-900">
        <TextLayer caret={caret}>Plans for every team</TextLayer>
      </div>
    </CanvasFrame>
  )
}

/**
 * T, then a click on the empty canvas: a text layer, being typed, in a frame that hugs it. The frame is named after
 * its text, never "Pasted", and it's a frame like any other, so the text has styles and can be built on.
 */
export const TextOnTheEmptyCanvas: Story = {
  render: () => (
    <Canvas tool="text">
      <At x={420} y={300}>
        <TextFrame caret />
      </At>
      <Pointer kind="text" x={410} y={340} />
      <At x={48} y={48}>
        <Explainer title="Text makes a frame">
          On the empty canvas, Text makes a text layer in a frame that hugs it, as a layout, an image or a paste make a
          frame there too.
        </Explainer>
      </At>
    </Canvas>
  )
}

/**
 * Done typing, the frame is selected: it hugs its text both ways, and the inspector shows a frame with its padding and
 * fill. Selecting the text inside works as it does in any layout.
 */
export const TextFrameSelected: Story = {
  loaders: inExample,
  render: () => (
    <WithInspector
      canvas={
        <At x={200} y={300}>
          <TextFrame selected />
        </At>
      }
      panel={<FrameInspector name="Plans for every team" root={textRoot} />}
    />
  )
}

/**
 * Notes keep their own tool, Note (S), and look like what they are: annotations about the designs, never drawn in the
 * app. They draw as sticky notes, as the collaboration explorations do, so text in a design and a note can't be taken
 * for each other.
 */
export const NoteTool: Story = {
  render: () => (
    <Canvas tool="note" tooltip="note">
      <PricingOnCanvas />
      <At x={820} y={110}>
        <StickyNote author={me} size={190}>
          Should Business say &ldquo;Talk to sales&rdquo; instead of a price?
        </StickyNote>
      </At>
      <Pointer kind="crosshair" x={1110} y={250} />
    </Canvas>
  ),
  play: async () => {
    await expect(await within(document.body).findByRole("tooltip")).toHaveTextContent("Note")
  }
}

// Making it something heavier, and back

/** Shows a toast as the app does after an action, held so it can be read. */
function Toast({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    const id = toast.success(title, {
      description,
      duration: Infinity,
      action: { label: "Undo", onClick: () => undefined }
    })
    return () => void toast.dismiss(id)
  }, [title, description])
  return <Toaster position="bottom-right" offset={{ bottom: 40, right: 16 }} />
}

/**
 * After Convert to component: the frame is on a component's board, hugging its one preview in the primary mode, with
 * the component's menus. Nothing was lost, so it just happens, and a toast offers Undo.
 */
export const MadeAComponent: Story = {
  render: () => (
    <Canvas tool="select">
      <At x={240} y={160}>
        <Board
          kind="component"
          name="Welcome"
          zoom={0.75}
          selected
          controls
          previews={[{ mode: mode("desktop-light"), content: <WelcomeSketch width={640} height={400} />, width: 640 }]}
        />
      </At>
      <Toast title="Welcome is a component" description="Place it in screens from Components." />
    </Canvas>
  )
}

/**
 * After Convert to screen: a screen's board with its preview in the primary mode, at the size the frame had, and the
 * state and modes menus to show it in more. A toast offers Undo.
 */
export const MadeAScreen: Story = {
  render: () => (
    <Canvas tool="select">
      <At x={240} y={160}>
        <Board
          kind="screen"
          name="Welcome"
          zoom={0.75}
          selected
          controls
          previews={[{ mode: mode("desktop-light"), content: <WelcomeSketch width={640} height={400} />, width: 640 }]}
        />
      </At>
      <Toast title="Welcome is a screen" description="Show it in more modes from its board's menu." />
    </Canvas>
  )
}

/** The example's screen or component by name, with what making it a frame would drop, from the project's real data. */
function useDrops(name: string) {
  const { store } = useProject()
  const entries = useContainerEntries(store)
  const entry = entries.find((candidate) => candidate.container.name === name)
  return entry && { entry, drops: frameDrops(entry.container, entries) }
}

/** The inspector for one of the example's screens or components, with Frame about to be picked in its kind. */
function KindPanel({ kind, name }: { kind: "screen" | "component"; name: string }) {
  const found = useDrops(name)
  return (
    <InspectorPanel>
      <KindHeader kind={kind} name={name} />
      {found && (kind === "screen" ? <StatesSection entry={found.entry} /> : <ParamsSection entry={found.entry} />)}
    </InspectorPanel>
  )
}

function DropsDialog({ kind, name }: { kind: "screen" | "component"; name: string }) {
  const found = useDrops(name)
  return found ? <BackToAFrameDialog kind={kind} name={name} drops={found.drops} /> : null
}

/**
 * Frame picked for a screen asks first, and says what goes: its other states and the previews beside its main one.
 * Its layers stay, as its first state shows them in the primary mode. The lists come from the example's real Pricing
 * screen.
 */
export const ScreenToFrame: Story = {
  loaders: inExample,
  render: () => (
    <WithInspector canvas={<PricingOnCanvas selected controls />} panel={<KindPanel kind="screen" name="Pricing" />}>
      <DropsDialog kind="screen" name="Pricing" />
    </WithInspector>
  ),
  play: async () => {
    await expect(await within(document.body).findByRole("dialog")).toHaveTextContent("Yearly")
  }
}

/**
 * The same for a component, which also loses its params, and whose instances can't point at a frame: each becomes
 * plain layers where it's placed, as Detach instance makes it. The lists come from the example's real Plan card.
 */
export const ComponentToFrame: Story = {
  loaders: inExample,
  render: () => (
    <WithInspector
      canvas={
        <At x={320} y={160}>
          <Board kind="component" name="Plan card" zoom={1} previews={planCard} selected controls />
        </At>
      }
      panel={<KindPanel kind="component" name="Plan card" />}
    >
      <DropsDialog kind="component" name="Plan card" />
    </WithInspector>
  ),
  play: async () => {
    await expect(await within(document.body).findByRole("dialog")).toHaveTextContent("instances in Pricing")
  }
}
