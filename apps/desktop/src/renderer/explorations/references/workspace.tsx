import { TabsContent } from "@buildkitgg/shadcn-baseui-kit"
import type { Found } from "@parity-app/connectors"
import {
  Accessibility,
  CodeXml,
  Component,
  ImageIcon,
  Layers,
  MonitorSmartphone,
  Palette,
  SlidersHorizontal,
  Smile
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { useProject } from "../../canvas/context.ts"
import { designColor } from "../../canvas/kinds.tsx"
import { containerModes } from "../../canvas/view.ts"
import { AccessibilityPanel } from "../../chrome/AccessibilityPanel.tsx"
import { ComponentsPanel, IconsPanel } from "../../chrome/AssetsPanel.tsx"
import { CodePanel } from "../../chrome/CodePanel.tsx"
import { DesignTab } from "../../chrome/DesignPanel.tsx"
import { LayerTree } from "../../chrome/LayerTree.tsx"
import { ModesPanel } from "../../chrome/ModesPanel.tsx"
import { SidePanel } from "../../chrome/SidePanel.tsx"
import { TokensPanel } from "../../chrome/TokensPanel.tsx"
import { useContainerEntries, useModeSettings } from "../../design-store.ts"
import { useSelection } from "../../selection.ts"
import { ProjectStage } from "../../stories/fixtures.tsx"
import { type BrowserStart, LibraryBrowser, type Picked } from "./browser.tsx"
import { boxOf, CanvasSketch, designBox, type Placed, type View } from "./canvas.tsx"
import { sampleFound, samples, type Source } from "./data.ts"
import { type ProjectImage, ProjectImagesPanel } from "./images-panel.tsx"
import { creditOf, libraries, type LibraryId, type Searched } from "./library.tsx"
import { ReferencePanel } from "./reference-panel.tsx"

/*
 * The exploration as one window you can use: the app's own panels around a sketch of the canvas. Searching a library
 * outside the project happens in one browser over the canvas, whichever library it is. Find references, on the
 * toolbar and R, searches Mobbin and places what's picked beside the design. Find photos, in the Images tab, searches
 * Unsplash and adds what's picked to the project. The Images tab itself lists the project's own images.
 */

/** The real connectors, through the host, as the window reaches them: main in the app, the dev server in Storybook. */
export const live: Source = {
  search: (connector, request) => window.canvasHost.connectors.search({ connector, request })
}

/** Where a story starts. */
export interface Start {
  /** The browser, open on a library. Without a description it opens for the selected design, or empty. */
  browser?: BrowserStart & { library: LibraryId }
  /** Where searches go: the samples, unless a story asks for the real connectors. */
  source?: Source
  placed?: Placed[]
  /** The selected reference's key. */
  selected?: string
  /** The project's images, in place of the three it starts with. */
  images?: ProjectImage[]
  view?: View
  /** A note for the reviewer, over the canvas. */
  note?: ReactNode
}

/** Space between a design and its references, and between rows of them, in canvas pixels. */
const gap = { beside: 160, between: 48, rows: 140 }

const firstRecent: (Searched & { library: LibraryId })[] = [
  { library: "mobbin", query: "sign in page", filters: {} },
  { library: "mobbin", query: "paywall with a free trial", filters: { platform: "ios" } },
  { library: "mobbin", query: "dashboard with a usage chart", filters: {} },
  { library: "unsplash", query: "mountains", filters: {} },
  { library: "unsplash", query: "desk", filters: { orientation: "landscape" } }
]

function image(name: string, from: ProjectImage["from"], id: string): ProjectImage[] {
  const picture = sampleFound(id)

  return picture ? [{ name, from, picture }] : []
}

/** What the project's images folder holds before anything's added: a stock photo, a pasted image and a dropped one. */
const firstImages: ProjectImage[] = [
  ...image("lake-at-sunrise.jpg", "unsplash", "lake-at-sunrise"),
  ...image("old-dashboard.png", "pasted", "northwind-dashboard"),
  ...image("team-portrait.jpg", "dropped", "portrait-on-teal")
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

  const [source] = useState(() => start.source ?? samples())
  const [placed, setPlaced] = useState<Placed[]>(start.placed ?? [])
  const [photos, setPhotos] = useState<Found[]>([])
  const [images, setImages] = useState(start.images ?? firstImages)
  const [selected, setSelected] = useState(start.selected)
  const [recent, setRecent] = useState(firstRecent)
  const [fitKey, setFitKey] = useState(0)

  /** How references open for the selected design: its name as the description, for the platform it's drawn for. */
  const forDesign = (): BrowserStart => {
    if (!target) {
      return {}
    }

    const phone = containerModes(settings, target.container).primary.width < 600
    const name = target.container.name.toLowerCase()

    return phone ? { query: `${name} screen`, filters: { platform: "ios" } } : { query: `${name} page` }
  }

  const [browser, setBrowser] = useState<{ library: LibraryId; start: BrowserStart } | undefined>(() => {
    if (!start.browser) {
      return undefined
    }

    const { library, ...from } = start.browser

    return { library, start: library === "mobbin" ? { ...forDesign(), ...from } : from }
  })

  // Selecting a design, here or in Layers, lets go of the selected reference.
  const [lastDesign, setLastDesign] = useState(real.design)

  if (real.design !== lastDesign) {
    setLastDesign(real.design)

    if (real.design) {
      setSelected(undefined)
    }
  }

  const findReferences = (from?: BrowserStart) =>
    setBrowser({ library: "mobbin", start: from ?? { ...forDesign(), fresh: true } })

  const findPhotos = (query?: string) => setBrowser({ library: "unsplash", start: query ? { query, fresh: true } : {} })

  const placeReferences = (picked: Picked[]) => {
    const boxes = placed.map(boxOf)
    const below = boxes.length > 0 ? Math.max(...boxes.map((box) => box.y + box.height)) + gap.rows : 0
    let x = designBox.x + designBox.width + gap.beside

    const added = picked.map(({ found, query }) => {
      const each: Placed = { key: newKey(), found, x, y: below, query }
      x += boxOf(each).width + gap.between

      return each
    })

    setPlaced((current) => [...current, ...added])
    setSelected(added[0]?.key)
    selection.set({})
    toast(added.length === 1 ? "Placed a reference on the canvas" : `Placed ${added.length} references on the canvas`, {
      description: "References stay out of your designs, your code and exports."
    })
  }

  const addPhotos = (picked: Picked[]) => {
    const added = picked.flatMap(({ found }) => (photos.some((each) => each.id === found.id) ? [] : [found]))

    setPhotos((current) => [...current, ...added])
    setImages((current) => [
      ...added.map((picture): ProjectImage => ({ name: `${picture.id}.jpg`, from: "unsplash", picture })),
      ...current.filter(({ picture }) => !added.some((each) => each.id === picture.id))
    ])
    toast(added.length === 1 ? "Added a photo to the project" : `Added ${added.length} photos to the project`, {
      description: "They're in Images, each with its photographer's name."
    })
  }

  const place = (picked: Picked[]) => {
    if (browser?.library === "unsplash") {
      addPhotos(picked)
    } else {
      placeReferences(picked)
    }

    setBrowser(undefined)
    setFitKey((key) => key + 1)
  }

  /** Opens a result's page at its source. A sample has no page, so it says where it would go. */
  const openAtSource = (found: Found) => {
    if (sampleFound(found.id)) {
      const source = Object.values(libraries).find((library) => library.id === found.connector)

      toast(`Opening ${creditOf(found)} on ${source?.info.name ?? found.connector} in your browser`)
    } else {
      window.open(found.link, "_blank", "noreferrer")
    }
  }

  const shown = placed.find((each) => each.key === selected)

  return (
    <>
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
        <TabsContent value="layers" className="flex min-h-0 flex-col">
          <LayerTree />
        </TabsContent>
        <TabsContent value="components" className="flex min-h-0 flex-col">
          <ComponentsPanel />
        </TabsContent>
        <TabsContent value="icons" className="flex min-h-0 flex-col">
          <IconsPanel />
        </TabsContent>
        <TabsContent value="images" className="flex min-h-0 flex-col">
          <ProjectImagesPanel images={images} onFind={findPhotos} onOpenAtSource={openAtSource} />
        </TabsContent>
        <TabsContent value="tokens" className="flex min-h-0 flex-col">
          <TokensPanel />
        </TabsContent>
      </SidePanel>
      <CanvasSketch
        designName="Pricing"
        designColor={designColor(pricing?.container.kind)}
        designSelected={!!pricing && real.design === pricing.key && !selected}
        placed={placed}
        photos={photos}
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
        onOpen={openAtSource}
        onFind={() => findReferences()}
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
          {shown ? (
            <ReferencePanel
              placed={shown}
              onNote={(note) =>
                setPlaced((current) =>
                  current.map((each) => (each.key === shown.key ? { ...each, note: note || undefined } : each))
                )
              }
              onOpen={() => openAtSource(shown.found)}
              onMore={() =>
                findReferences({
                  query: creditOf(shown.found),
                  filters: shown.found.platform === "ios" ? { platform: "ios" } : {},
                  fresh: true
                })
              }
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
      <LibraryBrowser
        library={browser && libraries[browser.library]}
        source={source}
        start={browser?.start}
        recent={recent}
        onClose={() => setBrowser(undefined)}
        onSearched={({ query, filters }) => {
          const library = browser?.library ?? "mobbin"

          const same = (each: (typeof recent)[number]) =>
            each.library === library && each.query === query && JSON.stringify(each.filters) === JSON.stringify(filters)

          setRecent((current) => [{ library, query, filters }, ...current.filter((each) => !same(each))].slice(0, 10))
        }}
        onPlace={place}
        onOpenAtSource={openAtSource}
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
