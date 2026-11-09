import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import type { ReactNode } from "react"
import { ProjectContext } from "../../canvas/context.ts"
import { FloatingToolbar } from "../../chrome/Toolbar.tsx"
import { example } from "../../stories/fixtures.tsx"
import excalidrawToolbar from "./competitors/excalidraw-toolbar.png?url"
import excalidrawZoom from "./competitors/excalidraw-zoom.png?url"
import figmaToolbar from "./competitors/figma-toolbar.png?url"
import framerBottom from "./competitors/framer-bottom.png?url"
import framerTop from "./competitors/framer-top.png?url"
import framerZoom from "./competitors/framer-zoom.png?url"
import penpotToolbar from "./competitors/penpot-toolbar.png?url"
import penpotZoom from "./competitors/penpot-zoom.png?url"
import tldrawMore from "./competitors/tldraw-more.png?url"
import tldrawToolbar from "./competitors/tldraw-toolbar.png?url"
import { CodeToolbar, OneBarToolbar, TidiedToolbar } from "./options.tsx"

/*
 * The toolbars on their own, ours live and the others as screenshots at their actual size, taken on 2026-11-09. Ours
 * aren't on a canvas here, so zoom shows 100% and Undo and Redo are off.
 */

interface Shot {
  src: string
  alt: string
}

interface Entry {
  name: string
  /** What's worth noticing, for comparing with ours. */
  notes: string[]
  shots?: Shot[]
  /** Ours, drawn live. */
  live?: ReactNode
}

/** One of our bars, set in place rather than floating over a canvas. */
function Live({ children }: { children: ReactNode }) {
  return (
    <ProjectContext value={example()}>
      <div className="w-fit *:static *:translate-x-0">{children}</div>
    </ProjectContext>
  )
}

const ours: Entry[] = [
  {
    name: "Parity today",
    notes: [
      "Separators stop short of the bar's height, and the picked tool is a solid block with squared inner corners."
    ],
    live: (
      <Live>
        <FloatingToolbar />
      </Live>
    )
  },
  {
    name: "A. Tidied",
    notes: ["Today's tools, fixed, with Insert after Text."],
    live: (
      <Live>
        <TidiedToolbar />
      </Live>
    )
  },
  {
    name: "B. One bar",
    notes: ["Undo, Redo and a zoom menu join the tools."],
    live: (
      <Live>
        <OneBarToolbar />
      </Live>
    )
  },
  {
    name: "C. With code",
    notes: ["A, with a switch for the Code tab and Search actions."],
    live: (
      <Live>
        <CodeToolbar />
      </Live>
    )
  }
]

const others: Entry[] = [
  {
    name: "Figma",
    notes: [
      "At the bottom of the canvas. Each family of tools is one button with a menu: Move holds Hand and Scale, Frame holds Section and Slice.",
      "Actions, for AI, plugins and commands, sits with the tools.",
      "It ends in a switch between Draw, Design and Dev Mode, so engineers change the whole window, not one tab.",
      "The picked tool is solid blue. This picture is from Figma's help center, in the light theme."
    ],
    shots: [{ src: figmaToolbar, alt: "Figma's toolbar" }]
  },
  {
    name: "Penpot",
    notes: [
      "At the top of the canvas: Move, Board, shapes, Text, Image and Path, then Plugins.",
      "Tooltips give the key in brackets, as in Board (B).",
      "The zoom level, at the top right, opens a menu with minus, the level and plus in one row, then Reset, Zoom to fit all and Zoom to selected."
    ],
    shots: [
      { src: penpotToolbar, alt: "Penpot's toolbar with the Board tooltip" },
      { src: penpotZoom, alt: "Penpot's zoom menu" }
    ]
  },
  {
    name: "Framer",
    notes: [
      "Split in two. The tools that make things (Insert, Frame, Text, Vector) are at the top left.",
      "The bar at the bottom holds Select, Hand, Comment, the theme and a zoom menu, much like B.",
      "The zoom menu groups zooming in and out, the fixed levels, then settings."
    ],
    shots: [
      { src: framerTop, alt: "Framer's tools at the top left" },
      { src: framerBottom, alt: "Framer's bar at the bottom of the canvas" },
      { src: framerZoom, alt: "Framer's zoom menu" }
    ]
  },
  {
    name: "tldraw",
    notes: [
      "At the bottom, with the picked tool in solid blue.",
      "Tools that don't fit go into a menu at the end, so the bar never runs past the window.",
      "Undo, Redo, Delete and Duplicate sit in a quieter row above it."
    ],
    shots: [
      { src: tldrawToolbar, alt: "tldraw's toolbar" },
      { src: tldrawMore, alt: "tldraw's menu of more tools" }
    ]
  },
  {
    name: "Excalidraw",
    notes: [
      "At the top, with each tool's key in the corner of its button.",
      "A line under the bar says how to move around the canvas.",
      "Zoom and history are at the bottom left."
    ],
    shots: [
      { src: excalidrawToolbar, alt: "Excalidraw's toolbar" },
      { src: excalidrawZoom, alt: "Excalidraw's zoom and history" }
    ]
  }
]

/** What the others have in common, and what it means for ours. */
const takeaways = [
  "Every other tool shows the picked tool in a strong color. The kit's pressed look in A, B and C is the faintest of all.",
  "Figma, Penpot and Framer open a zoom menu from the level, as B does.",
  "Figma moves engineers into a mode of their own, a bigger step than C's switch for the Code tab.",
  "tldraw folds tools into a menu when the bar runs out of room. None of ours do yet.",
  "Figma folds Hand under Move. Framer and tldraw keep it as its own button."
]

function Section({ entry }: { entry: Entry }) {
  return (
    <section className="grid gap-3 border-t py-6 md:grid-cols-[14rem_1fr]">
      <div>
        <h2 className="font-medium">{entry.name}</h2>
        <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
          {entry.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
      <div className="flex min-w-0 flex-wrap items-end gap-4">
        {entry.live}
        {entry.shots?.map((shot) => (
          <img key={shot.src} src={shot.src} alt={shot.alt} className="max-w-full rounded-md border" />
        ))}
      </div>
    </section>
  )
}

/** Ours and the others, one after another, with what they have in common. */
export function ToolbarComparison() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background px-8 py-6 text-foreground">
        <h1 className="text-lg font-semibold">Toolbars compared</h1>
        <ul className="mt-3 mb-6 grid max-w-3xl list-disc gap-1.5 pl-5 text-sm">
          {takeaways.map((takeaway) => (
            <li key={takeaway}>{takeaway}</li>
          ))}
        </ul>
        {[...ours, ...others].map((entry) => (
          <Section key={entry.name} entry={entry} />
        ))}
      </div>
    </TooltipProvider>
  )
}
