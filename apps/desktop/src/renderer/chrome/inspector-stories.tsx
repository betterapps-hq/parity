import {
  editNode,
  isBaseState,
  locateNode,
  type NodeChange,
  nodeInState,
  type NodeStyle,
  resetOverride
} from "@parity/core"
import type { ReactNode } from "react"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import { useProject } from "../canvas/context.ts"
import { useComponents } from "../components-store.ts"
import { useContainerEntry } from "../design-store.ts"
import { type Selection, useSelection } from "../selection.ts"
import { example, openProjects, type ProjectName, ProjectStage } from "../stories/fixtures.tsx"
import { spacingUnit, useTokenList } from "../tokens-store.ts"
import { editingState } from "./LayerPanel.tsx"
import { setLayout } from "./layout.ts"
import { PropsSection } from "./PropsSection.tsx"
import { type StyleEditor, StyleSections, styleValues } from "./StyleSections.tsx"

/*
 * What the inspector's stories share: a stage that puts the panel where the app does, loaders that open the example
 * with something selected, and the selected layer's props and styles on their own, wired to the design as the layer
 * panel wires them.
 */

/** The active project's providers, with the inspector's content at the right edge where the canvas would end. */
export function InspectorStage({ children }: { children: ReactNode }) {
  return <ProjectStage className="flex h-screen justify-end bg-background text-foreground">{children}</ProjectStage>
}

/** One section of the panel on its own, as wide and scrolling as the inspector's content. */
export function PanelColumn({ children, width = 320 }: { children: ReactNode; width?: number }) {
  return (
    <aside className="flex min-h-0 shrink-0 flex-col overflow-x-hidden overflow-y-auto border-l" style={{ width }}>
      {children}
    </aside>
  )
}

/**
 * Opens projects fresh, the first active, with the inspector on a tab. `answer` can set how the service answers while
 * they open, with `answerNext`.
 */
export async function openInspector(
  rightTab = "design",
  names: ProjectName[] = ["example"],
  answer?: () => void
): Promise<void> {
  answer?.()
  await openProjects(...names)
  setLayout({ rightTab })
}

/** A loader: the example open on an inspector tab, after `prepare` changed the design or selected something in it. */
export function inspecting(rightTab: string, prepare?: () => Selection | void): () => Promise<void> {
  return async () => {
    await openInspector(rightTab)
    const selection = prepare?.()
    if (selection) example().selection.set(selection)
  }
}

/** The selected layer in the state being edited, with the edits the layer panel makes to it. */
function useSelectedLayer() {
  const session = useProject()
  const { store, selection } = session
  const selected = useSelection(selection)
  const entry = useContainerEntry(store, selected.design)
  const components = useComponents(session.components)
  const tokens = useTokenList(session.tokens)
  const nodeId = selected.node
  const location = entry && nodeId ? locateNode(entry.container.root, nodeId) : undefined
  if (!entry || !nodeId || !location) return undefined
  const { container, key } = entry
  const state = editingState(container, selected.state)
  const override = isBaseState(container, state.id) ? undefined : state.overrides?.[nodeId]
  const change = (label: string, value: NodeChange, field: string) =>
    store.updateContainer(key, label, (current) => editNode(current, state.id, nodeId, value), {
      group: `edit:${nodeId}:${field}`
    })
  const reset = (field: Parameters<typeof resetOverride>[3]) =>
    store.updateContainer(key, "Reset change", (current) => resetOverride(current, state.id, nodeId, field))
  const node = nodeInState(location.node, state)
  const parent = location.ancestors.at(-1)
  const parentStyle = parent?.type === "layout" ? (nodeInState(parent, state).style ?? {}) : undefined
  const editor: StyleEditor = {
    style: node.style ?? {},
    changed: (name) => override?.style?.[name] !== undefined,
    reset: (name) => reset({ kind: "style", key: name }),
    set: (edit, label = "Change style") => {
      const values = styleValues(edit, node.style ?? {}) as NodeStyle
      change(label, { style: values }, `style.${Object.keys(values).join(",")}`)
    },
    tokens,
    unit: spacingUnit(tokens),
    measure: () => undefined
  }
  return {
    node,
    components,
    override,
    change,
    reset,
    editor,
    parent: parentStyle
      ? { direction: parentStyle.direction ?? "column", grid: parentStyle.display === "grid" }
      : undefined
  }
}

/** The selected component layer's props section, as the layer panel shows it. */
export function SelectedProps() {
  const layer = useSelectedLayer()
  if (layer?.node.type !== "component") return null
  const { node, components, override, change, reset } = layer
  return (
    <PropsSection
      node={node}
      info={components[node.component]}
      changed={(name) => override?.props?.[name] !== undefined}
      onChange={(name, value) => change(`Change ${name}`, { props: { [name]: value } }, `props.${name}`)}
      onReset={(name) => reset({ kind: "props", key: name })}
    />
  )
}

/** The selected layer's style sections, as the layer panel shows them. */
export function SelectedStyles() {
  const layer = useSelectedLayer()
  if (!layer) return null
  return <StyleSections editor={layer.editor} node={layer.node} parent={layer.parent} />
}

/** Types as a person would, a key at a time. */
export const typing = { delay: 40 }

/**
 * Searches a searchable list (cmdk) for `text`. Typed keys reach its input but not always its filter in a story, so
 * the text arrives as one input event, as pasting it would.
 */
export async function search(input: HTMLElement, text: string): Promise<void> {
  await userEvent.click(input)
  fireEvent.input(input, { target: { value: text } })
  await waitFor(() => expect(input).toHaveValue(text))
}

/**
 * In the Accessibility tab: waits for the check that runs when it opens, then checks again with the service answering
 * as `answer` sets, and waits for `text`. Checking again keeps a story the same however the design was checked before:
 * checks outlive the project, so an earlier story's check of the design would show as out of date.
 */
export async function checkAgain(
  canvasElement: HTMLElement,
  text: string | RegExp,
  answer?: () => void
): Promise<void> {
  const panel = within(canvasElement)
  // The refresh button is named Checking while a check runs, and comes first when the out-of-date note shows too.
  const [again] = await panel.findAllByRole("button", { name: "Check again" }, slowly)
  answer?.()
  await userEvent.click(again!)
  await panel.findAllByText(text, undefined, slowly)
}

/** Waits for something a story's play function needs, longer than testing-library's default second. */
export const slowly = { timeout: 8000 }
