import type { Meta, StoryObj } from "@storybook/react-vite"
import { LayerPreview, TextSection } from "./controls.tsx"
import type { Draft } from "./data.ts"
import { Playground, useDraft } from "./playground.tsx"
import { tagWrites } from "./writes.ts"

/**
 * A text layer's tag (PAR-186): the element its text is, Paragraph unless it's set, from headings 1 to 6, Label,
 * Inline text and Strong. It's what screen readers and search engines read the text as, so it changes the markup,
 * not the style.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Unique/Text tag",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Tag({ start }: { start: Draft }) {
  const [draft, set] = useDraft({ background: "card", radius: "radius-xl", gap: { number: 12 }, ...start })

  return (
    <Playground writes={tagWrites(draft.tag)} preview={<LayerPreview draft={draft} />}>
      <TextSection draft={draft} set={set} />
    </Playground>
  )
}

/** Unset: Paragraph, muted, written as `<p>`. */
export const Paragraph: Story = { render: () => <Tag start={{}} /> }

/** Heading 2, `<h2>`. */
export const Heading2: Story = { render: () => <Tag start={{ tag: "h2" }} /> }

/** Label, `<label>`. */
export const Label: Story = { render: () => <Tag start={{ tag: "label" }} /> }
