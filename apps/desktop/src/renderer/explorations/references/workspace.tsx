import { TabsContent } from "@buildkitgg/shadcn-baseui-kit"
import { Accessibility, CodeXml, MonitorSmartphone, SlidersHorizontal } from "lucide-react"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { useProject } from "../../canvas/context.ts"
import { designColor } from "../../canvas/kinds.tsx"
import { containerModes } from "../../canvas/view.ts"
import { AccessibilityPanel } from "../../chrome/AccessibilityPanel.tsx"
import { CodePanel } from "../../chrome/CodePanel.tsx"
import { DesignTab } from "../../chrome/DesignPanel.tsx"
import { LeftPanel } from "../../chrome/LeftPanel.tsx"
import { ModesPanel } from "../../chrome/ModesPanel.tsx"
import { SidePanel } from "../../chrome/SidePanel.tsx"
import { useContainerEntries, useModeSettings } from "../../design-store.ts"
import { useSelection } from "../../selection.ts"
import { ProjectStage } from "../../stories/fixtures.tsx"
import { type BrowserStart, type Picked, ReferenceBrowser, type Searched } from "./browser.tsx"
import { boxOf, CanvasSketch, designBox, type Placed, type View } from "./canvas.tsx"
import { type Platform, type Sample, sampleOf, startingQuery } from "./data.ts"
import { ReferencePanel } from "./reference-panel.tsx"

/*
 * The References exploration as one window you can use: the app's own panels around a sketch of the canvas, with no
 * tab added to either. Find references, on the toolbar and R, opens the browser over the canvas, for the selected
 * design when there is one. What's picked there lands beside the design, and a selected reference has the inspector's
 * Design tab, as a note does.
 */

/** Where a story starts. */
export interface Start {
  /** The browser, open. Without a description it opens for the selected design, or empty with nothing selected. */
  browser?: BrowserStart
  placed?: Placed[]
  /** The selected reference's key. */
  selected?: string
  view?: View
  /** A note for the reviewer, over the canvas. */
  note?: ReactNode
}

/** Space between a design and its references, and between rows of them, in canvas pixels. */
const gap = { beside: 160, between: 48, rows: 140 }

const firstRecent: Pick<Searched, "query" | "platform">[] = [
  { query: "sign in page", platform: "web" },
  { query: "paywall with a free trial", platform: "ios" },
  { query: "dashboard with a usage chart", platform: "web" }
]

let counter = 0

function newKey(): string {
  counter += 1

  return `placed-${counter}`
}

export function ReferencesWorkspace({ start = {} }: { start?: Start }) {
  return (
    <ProjectStage className="flex h-screen bg-background text-foreground">
      <Window start={start} />
    </ProjectStage>
  )
}

function Window({ start }: { start: Start }) {
  const session = useProject()
  const { store, selection } = session
  const real = useSelection(selection)
  const entries = useContainerEntries(store)
  const settings = useModeSettings(store)
  const pricing = entries.find((entry) => entry.container.name === "Pricing")
  const target = entries.find((entry) => entry.key === real.design)

  const [placed, setPlaced] = useState<Placed[]>(start.placed ?? [])
  const [selected, setSelected] = useState(start.selected)
  const [recent, setRecent] = useState(firstRecent)
  const [fitKey, setFitKey] = useState(0)
  const [lastPlatform, setLastPlatform] = useState<Platform>("web")

  /** The platform a design is for: the web when its main preview is wider than a phone. */
  const platformOf = (entry: NonNullable<typeof target>): Platform =>
    containerModes(settings, entry.container).primary.width >= 600 ? "web" : "ios"

  const opening = (): BrowserStart => {
    if (!target) {
      return { platform: lastPlatform }
    }

    const platform = platformOf(target)

    return { query: startingQuery(target.container.name, platform), platform }
  }

  const [browser, setBrowser] = useState<{ start: BrowserStart; target?: string } | undefined>(() =>
    start.browser ? { start: { ...opening(), ...start.browser }, target: target?.container.name } : undefined
  )

  // Selecting a design, here or in Layers, lets go of the selected reference.
  const [lastDesign, setLastDesign] = useState(real.design)

  if (real.design !== lastDesign) {
    setLastDesign(real.design)

    if (real.design) {
      setSelected(undefined)
    }
  }

  const find = (from?: BrowserStart) =>
    setBrowser({ start: from ?? { ...opening(), fresh: !!target }, target: target?.container.name })

  const place = (picked: Picked[]) => {
    const boxes = placed.flatMap((each) => boxOf(each) ?? [])
    const below = boxes.length > 0 ? Math.max(...boxes.map((box) => box.y + box.height)) + gap.rows : 0
    let x = designBox.x + designBox.width + gap.beside

    const added = picked.flatMap(({ sample, query }) => {
      const each: Placed = { key: newKey(), id: sample.id, x, y: below, query }
      const box = boxOf(each)
      x += (box?.width ?? 0) + gap.between

      return box ? [each] : []
    })

    setPlaced((current) => [...current, ...added])
    setSelected(added[0]?.key)
    selection.set({})
    setBrowser(undefined)
    setFitKey((key) => key + 1)
    const where = browser?.target ? `beside ${browser.target}` : "on the canvas"
    toast(added.length === 1 ? `Placed a reference ${where}` : `Placed ${added.length} references ${where}`, {
      description: "References stay out of your designs, your code and exports."
    })
  }

  const openInMobbin = (sample: Sample) => toast(`Opening ${sample.app} on Mobbin in your browser`)
  const shown = placed.find((each) => each.key === selected)
  const shownSample = shown && sampleOf(shown.id)

  return (
    <>
      <LeftPanel />
      <CanvasSketch
        designName="Pricing"
        designColor={designColor(pricing?.container.kind)}
        designSelected={!!pricing && real.design === pricing.key && !selected}
        placed={placed}
        selected={selected}
        view={start.view}
        fitKey={fitKey}
        onSelectDesign={() => {
          setSelected(undefined)
          selection.set(pricing ? { design: pricing.key } : {})
        }}
        onSelect={(key) => {
          setSelected(key)
          selection.set({})
        }}
        onMove={(key, x, y) =>
          setPlaced((current) => current.map((each) => (each.key === key ? { ...each, x, y } : each)))
        }
        onDelete={(key) => {
          setPlaced((current) => current.filter((each) => each.key !== key))
          setSelected(undefined)
        }}
        onOpen={openInMobbin}
        onFind={() => find()}
      >
        {start.note}
      </CanvasSketch>
      <SidePanel
        side="right"
        label="Inspector"
        defaultTab="design"
        tabs={[
          { value: "design", label: "Design", icon: SlidersHorizontal },
          { value: "modes", label: "Modes", icon: MonitorSmartphone },
          { value: "code", label: "Code", icon: CodeXml },
          { value: "accessibility", label: "Accessibility", icon: Accessibility }
        ]}
      >
        <TabsContent value="design" className="min-h-0 overflow-x-hidden overflow-y-auto">
          {shown && shownSample ? (
            <ReferencePanel
              placed={shown}
              sample={shownSample}
              onNote={(note) =>
                setPlaced((current) =>
                  current.map((each) => (each.key === shown.key ? { ...each, note: note || undefined } : each))
                )
              }
              onOpen={() => openInMobbin(shownSample)}
              onMore={() => find({ query: shownSample.app, platform: shownSample.platform, fresh: true })}
            />
          ) : (
            <DesignTab />
          )}
        </TabsContent>
        <TabsContent value="modes" className="min-h-0 overflow-x-hidden overflow-y-auto">
          <ModesPanel />
        </TabsContent>
        <TabsContent value="code" className="flex min-h-0 flex-col overflow-hidden">
          <CodePanel />
        </TabsContent>
        <TabsContent value="accessibility" className="flex min-h-0 flex-col overflow-hidden">
          <AccessibilityPanel />
        </TabsContent>
      </SidePanel>
      <ReferenceBrowser
        open={!!browser}
        target={browser?.target}
        start={browser?.start}
        recent={recent}
        onClose={() => setBrowser(undefined)}
        onSearched={({ query, platform }) => {
          setLastPlatform(platform)
          setRecent((current) =>
            [
              { query, platform },
              ...current.filter((each) => each.query !== query || each.platform !== platform)
            ].slice(0, 5)
          )
        }}
        onPlace={place}
        onOpenInMobbin={openInMobbin}
      />
    </>
  )
}

/** A short explanation pinned over the canvas, in the explorations' dimmed type, for a reviewer. */
export function Explainer({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="text-[13px] leading-snug text-muted-foreground">{children}</span>
    </div>
  )
}
