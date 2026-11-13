import { designStates, editNode, type NodeStyle } from "@parity-app/core"
import { layersSelection, type StyleSection } from "@parity-app/editor"
import type { Decorator } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { z } from "zod"
import { design, example, node } from "../stories/fixtures.tsx"
import { inspecting, SectionStage, SelectedStyles, slowly } from "./inspector-stories.tsx"

/*
 * What the style sections' stories share: one style section of the selected layer alone, at the inspector's width,
 * with styles set on the layer first.
 */

/** One style section of the selected layer, with the section it holds, as Size holds Spacing. */
export const renderStyleSection = (section: StyleSection) =>
  function Section() {
    return <SelectedStyles only={section} />
  }

/** The section alone, without the panel around it, at the width a story sets in `panelWidth`, or the inspector's. */
export const styleStage: Decorator = (Story, { parameters }) => {
  const width = z.number().safeParse(parameters.panelWidth)

  return (
    <SectionStage width={width.success ? width.data : undefined}>
      <Story />
    </SectionStage>
  )
}

/** Selects one layer of an example design, after setting styles on it in the base design, or in `state`, when given. */
export const styled = (designName: string, layerName: string, style?: NodeStyle, state?: string) =>
  inspecting("design", () => {
    const key = design(designName)
    const id = node(designName, layerName)

    if (style) {
      example().store.updateContainer(key, "Change style", (container) =>
        editNode(container, state ?? designStates(container)[0]!.id, id, { style })
      )
    }

    return layersSelection(key, [id], state ? { state } : undefined)
  })

/** Opens the picker a button names, which is labelled as the button is. A color's swatch and its end both open it. */
export async function opens(canvasElement: HTMLElement, name: string) {
  await userEvent.click(within(canvasElement).getAllByRole("button", { name })[0]!)
  await within(document.body).findByRole("dialog", { name }, slowly)
}

/** Shows `value` whole in a field, not clipped by the field's width. */
export async function expectWhole(canvasElement: HTMLElement, name: string, value: string) {
  const field = within(canvasElement).getByRole<HTMLInputElement>("textbox", { name })
  await expect(field).toHaveValue(value)
  await expect(field.scrollWidth).toBeLessThanOrEqual(field.clientWidth)
}
