import {
  Button,
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Toggle,
  useHighlightedCode
} from "@buildkitgg/shadcn-baseui-kit"
import {
  type DesignNode,
  type ElementSource,
  elementSourceAttribute,
  isInnerPath,
  locateInner,
  locateNode
} from "@parity-app/core"
import { editingState } from "@parity-app/editor"
import { CodeXml, Crosshair, FileCode2, Package, SquareArrowOutUpRight } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { useProject } from "../../canvas/context.ts"
import { fileName, type SourcedElement, shortSource } from "../../canvas/element-sources.ts"
import { kindColors, layerLabel, NodeIcon, nodeColor } from "../../canvas/kinds.tsx"
import { projectLibrary } from "../../canvas/layers.ts"
import { openSource, viewCode } from "../../chrome/code-editor.ts"
import { Hint } from "../../chrome/Hint.tsx"
import { Name } from "../../chrome/Name.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { type ContainerEntry, useContainerEntries, useContainerEntry } from "../../design-store.ts"
import { watchFrame } from "../../frame-host.ts"
import { findFrames, findNodeElements, subscribeFrames } from "../../frame.ts"
import { useSelection } from "../../selection.ts"
import type { ProjectDesigns, ProjectSession } from "../../workspace.ts"
import { sourcedElements } from "./element-list.ts"
import { hoverElement, pickElement, setPicking, useInspecting } from "./inspect.ts"

/** How many lines show around the picked element's line: before it, and after. */
const around = { before: 5, after: 12 }

type ComponentLayer = Extract<DesignNode, { type: "component" }>

/**
 * The inspector's Code tab as it was (PAR-167), set aside on 2026-11-12 with the rest of the code side (PAR-1027):
 * where the selected component layer's code is. Its component and file, the elements it draws that the project's files
 * wrote, each with its file and line, and the picked one's lines. Inspect picks an element on the canvas instead, as a
 * browser's developer tools do, selecting the layer it's in; it works with nothing selected. A library's component
 * says so, since its elements are written in the library, and Parity's own layers, text, images and layouts, have no
 * line in the project.
 */
export function CodePanel() {
  const session = useProject()
  const { store, selection } = session
  const selected = useSelection(selection)
  const entry = useContainerEntry(store, selected.design)
  const entries = useContainerEntries(store)
  const label = (node: DesignNode) => layerLabel(node, entries, store.getComponentLibrary(), session.info.libraries)
  const several = (selected.nodes?.length ?? 0) > 1 || (selected.designs?.length ?? 0) > 1
  const node = entry && selected.node && !several ? selectedLayer(session, entry, selected.node) : undefined

  if (several) {
    return <Nothing title="Select one layer">Each layer shows its own code.</Nothing>
  }

  if (!node || !entry || !selected.node) {
    return (
      <Nothing title="Select a component">
        Or pick an element on the canvas to see the file and line it&apos;s written on.
      </Nothing>
    )
  }

  if (node.type !== "component") {
    return (
      <Nothing title={`${label(node)} is Parity's own layer`}>
        Text, images and layouts are drawn from the design file, so they have no line in the project. Pick an element
        inside a component instead.
      </Nothing>
    )
  }

  return <ComponentCode entry={entry} nodeId={selected.node} node={node} name={label(node)} />
}

/** The selected layer as the board shows it, whether it's the design's own or inside an instance. */
function selectedLayer(session: ProjectDesigns, entry: ContainerEntry, nodeId: string): DesignNode | undefined {
  const { container } = entry

  if (!isInnerPath(nodeId)) {
    return locateNode(container.root, nodeId)?.node
  }

  const state = editingState(container, session.selection.get().state)
  const library = projectLibrary(session.store)

  return locateInner(container, nodeId, library, { state, variants: container.view?.variants })?.shown
}

/** Nothing to show the code of: what to select, and Inspect, to pick an element on the canvas. */
function Nothing({ title, children }: { title: string; children: ReactNode }) {
  const { picking } = useInspecting()

  return (
    <Empty className="flex-1 justify-start border-0 px-6 pt-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CodeXml />
        </EmptyMedia>
        <EmptyTitle className="text-sm">{title}</EmptyTitle>
        <EmptyDescription className="text-xs">{children}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <InspectToggle pressed={picking} />
      </EmptyContent>
    </Empty>
  )
}

/** Inspect: picks an element on the canvas, as a browser's developer tools do. Escape or picking one stops it. */
function InspectToggle({ pressed }: { pressed: boolean }) {
  return (
    <Hint label="Pick an element on the canvas to see its code" detail="Press Esc to stop" wait>
      <Toggle size="sm" variant="outline" pressed={pressed} onPressedChange={setPicking} className="gap-1.5 text-xs">
        <Crosshair /> Inspect
      </Toggle>
    </Hint>
  )
}

function ComponentCode({
  entry,
  nodeId,
  node,
  name: layerName
}: {
  entry: ContainerEntry
  nodeId: string
  node: ComponentLayer
  /** The layer's name, as the Layers panel names it. */
  name: string
}) {
  const session = useProject()
  const source = session.info.sources[node.component]
  const inspecting = useInspecting()
  const elements = useLayerElements(entry, nodeId)

  const picked =
    (inspecting.picked?.node === nodeId && elements.find((element) => element.at === inspecting.picked?.at)) ||
    elements[0]

  const name = source?.export ?? node.component

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b py-2 pr-2 pl-4">
        <NodeIcon node={node} className="size-4 shrink-0" style={{ color: nodeColor(node) }} />
        {/* The selection's title, as the Design tab shows it, so switching tabs doesn't resize it. */}
        <Name className="min-w-0 flex-1 text-base font-semibold">{layerName}</Name>
        <InspectToggle pressed={inspecting.picking} />
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <PanelSection title="Component">
          <Item variant="outline" size="xs">
            <ItemMedia variant="icon">
              {source?.library ? <Package /> : <FileCode2 style={{ color: kindColors.component }} />}
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="font-mono text-xs">{name}</ItemTitle>
              <ItemDescription className="truncate font-mono text-2xs">
                {source?.library ? `from ${source.path}` : (source?.path ?? "Not found in the project")}
              </ItemDescription>
            </ItemContent>
            {source && (!source.library || source.declaration) && (
              <ItemActions>
                <Hint label={source.library ? "Open its types in your editor" : "Open in your editor"}>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Open ${name} in your editor`}
                    onClick={() => void viewCode(session.info, node.component)}
                  >
                    <SquareArrowOutUpRight />
                  </Button>
                </Hint>
              </ItemActions>
            )}
          </Item>
          {source?.library && (
            <p className="type-description mt-3 px-1 text-muted-foreground">
              {`${name} is written in ${source.path}, so its elements have no lines in the project.`}
            </p>
          )}
        </PanelSection>
        {!source?.library && (
          <>
            <PanelSection
              title="Elements"
              count={elements.length}
              description={elements.length > 0 ? "Point at one to find it on the canvas." : undefined}
            >
              <ElementList nodeId={nodeId} elements={elements} picked={picked} />
            </PanelSection>
            {picked && (
              <PanelSection title="Source">
                <SourceLines session={session} source={picked.source} />
              </PanelSection>
            )}
          </>
        )}
      </div>
    </>
  )
}

/** The elements, nested as the code nests them; pointing at one outlines it on the canvas, and clicking it picks it. */
function ElementList({
  nodeId,
  elements,
  picked
}: {
  nodeId: string
  elements: SourcedElement[]
  picked: SourcedElement | undefined
}) {
  if (elements.length === 0) {
    return (
      <p className="type-description px-1 text-muted-foreground">
        No elements have a line yet. The project&apos;s dev server adds them as the frame draws.
      </p>
    )
  }

  return (
    <ul aria-label="Elements it draws" className="flex flex-col" onPointerLeave={() => hoverElement(undefined)}>
      {elements.map((element, index) => {
        const chosen = element === picked

        return (
          <li key={`${element.at}:${index}`}>
            <button
              type="button"
              aria-current={chosen ? "true" : undefined}
              className={`flex h-6 w-full min-w-0 items-center gap-2 rounded-md pr-1.5 text-left font-mono text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${
                chosen ? "bg-accent text-accent-foreground" : ""
              }`}
              style={{ paddingLeft: 6 + Math.min(element.depth, 6) * 12 }}
              onPointerEnter={() => hoverElement({ node: nodeId, at: element.at })}
              onFocus={() => hoverElement({ node: nodeId, at: element.at })}
              onClick={() => pickElement({ node: nodeId, at: element.at })}
            >
              <span className="shrink-0" style={{ color: kindColors.component }}>
                {element.tag}
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-2xs text-muted-foreground">
                {shortSource(element.source)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** The lines an element is written on, its own highlighted, from the project's file as it is on disk. */
function SourceLines({ session, source }: { session: ProjectSession; source: ElementSource }) {
  const file = useProjectFile(source.path)
  const first = Math.max(1, source.line - around.before)
  const shown = file.state === "read" ? file.text.split("\n").slice(first - 1, source.line + around.after) : []
  const lines = useHighlightedCode(shown.join("\n"), source.path.endsWith(".jsx") ? "jsx" : "tsx")
  const where = `${source.path}:${source.line}:${source.column}`

  return (
    <CodeBlock size="sm">
      <CodeBlockHeader>
        <Hint label={source.path} wait>
          <CodeBlockTitle className="min-w-0 truncate font-mono">{`${fileName(source.path)}:${source.line}`}</CodeBlockTitle>
        </Hint>
        <CodeBlockActions>
          <CodeBlockCopyButton value={where} aria-label="Copy the file and line" />
          <Hint label="Open in your editor">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Open ${fileName(source.path)} at line ${source.line}`}
              onClick={() => void openSource(session.info, source)}
            >
              <SquareArrowOutUpRight />
            </Button>
          </Hint>
        </CodeBlockActions>
      </CodeBlockHeader>
      {/* The source is read, not glanced at, so it's a code block: 12px on an 18px line. */}
      {file.state === "read" ? (
        <CodeBlockContent lineNumbers startLine={first} className="type-code">
          {lines.map((line, index) => (
            <CodeBlockLine key={first + index} variant={first + index === source.line ? "highlighted" : "default"}>
              {line}
            </CodeBlockLine>
          ))}
        </CodeBlockContent>
      ) : (
        <p className="type-message px-3 py-2 text-muted-foreground">
          {file.state === "failed" ? file.error.message : `Reading ${fileName(source.path)}…`}
        </p>
      )}
    </CodeBlock>
  )
}

/**
 * The elements the layer draws that the project's files wrote, in the frame the selection was made in, or else the
 * design's first, read again as the frame draws.
 */
function useLayerElements(entry: ContainerEntry, nodeId: string): SourcedElement[] {
  const { selection } = useProject()
  const selected = useSelection(selection)
  const [elements, setElements] = useState<SourcedElement[]>([])
  const { mode, state } = selected
  useEffect(() => {
    let stopWatching: (() => void) | undefined
    let watched: Element | undefined

    const read = () => {
      const host = findFrames(document, entry.key, { mode, state })[0] ?? findFrames(document, entry.key)[0]
      const next = host ? sourcedElements(findNodeElements(host, nodeId)) : []
      setElements((current) => (sameElements(current, next) ? current : next))

      if (host && host !== watched) {
        stopWatching?.()
        stopWatching = watchFrame(host, read, { attributes: [elementSourceAttribute] })
        watched = host
      }
    }

    read()
    const stop = subscribeFrames(read)

    return () => {
      stop()
      stopWatching?.()
    }
  }, [entry.key, nodeId, mode, state])

  return elements
}

function sameElements(a: SourcedElement[], b: SourcedElement[]): boolean {
  return a.length === b.length && a.every((element, index) => element.element === b[index]?.element)
}

/**
 * One of the example's files as text, from the copy Storybook serves, an error saying why it couldn't be read, or that
 * it's still being read. The app's service read the project's file from disk, so an edit made in the editor showed.
 */
function useProjectFile(path: string): ProjectFile {
  const [read, setRead] = useState<{ path: string; file: ProjectFile }>()
  useEffect(() => {
    let cancelled = false
    void import("virtual:parity/example-sources").then(({ default: files }) => {
      const text = files[path]

      if (!cancelled) {
        setRead({
          path,
          file:
            text === undefined
              ? { state: "failed", error: new Error(`${path} isn't in the project's folder`) }
              : { state: "read", text }
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [path])

  return read?.path === path ? read.file : { state: "reading" }
}

type ProjectFile = { state: "reading" } | { state: "read"; text: string } | { state: "failed"; error: Error }
