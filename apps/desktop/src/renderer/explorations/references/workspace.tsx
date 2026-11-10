import { TabsContent } from "@buildkitgg/shadcn-baseui-kit"
import type { Found, RecentSearch } from "@parity-app/connectors"
import { fileBaseName, skippedMessage, sortDrop } from "@parity-app/editor"
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
import { useEffect, useState } from "react"
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
import { boxOf, CanvasSketch, designBox, type Dropped, type DroppedImage, type Placed, type View } from "./canvas.tsx"
import { sampleFound, samples, type Source } from "./data.ts"
import { type ImageUse, type ProjectImage, ProjectImagesPanel } from "./images-panel.tsx"
import { creditOf, libraries, type LibraryId, type Searched, shownFilters } from "./library.tsx"
import { ReferencePanel } from "./reference-panel.tsx"

/*
 * The exploration as one window you can use: the app's own panels around a sketch of the canvas. Searching a library
 * outside the project happens in one browser over the canvas, whichever library it is. Find references, on the
 * toolbar and R, searches Mobbin and places what's picked beside the design. Find photos, in the Images tab, searches
 * Unsplash and adds what's picked to the project. The Images tab itself lists the project's own images. Image files
 * dropped on the tab are added to the project, and dropped on the canvas are placed too (PAR-835); an image's menu
 * removes it (PAR-836).
 */

/** The real connectors, through the host, as the window reaches them: main in the app, the dev server in Storybook. */
export const live: Source = {
  search: (connector, request) => window.canvasHost.connectors.search({ connector, request }),
  recent: () => window.canvasHost.connectors.recent()
}

/** A recent search the host kept, as the browser lists one, when it's from a library the browser has. */
function fromKept({ connector, query, filters }: RecentSearch): (Searched & { library: LibraryId })[] {
  const library = Object.values(libraries).find((each) => each.id === connector)

  if (!library) {
    return []
  }

  // The host keeps every filter a search ran with. The browser's own are the ones it shows.
  const shown = shownFilters(library.info).flatMap(({ id }) => (filters[id] ? [[id, filters[id]]] : []))

  return [{ library: library.id, query, filters: Object.fromEntries(shown) }]
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
  /** The project's images, in place of the ones it starts with, with what each looks like by its `src`. */
  images?: ImagesStart
  view?: View
}

/** Space between a design and its references, and between rows of them, in canvas pixels. */
const gap = { beside: 160, between: 48, rows: 140 }

const firstRecent: (Searched & { library: LibraryId })[] = [
  { library: "mobbin", query: "landing page", filters: {} },
  { library: "mobbin", query: "paywall with a free trial", filters: { platform: "ios" } },
  { library: "mobbin", query: "support inbox", filters: {} },
  { library: "unsplash", query: "mountains", filters: {} },
  { library: "unsplash", query: "desk", filters: { orientation: "landscape" } }
]

/** Pasted, dropped and added images use the same folder, as `images.import` saves them. */
const folder = "public/images"

/** A file in the project's images folder, drawn as a sample. */
function sampleFile(name: string, id: string, uses: Partial<Pick<ProjectImage, "usedBy" | "usedInCode">> = {}) {
  const picture = sampleFound(id)

  const image: ProjectImage = {
    kind: "file",
    src: `/images/${name}`,
    path: `${folder}/${name}`,
    name,
    bytes: 180_000,
    usedBy: uses.usedBy ?? [],
    usedInCode: uses.usedInCode ?? []
  }

  return { image, picture }
}

/** A use of an image by a layer of Pricing, the design on the canvas. */
const inPricing = (node: string): ImageUse => ({ document: "app.par", design: "pricing", designName: "Pricing", node })

/** The project's images, and what each looks like by its `src`. */
interface ImagesStart {
  images: ProjectImage[]
  pictures: Record<string, Found>
}

/**
 * What the project has before anything's added: a photo from Unsplash that Pricing shows, a pasted image nothing uses, a
 * dropped one the project's code names, a photo Pricing links to at Unsplash, and a path Pricing names with no file.
 */
function startingImages(): ImagesStart {
  const lake = sampleFile("lake-at-sunrise.jpg", "lake-at-sunrise", { usedBy: [inPricing("hero-photo")] })
  const coast = sampleFound("rocky-coast")
  const pictures: Record<string, Found> = {}

  if (lake.picture) {
    lake.image.credit = {
      name: creditOf(lake.picture),
      url: lake.picture.credit[0]?.url ?? lake.picture.link,
      source: "Unsplash"
    }
  }

  const files = [
    lake,
    sampleFile("old-dashboard.png", "northwind-dashboard"),
    sampleFile("team-portrait.jpg", "portrait-on-teal", { usedInCode: [{ path: "src/pages/About.tsx", line: 14 }] })
  ]

  for (const { image, picture } of files) {
    if (picture) {
      pictures[image.src] = picture
    }
  }

  const linked: ProjectImage[] = []

  if (coast) {
    pictures[coast.image.url] = coast
    linked.push({
      kind: "linked",
      src: coast.image.url,
      name: `Photo by ${creditOf(coast)}`,
      credit: { name: creditOf(coast), url: coast.credit[0]?.url ?? coast.link, source: "Unsplash" },
      usedBy: [inPricing("testimonial-photo"), inPricing("footer-photo")],
      usedInCode: []
    })
  }

  const missing: ProjectImage = {
    kind: "missing",
    src: "/images/old-logo.svg",
    name: "/images/old-logo.svg",
    usedBy: [inPricing("logo")],
    usedInCode: []
  }

  return { images: [...files.map(({ image }) => image), ...linked, missing], pictures }
}

/** A dropped file's natural size, read from the file itself; square when it can't be read. */
function naturalSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const picture = new Image()
    picture.onload = () => resolve({ width: picture.naturalWidth || 1, height: picture.naturalHeight || 1 })
    picture.onerror = () => resolve({ width: 1, height: 1 })
    picture.src = url
  })
}

/** What a new frame of dropped images is called: after the file when there's one, and Images when there are several. */
function frameName(images: readonly DroppedImage[]): string {
  const [only] = images

  return images.length === 1 && only ? fileBaseName(only.name) : "Images"
}

/** How long an image just added stays marked, in milliseconds. */
const freshFor = 1600

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
  const [first] = useState(() => start.images ?? startingImages())
  const [images, setImages] = useState(first.images)
  const [pictures, setPictures] = useState(first.pictures)
  const [fresh, setFresh] = useState<string[]>([])
  const [dropped, setDropped] = useState<Dropped[]>([])
  const [landed, setLanded] = useState<string[]>([])
  const [selected, setSelected] = useState(start.selected)
  const [recent, setRecent] = useState(source.recent ? [] : firstRecent)
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

  // A source that keeps the recent searches is asked for them each time the browser opens.
  const opened = browser?.library

  useEffect(() => {
    if (!opened || !source.recent) {
      return undefined
    }

    let wanted = true

    void source.recent().then((kept) => {
      if (wanted) {
        setRecent(kept.flatMap(fromKept))
      }
    })

    return () => {
      wanted = false
    }
  }, [opened, source])

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
    toast(added.length === 1 ? "Placed a reference on the canvas" : `Placed ${added.length} references on the canvas`)
  }

  /** Marks images just added for a moment, as they arrive in the Images tab. */
  const markFresh = (srcs: string[]) => {
    setFresh(srcs)
    setTimeout(() => setFresh((current) => current.filter((src) => !srcs.includes(src))), freshFor)
  }

  const addPhotos = (picked: Picked[]) => {
    const added = picked.flatMap(({ found }) => (photos.some((each) => each.id === found.id) ? [] : [found]))

    const files = added.map((picture): ProjectImage => {
      const name = `${picture.id}.jpg`

      return {
        kind: "file",
        src: `/images/${name}`,
        path: `${folder}/${name}`,
        name,
        credit: { name: creditOf(picture), url: picture.credit[0]?.url ?? picture.link, source: "Unsplash" },
        usedBy: [{ document: "app.par", design: "photos", designName: "Photos", node: picture.id }],
        usedInCode: []
      }
    })

    setPhotos((current) => [...current, ...added])
    setImages((current) => [...files, ...current.filter((image) => !files.some((each) => each.src === image.src))])
    setPictures((current) => ({
      ...current,
      ...Object.fromEntries(files.map((image, index) => [image.src, added[index]!]))
    }))
    markFresh(files.map((image) => image.src))
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

  /**
   * Image files dropped on the Images tab or the canvas, saved into the project as `images.import` saves them, named
   * after the file. Each one's picture is the file itself. Files that aren't images, or are too large, are named.
   */
  const addFiles = async (files: File[]): Promise<{ image: ProjectImage; dropped: DroppedImage }[]> => {
    const { images: taken, skipped } = sortDrop(files)
    const message = skippedMessage(skipped)

    if (message) {
      toast(message.title, { description: message.description })
    }

    const added = await Promise.all(
      taken.map(async ({ index }) => {
        const file = files[index]!
        const url = URL.createObjectURL(file)
        const size = await naturalSize(url)

        const base = fileBaseName(file.name)
          .toLowerCase()
          .replaceAll(/[^a-z0-9]+/g, "-")

        // As `images.import` names it: after the file, with a short hash of its content.
        const name = `${base}-${crypto.randomUUID().slice(0, 8)}${file.name.slice(file.name.lastIndexOf("."))}`

        const src = `/images/${name}`

        const picture: Found = {
          connector: "project",
          id: src,
          kind: "photos",
          title: file.name,
          image: { url, ...size },
          link: url,
          credit: []
        }

        const image: ProjectImage = {
          kind: "file",
          src,
          path: `${folder}/${name}`,
          name,
          bytes: file.size,
          usedBy: [],
          usedInCode: []
        }

        const width = 320

        return {
          image,
          picture,
          dropped: {
            key: newKey(),
            picture,
            name: file.name,
            width,
            height: Math.round((width / size.width) * size.height)
          }
        }
      })
    )

    setImages((current) => [...added.map(({ image }) => image), ...current])
    setPictures((current) => ({
      ...current,
      ...Object.fromEntries(added.map(({ image, picture }) => [image.src, picture]))
    }))
    markFresh(added.map(({ image }) => image.src))

    return added
  }

  /** Files dropped on the canvas: added to the project, and placed where they were dropped, selected. */
  const dropFiles = async (files: File[], at: { x: number; y: number }, onto: "design" | "canvas") => {
    const added = await addFiles(files)

    if (added.length === 0) {
      return
    }

    const key = newKey()
    const frame = onto === "canvas" ? frameName(added.map((each) => each.dropped)) : undefined
    const drop: Dropped = { key, x: at.x, y: at.y, images: added.map((each) => each.dropped) }

    if (frame) {
      drop.frame = frame
    }

    // The new layers use them now, so the Images tab says where.
    const use = (node: string): ImageUse => ({
      document: "app.par",
      design: onto === "design" ? "pricing" : key,
      designName: frame ?? "Pricing",
      node
    })

    setImages((current) =>
      current.map((image) => {
        const placedAs = added.find((each) => each.image.src === image.src)

        return placedAs ? { ...image, usedBy: [use(placedAs.dropped.key)] } : image
      })
    )
    setDropped((current) => [...current, drop])
    setLanded([key])
    setSelected(undefined)
    selection.set({})
  }

  /** Removes an image, and the layers that show it with it, in one step Undo takes back. */
  const removeImage = (image: ProjectImage) => {
    const index = images.findIndex((each) => each.src === image.src)
    const layers = image.usedBy.length === 1 ? "1 layer" : `${image.usedBy.length} layers`
    const named = image.kind === "file" ? image.name : layers
    const removed = image.kind === "file" && image.usedBy.length > 0 ? `${image.name} and ${layers}` : named

    setImages((current) => current.filter((each) => each.src !== image.src))
    toast(`Removed ${removed}`, {
      action: {
        label: "Undo",
        onClick: () => setImages((current) => [...current.slice(0, index), image, ...current.slice(index)])
      }
    })
  }

  /** Shows a layer that uses an image: selects the design it's in, on the canvas. */
  const showUse = (use: ImageUse) => {
    setSelected(undefined)

    if (use.design === "pricing" && pricing) {
      selection.set({ design: pricing.key })
    } else {
      setLanded(dropped.some((drop) => drop.key === use.design) ? [use.design] : [])
    }
  }

  const openImageAtSource = (image: ProjectImage) => {
    const picture = pictures[image.src]

    if (picture) {
      openAtSource(picture)
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
          <ProjectImagesPanel
            images={images}
            pictures={pictures}
            fresh={fresh}
            onFind={findPhotos}
            onOpenAtSource={openImageAtSource}
            onAdd={(files) => void addFiles(files)}
            onRemove={removeImage}
            onShow={showUse}
          />
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
        dropped={dropped}
        landed={landed}
        onDropFiles={(files, at, onto) => void dropFiles(files, at, onto)}
        onSelectDesign={() => {
          setLanded([])
          setSelected(undefined)
          selection.set(pricing ? { design: pricing.key } : {})
        }}
        onSelect={(key) => {
          setLanded([])
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
      />
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
          // A source that keeps the recent searches adds this one itself, once it has worked.
          if (source.recent) {
            return
          }

          const library = browser?.library ?? "mobbin"

          // One entry for each description, with the filters it was last searched with.
          const same = (each: (typeof recent)[number]) =>
            each.library === library && each.query.toLowerCase() === query.toLowerCase()

          setRecent((current) => [{ library, query, filters }, ...current.filter((each) => !same(each))].slice(0, 20))
        }}
        onPlace={place}
        onOpenAtSource={openAtSource}
      />
    </>
  )
}
