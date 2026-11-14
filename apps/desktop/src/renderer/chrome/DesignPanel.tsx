import { designCapabilities, kindTitle, type InspectorSection, panelParts, selectionKey } from "@parity-app/editor"
import { Crown, MousePointerClick } from "lucide-react"
import type { ComponentType, ReactNode } from "react"
import { boardComponent } from "../canvas/component-boards.ts"
import { useProject } from "../canvas/context.ts"
import { DesignIcon, designColor } from "../canvas/kinds.tsx"
import { routePageGroups, routePageRoute, routePageTarget, selectedPageGroup } from "../canvas/route-pages.ts"
import { storyLayer, storyScreensFile } from "../canvas/story-screens.ts"
import { ModesList } from "../canvas/view-lists.tsx"
import { containerModes } from "../canvas/view.ts"
import { useComponents } from "../components-store.ts"
import { type ContainerEntry, useContainerEntry, useModeSettings, useNotes } from "../design-store.ts"
import { FieldTarget, FirstStateName } from "../inspector/controls/field-row.tsx"
import { PropsSection } from "../inspector/sections/PropsSection.tsx"
import { useSelection } from "../selection.ts"
import { useStore } from "../store.ts"
import { componentOffers, pageOffers, runAction } from "./adapter-actions.ts"
import { ComponentSourceSection } from "./ComponentSourceSection.tsx"
import { ComponentsSection } from "./ComponentsSection.tsx"
import { ExportSection } from "./ExportSection.tsx"
import { Hint } from "./Hint.tsx"
import { LayerPanel } from "./LayerPanel.tsx"
import { ArrangePanel, MultiLayerPanel } from "./MultiPanel.tsx"
import { Name } from "./Name.tsx"
import { PanelSection, panelEnd } from "./PanelSection.tsx"
import { readFromCode, writesProps } from "./read-from-code.ts"
import { ReferencePanel } from "./ReferencePanel.tsx"
import { PageGroupPanel, RouteProps, RouteSection } from "./RoutePanel.tsx"
import { useLayer } from "./selected-layer.ts"
import { HeaderActions, headingIcon, headingName, SelectionHeading } from "./SelectionHeading.tsx"
import { useStyleEditor } from "./style-editor.ts"
import { StyleSections } from "./StyleSections.tsx"
import { TriedSize } from "./TriedSize.tsx"
import { ModeViewportIcon } from "./viewports.tsx"

/**
 * The Design tab: whatever is selected, a design, one of its layers or modes, or text on the canvas. Its number fields
 * edit the selection, so a run of Up and Down presses in one ends when the selection changes.
 */
export function DesignTab() {
  return (
    <DesignTabFields>
      <SelectedPanel />
    </DesignTabFields>
  )
}

/**
 * What every section in the Design tab reads beside the selection: which selection its fields edit, and the first
 * state's name. A story drawing one section alone puts it in this.
 */
export function DesignTabFields({ children }: { children: ReactNode }) {
  const { store, selection } = useProject()
  const selected = useSelection(selection)
  const entry = useContainerEntry(store, selected.design)

  return (
    <FieldTarget value={selectionKey(selected)}>
      <FirstStateName value={entry?.container.states?.[0]?.name ?? "Default"}>{children}</FirstStateName>
    </FieldTarget>
  )
}

function SelectedPanel() {
  const { id, store, selection } = useProject()
  const selected = useSelection(selection)
  const entry = useContainerEntry(store, selected.design)
  const pickedGroup = useStore(selectedPageGroup)
  // A layout group isn't a design, so the selection holds nothing while one is picked.
  const group = entry ? undefined : routePageGroups(id).find(({ key }) => key === pickedGroup)

  if (selected.note) {
    return <NotePanel noteKey={selected.note} />
  }

  if (selected.reference) {
    return <ReferencePanel referenceKey={selected.reference} />
  }

  if (group) {
    return <PageGroupPanel group={group} />
  }

  if (!entry) {
    return (
      <div className="type-empty flex flex-col items-center gap-2 px-6 py-12 text-center text-muted-foreground">
        <MousePointerClick className="size-5" />
        Select a screen, component or frame on the canvas or in Layers.
        {/* A non-breaking hyphen, so the balanced hint never breaks "double-click" across its lines. */}
        <span className="text-xs">Click inside one to select a layer, and double‑click to go deeper.</span>
      </div>
    )
  }

  if (selected.nodes && selected.nodes.length > 1) {
    // Another set of layers starts its fields afresh, as another layer does, rather than keeping what was typed.
    return <MultiLayerPanel key={selected.nodes.join(",")} entry={entry} ids={selected.nodes} />
  }

  if (selected.designs && selected.designs.length > 1) {
    return <ArrangePanel keys={selected.designs} />
  }

  if (selected.node) {
    const panel = <LayerPanel key={selected.node} entry={entry} nodeId={selected.node} />

    // A story's layers can be dragged to another size, to see how it responds, which is put back from here.
    const tried = entry.path === storyScreensFile && <TriedSize entry={entry} />

    // A layer of a page, a component's board or a story is read from the project's code: its values show, and nothing
    // edits them.
    return readFromCode(entry.path) && !writesProps(entry.path, selected.node) ? (
      <>
        <fieldset disabled className="contents">
          {panel}
        </fieldset>
        {tried}
      </>
    ) : (
      <>
        {panel}
        {tried}
      </>
    )
  }

  return <DesignPanel entry={entry} />
}

/** A whole design's sections, as `panelParts` picks them from what it can do (PAR-1032). */
function DesignPanel({ entry }: { entry: ContainerEntry }) {
  const session = useProject()
  const components = useComponents(session.components)
  const can = designCapabilities(entry.container, (component) => components[component]?.takesStyle)
  // A page of the app (PAR-1076): its header, its path params as props, its route, its modes and Export; nothing of it
  // is designed.
  const route = routePageRoute(session.id, entry.container.id)

  if (route !== undefined) {
    return (
      <>
        <DesignHeader entry={entry} />
        <RouteProps entry={entry} route={route} />
        <RouteSection route={route} />
        <ModesSection entry={entry} />
        <DesignExport entry={entry} />
      </>
    )
  }

  // A story: its header, the props it draws its component with, which are its args, its modes and Export.
  if (entry.path === storyScreensFile) {
    return (
      <>
        <DesignHeader entry={entry} />
        <StoryProps entry={entry} />
        <TriedSize entry={entry} />
        <ModesSection entry={entry} />
        <DesignExport entry={entry} />
      </>
    )
  }

  // One of the project's components on its board: its header, what its code says of it, and Export.
  const component = boardComponent(session.id, entry.container.id)

  if (component !== undefined) {
    return (
      <>
        <DesignHeader entry={entry} />
        <ComponentSourceSection component={component} />
        <DesignExport entry={entry} />
      </>
    )
  }

  return panelParts(can).map((section) => {
    const Section = designSections[section]

    return Section && <Section key={section} entry={entry} />
  })
}

/** A story's args, as the props of the layer that draws it, which edits write back to its file. */
function StoryProps({ entry }: { entry: ContainerEntry }) {
  const layer = useLayer(entry, storyLayer)

  return layer ? <PropsSection layer={layer} /> : null
}

/** What draws each of a design's sections; a layer's own, as Content and Attributes, aren't a design's. */
const designSections: Partial<Record<InspectorSection, ComponentType<{ entry: ContainerEntry }>>> = {
  header: DesignHeader,
  props: () => <PropsSection />,
  components: ComponentsSection,
  styles: FrameStyles,
  modes: ModesSection,
  export: DesignExport
}

/** Export, for a whole design. */
function DesignExport({ entry }: { entry: ContainerEntry }) {
  return (
    <ExportSection
      targets={[{ design: entry.key, name: entry.container.name }]}
      label={`Export ${entry.container.name}`}
    />
  )
}

/** A design's name and kind, and for a frame, the mode it's drawn in and that it isn't written to code. */
function DesignHeader({ entry }: { entry: ContainerEntry }) {
  const session = useProject()
  const { store } = session
  const settings = useModeSettings(store)
  const { container } = entry
  const { primary } = containerModes(settings, container)
  // A page of the app is its route, read from the app's code rather than saved (PAR-1076).
  const target = routePageTarget(session.id, container)
  const page = target !== undefined
  const component = boardComponent(session.id, container.id)
  const board = component !== undefined
  const story = entry.path === storyScreensFile
  let kind = kindTitle(container.kind)
  let detail = `${kind}, saved in ${entry.path}`

  if (page) {
    kind = "Route"
    detail = "Route, read from the app's router"
  } else if (board) {
    kind = "Component"
    detail = "Component, drawn from the project's code"
  } else if (story) {
    kind = "Story"
    detail = "Story, read from its Storybook file"
  }

  return (
    <>
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <SelectionHeading
          icon={
            <DesignIcon
              kind={board ? "component" : container.kind}
              route={page}
              story={story}
              className={headingIcon}
            />
          }
          color={designColor(board ? "component" : container.kind)}
          kind={kind}
          detail={detail}
          action={
            // What the project's adapters offer for a board's component, as Open in Storybook, or for a page, as Open
            // in browser.
            (board || target) && (
              <HeaderActions
                adapterOffers={
                  target ? pageOffers(session.info, target.route) : componentOffers(session.info, component)
                }
                page={target !== undefined}
                onAdapterAction={({ action }) => void runAction(session.id, action, component, target)}
              />
            )
          }
          name={<Name className={`px-1.5 ${headingName}`}>{container.name}</Name>}
        />
        {container.kind === "frame" && !board && !story && (
          <div className="mt-2 flex flex-col gap-2 pl-1.5">
            <Hint label="Frames are drawn in the project's primary mode" wait>
              <span className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground">
                <Crown className="size-3 shrink-0 text-amber-400" aria-hidden />
                <ModeViewportIcon of={primary} className="size-3.5 shrink-0" aria-hidden />
                Drawn in {primary.name}
              </span>
            </Hint>
            <p className="type-description text-muted-foreground">
              A frame isn&apos;t written to code. Convert it to a component or a screen to use it in your app.
            </p>
          </div>
        )}
      </div>
    </>
  )
}

/**
 * A frame's own layout, size and fill, straight after its name, since selecting a frame selects its root layout: it
 * has no states, modes or params. Its width and height are the frame's size (see `useStyleEditor`).
 */
function FrameStyles({ entry }: { entry: ContainerEntry }) {
  const editor = useStyleEditor(entry, [entry.container.root.id])

  return editor ? <StyleSections editor={editor} container={entry.container} /> : null
}

/**
 * A screen's or component's modes in its own order, each put in place by its handle, each shown by its switch: any can
 * be off while another shows, and the first shown is drawn at full size (see `ModesList`).
 */
export function ModesSection({ entry }: { entry: ContainerEntry }) {
  const { store } = useProject()
  const settings = useModeSettings(store)
  const { ordered } = containerModes(settings, entry.container)

  return (
    <PanelSection title="Modes" count={ordered.length}>
      <ModesList entry={entry} group="modes" />
    </PanelSection>
  )
}

function NotePanel({ noteKey }: { noteKey: string }) {
  const { store } = useProject()
  const note = useNotes(store).find((entry) => entry.key === noteKey)

  if (!note) {
    return null
  }

  return (
    <PanelSection title="Text on the canvas">
      <textarea
        key={note.note.text}
        defaultValue={note.note.text}
        rows={5}
        onBlur={(event) => {
          const text = event.currentTarget.value

          if (text !== note.note.text) {
            store.updateNote(noteKey, text.trim() ? "Edit text" : "Delete text", (current) =>
              text.trim() ? { ...current, text } : undefined
            )
          }
        }}
        className="w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
      />
      <p className="type-description mt-2 px-1 text-muted-foreground">
        Saved in {note.path}. Double-click it on the canvas to edit in place.
      </p>
    </PanelSection>
  )
}
