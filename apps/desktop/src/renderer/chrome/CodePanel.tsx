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
  calcPixels,
  type CodeComponent,
  type DesignNode,
  type ElementSource,
  iconComponent,
  isInnerPath,
  type LayerToken,
  layerCode,
  locateInner,
  locateNode,
  radiusKeywords
} from "@parity-app/core"
import { editingState } from "@parity-app/editor"
import { CodeXml, Crosshair, FileCode2, Package, SquareArrowOutUpRight } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useProject } from "../canvas/context.ts"
import { fileName, type SourcedElement, shortSource, sourcedElements } from "../canvas/element-sources.ts"
import { hoverElement, pickElement, setPicking, useInspecting } from "../canvas/inspect.ts"
import { kindColors, layerLabel, NodeIcon, nodeColor } from "../canvas/kinds.tsx"
import { projectLibrary } from "../canvas/layers.ts"
import { useComponents } from "../components-store.ts"
import { type ContainerEntry, useContainerEntries, useContainerEntry } from "../design-store.ts"
import { findFrames, findNodeElements, subscribeFrames } from "../frame.ts"
import { useSelection } from "../selection.ts"
import { request } from "../service.ts"
import type { ProjectSession } from "../workspace.ts"
import { openSource, viewCode } from "./code-editor.ts"
import { Hint } from "./Hint.tsx"
import { PanelSection } from "./PanelSection.tsx"

/** How many lines show around the picked element's line: before it, and after. */
const around = { before: 5, after: 12 }

type ComponentLayer = Extract<DesignNode, { type: "component" }>

/**
 * The Code tab (PAR-167, PAR-166): the code behind the selected layer. Every layer shows the JSX and Tailwind classes
 * Parity would write for it and the tokens it uses, with their values. A component layer also shows its component and
 * file, the elements it draws that the project's files wrote, each with its file and line, and the picked one's lines.
 * Inspect picks an element on the canvas instead, as a browser's developer tools do, selecting the layer it's in; it
 * works with nothing selected. A library's component says so, since its elements are written in the library.
 */
export function CodePanel() {
  const session = useProject()
  const { store, selection } = session
  const selected = useSelection(selection)
  const entry = useContainerEntry(store, selected.design)
  const entries = useContainerEntries(store)
  const label = (node: DesignNode) => layerLabel(node, entries, store.getComponentLibrary())
  const several = (selected.nodes?.length ?? 0) > 1 || (selected.designs?.length ?? 0) > 1
  const layer = entry && selected.node && !several ? selectedLayer(session, entry, selected.node) : undefined
  if (several) return <Nothing title="Select one layer">Each layer shows its own code.</Nothing>
  if (!layer || !entry || !selected.node) {
    return (
      <Nothing title="Select a layer">
        See the code Parity would write for it, or pick an element on the canvas to find the file and line it&apos;s
        written on.
      </Nothing>
    )
  }
  const { node, parent } = layer
  const code = <WrittenCode entry={entry} nodeId={selected.node} node={node} parent={parent} />
  if (node.type !== "component") {
    return (
      <>
        <LayerHeader node={node} name={label(node)} />
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">{code}</div>
      </>
    )
  }
  return (
    <ComponentCode entry={entry} nodeId={selected.node} node={node} name={label(node)}>
      {code}
    </ComponentCode>
  )
}

/**
 * The selected layer as the board shows it, whether it's the design's own or inside an instance, and the direction of
 * the layout it sits in, which decides what its sizes come to in code. A layer inside an instance, or in a component's
 * slot, has none.
 */
function selectedLayer(
  session: ProjectSession,
  entry: ContainerEntry,
  nodeId: string
): { node: DesignNode; parent?: "row" | "column" } | undefined {
  const { container } = entry
  if (!isInnerPath(nodeId)) {
    const located = locateNode(container.root, nodeId)
    if (!located) return undefined
    const above = located.ancestors.at(-1)
    return {
      node: located.node,
      ...(above?.type === "layout" ? { parent: above.style?.direction ?? "column" } : {})
    }
  }
  const state = editingState(container, session.selection.get().state)
  const library = projectLibrary(session.store)
  const shown = locateInner(container, nodeId, library, { state, variants: container.view?.variants })?.shown
  return shown && { node: shown }
}

/** A layer's name and kind above its code, with Inspect. */
function LayerHeader({ node, name }: { node: DesignNode; name: string }) {
  const { picking } = useInspecting()
  return (
    <div className="flex shrink-0 items-center gap-2 border-b py-2 pr-2 pl-4">
      <NodeIcon node={node} className="size-4 shrink-0" style={{ color: nodeColor(node) }} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      <InspectToggle pressed={picking} />
    </div>
  )
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
  name: layerName,
  children
}: {
  entry: ContainerEntry
  nodeId: string
  node: ComponentLayer
  /** The layer's name, as the Layers panel names it. */
  name: string
  /** Its code: the instance as JSX, and the tokens it uses. */
  children: ReactNode
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
      <LayerHeader node={node} name={layerName} />
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <PanelSection title="Component">
          <Item variant="outline" size="xs">
            <ItemMedia variant="icon">
              {source?.library ? <Package /> : <FileCode2 style={{ color: kindColors.component }} />}
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="font-mono text-xs">{name}</ItemTitle>
              <ItemDescription className="truncate font-mono text-[11px]">
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
                    onClick={() => void viewCode(session, node.component)}
                  >
                    <SquareArrowOutUpRight />
                  </Button>
                </Hint>
              </ItemActions>
            )}
          </Item>
          {source?.library && (
            <p className="mt-3 px-1 text-xs text-muted-foreground">
              {`${name} is written in ${source.path}, so its elements have no lines in the project.`}
            </p>
          )}
        </PanelSection>
        {children}
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

/**
 * The code Parity would write for the layer (PAR-166): its imports and JSX, its own Tailwind classes, and the tokens it
 * and what's inside it use, each with its value in the frame the selection was made in.
 */
function WrittenCode({
  entry,
  nodeId,
  node,
  parent
}: {
  entry: ContainerEntry
  nodeId: string
  node: DesignNode
  parent: "row" | "column" | undefined
}) {
  const session = useProject()
  const infos = useComponents(session.components)
  const entries = useContainerEntries(session.store)
  const { sources, libraries } = session.info
  const code = useMemo(() => {
    const component = (id: string): CodeComponent | undefined => {
      const source = sources[id]
      if (!source) return iconComponent(id, libraries)
      const from = infos[id]?.import ?? (source.library ? source.path : undefined)
      return { export: source.export, ...(from ? { import: from } : {}) }
    }
    const designName = (id: string) => entries.find((other) => other.container.id === id)?.container.name
    return layerCode(node, { component, designName, ...(parent ? { parent } : {}) })
  }, [node, parent, sources, libraries, infos, entries])
  const written = code.imports.length > 0 ? `${code.imports.join("\n")}\n\n${code.jsx}` : code.jsx
  return (
    <>
      <PanelSection title="JSX">
        <Snippet code={written} title={node.type === "component" ? "Instance" : "Layer"} copy="Copy as JSX" wrap />
      </PanelSection>
      {code.classes && (
        <PanelSection title="Classes">
          <Snippet code={code.classes} title="className" copy="Copy classes" wrap />
        </PanelSection>
      )}
      {code.tokens.length > 0 && (
        <PanelSection title="Tokens" count={code.tokens.length} description="Values in the frame you selected it in.">
          <TokenList entry={entry} nodeId={nodeId} tokens={code.tokens} />
        </PanelSection>
      )}
    </>
  )
}

/** Code Parity would write, coloured by Shiki, with a button that copies it. */
function Snippet({ code, title, copy, wrap }: { code: string; title: string; copy: string; wrap?: boolean }) {
  const lines = useHighlightedCode(code, "tsx")
  return (
    <CodeBlock size="sm">
      <CodeBlockHeader>
        <CodeBlockTitle className="font-mono">{title}</CodeBlockTitle>
        <CodeBlockActions>
          <Hint label={copy}>
            <CodeBlockCopyButton value={code} aria-label={copy} />
          </Hint>
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent wrap={wrap} className="max-h-80 overflow-y-auto text-[11px]">
        {lines.map((line, index) => (
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  )
}

/** The tokens the layer uses: each one's name, a swatch for a color, and its value in the frame. */
function TokenList({ entry, nodeId, tokens }: { entry: ContainerEntry; nodeId: string; tokens: LayerToken[] }) {
  const names = useMemo(() => tokens.map((token) => token.name), [tokens])
  const values = useTokenValues(entry, nodeId, names)
  return (
    <ul aria-label="Tokens it uses" className="flex flex-col">
      {tokens.map(({ name, keys }) => {
        const computed = values[name]
        const value = (computed && calcPixels(computed)) || computed || radiusKeywords[name]
        const color = value !== undefined && CSS.supports("color", value)
        return (
          <li key={name}>
            <Hint label={`Used for ${keys.map(styleKeyWords).join(", ")}`} wait>
              <div className="flex h-6 min-w-0 items-center gap-2 rounded-md px-1.5 font-mono text-xs hover:bg-accent">
                {color && (
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-sm ring-1 ring-border ring-inset"
                    style={{ background: value }}
                  />
                )}
                <span className="shrink-0">{`--${name}`}</span>
                <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">
                  {value ?? "Not set in this frame"}
                </span>
              </div>
            </Hint>
          </li>
        )
      })}
    </ul>
  )
}

/** A style key as the Design tab says it: `background` is "background", `minWidth` "min width". */
function styleKeyWords(key: string): string {
  return key.replaceAll(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)
}

/**
 * Each token's value as the frame the selection was made in shows it, or else the design's first frame: what its
 * custom property computes to on the layer's element, read again as the frame draws. Empty for one the frame doesn't
 * define.
 */
function useTokenValues(entry: ContainerEntry, nodeId: string, names: readonly string[]): Record<string, string> {
  const { selection } = useProject()
  const { mode, state } = useSelection(selection)
  const [values, setValues] = useState<Record<string, string>>({})
  useEffect(() => {
    const read = () => {
      const host = findFrames(document, entry.key, { mode, state })[0] ?? findFrames(document, entry.key)[0]
      const element = host && (findNodeElements(host, nodeId)[0] ?? host)
      const style = element && getComputedStyle(element)
      const next: Record<string, string> = {}
      for (const name of names) {
        const value = style?.getPropertyValue(`--${name}`).trim()
        if (value) next[name] = value
      }
      setValues((current) => (sameValues(current, next) ? current : next))
    }
    read()
    return subscribeFrames(read)
  }, [entry.key, nodeId, mode, state, names])
  return values
}

function sameValues(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
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
      <p className="px-1 text-xs text-muted-foreground">
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
              <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">
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
  const file = useProjectFile(session, source.path)
  const first = Math.max(1, source.line - around.before)
  const shown = typeof file === "string" ? file.split("\n").slice(first - 1, source.line + around.after) : []
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
              onClick={() => void openSource(session, source)}
            >
              <SquareArrowOutUpRight />
            </Button>
          </Hint>
        </CodeBlockActions>
      </CodeBlockHeader>
      {typeof file === "string" ? (
        <CodeBlockContent lineNumbers startLine={first} className="text-[11px]">
          {lines.map((line, index) => (
            <CodeBlockLine key={first + index} variant={first + index === source.line ? "highlighted" : "default"}>
              {line}
            </CodeBlockLine>
          ))}
        </CodeBlockContent>
      ) : (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {file instanceof Error ? file.message : `Reading ${fileName(source.path)}…`}
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
    let observer: MutationObserver | undefined
    let watched: Node | undefined
    const read = () => {
      const host = findFrames(document, entry.key, { mode, state })[0] ?? findFrames(document, entry.key)[0]
      const next = host ? sourcedElements(findNodeElements(host, nodeId)) : []
      setElements((current) => (sameElements(current, next) ? current : next))
      const root = host?.shadowRoot ?? undefined
      if (root && root !== watched) {
        observer?.disconnect()
        observer = new MutationObserver(read)
        observer.observe(root, { subtree: true, childList: true, attributeFilter: ["data-parity-source"] })
        watched = root
      }
    }
    read()
    const stop = subscribeFrames(read)
    return () => {
      stop()
      observer?.disconnect()
    }
  }, [entry.key, nodeId, mode, state])
  return elements
}

function sameElements(a: SourcedElement[], b: SourcedElement[]): boolean {
  return a.length === b.length && a.every((element, index) => element.element === b[index]?.element)
}

/**
 * A project file's text, an error saying why it couldn't be read, or undefined while it's read. It's read each time
 * the element or the tab changes, so an edit made in the editor shows.
 */
function useProjectFile(session: ProjectSession, path: string): string | Error | undefined {
  const key = `${session.id}\n${path}`
  const [read, setRead] = useState<{ key: string; file: string | Error }>()
  useEffect(() => {
    let cancelled = false
    request("code.read", { projectId: session.id, path }).then(
      ({ text }) => !cancelled && setRead({ key, file: text }),
      (error: unknown) =>
        !cancelled && setRead({ key, file: error instanceof Error ? error : new Error(String(error)) })
    )
    return () => {
      cancelled = true
    }
  }, [key, path, session.id])
  return read?.key === key ? read.file : undefined
}
