import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { ContentSection, LayerPreview } from "./controls.tsx"
import { Playground } from "./playground.tsx"
import { tagWrites } from "./writes.ts"

/**
 * Content, a text layer's own section, shown only for a text layer: its words, which wrap and grow in the field, and its
 * tag, the element the text is, Paragraph unless it's set, from headings 1 to 6, Label, Inline text and Strong. The tag
 * is what screen readers and search engines read the text as, so it changes the markup, not the style.
 */
const meta = {
  title: "Parity/Inspector/Sections/Content/Text",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Content({ start, words = "Simple pricing for every team" }: { start?: string; words?: string }) {
  const [text, setText] = useState(words)
  const [tag, setTag] = useState(start)

  return (
    <Playground
      writes={tagWrites(tag, text)}
      preview={<LayerPreview draft={{ background: "card", radius: "radius-xl", gap: { number: 12 }, tag }} />}
    >
      <ContentSection text={text} tag={tag} onText={setText} onTag={setTag} />
    </Playground>
  )
}

/** Unset: Paragraph, muted, written as `<p>`. */
export const Paragraph: Story = { render: () => <Content /> }

/** Paragraph, with what the control stores and writes as CSS and Tailwind beside it, updated as it's used. */
export const Demo: Story = { ...Paragraph, parameters: { demo: true } }

/** Heading 2, `<h2>`. */
export const Heading2: Story = { render: () => <Content start="h2" /> }

/** Words longer than a line: they wrap, and the field grows with them. */
export const LongText: Story = {
  render: () => (
    <Content words="Every plan includes unlimited projects, version history and priority support from our team" />
  )
}
