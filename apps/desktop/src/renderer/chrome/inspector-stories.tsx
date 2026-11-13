import { type Selection, type StyleSection } from "@parity-app/editor"
import type { ReactNode } from "react"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import { type ContainerEntry } from "../design-store.ts"
import { example, openProjects, type ProjectName, ProjectStage } from "../stories/fixtures.tsx"
import { setLayout } from "./layout.ts"
import { useSelectedLayer } from "./selected-layer.ts"
import { useStyleEditor } from "./style-editor.ts"
import { StyleSections } from "./StyleSections.tsx"

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

    if (selection) {
      example().selection.set(selection)
    }
  }
}

/**
 * The selected layer's style sections, as the layer panel shows them, edited in the state and variant shown: every one,
 * or `only` that one alone.
 */
export function SelectedStyles({ only }: { only?: StyleSection }) {
  const layer = useSelectedLayer()

  if (!layer) {
    return null
  }

  return <LayerStyles key={layer.nodeId} entry={layer.entry} nodeId={layer.nodeId} only={only} />
}

function LayerStyles({ entry, nodeId, only }: { entry: ContainerEntry; nodeId: string; only?: StyleSection }) {
  const editor = useStyleEditor(entry, [nodeId])

  return editor ? <StyleSections editor={editor} container={entry.container} only={only} /> : null
}

/** Types as a person would, a key at a time. */
export const typing = { delay: 40 }

/**
 * Searches a searchable list (cmdk) for `text`. Typed keys reach its input but not always its filter in a story, so
 * the text arrives as one input event, as pasting it would.
 */
export async function search(input: HTMLElement, text: string): Promise<void> {
  await userEvent.click(input)
  await fireEvent.input(input, { target: { value: text } })
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
