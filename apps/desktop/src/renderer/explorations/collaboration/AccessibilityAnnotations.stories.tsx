import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import {
  A11yPanel,
  A11yTag,
  A11yToolbar,
  type A11yKind,
  type A11yNote,
  a11yKindOrder,
  a11yKinds,
  Annotate,
  FocusStop,
  Key
} from "./a11y.tsx"
import { Board, InviteDialogDesign, type Marker, PricingDesign, Stage } from "./stage.tsx"

/**
 * Annotations for how a design should behave for keyboard and screen reader users: the intent automated checks can't
 * know. Parity renders the real components, so each annotation can be checked against the render, and agents read them
 * as part of the spec.
 */
const meta = {
  title: "Parity/Explorations/Collaboration/Accessibility annotations",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const examples: Record<A11yKind, ReactNode> = {
  focus: "3",
  heading: "H2",
  landmark: "navigation",
  name: 'button, "Close"',
  alt: "Decorative",
  keyboard: (
    <>
      <Key>Esc</Key> closes
    </>
  ),
  announce: "Politely: Saved",
  note: "Fades instead of sliding with reduced motion"
}

/** Each kind of annotation: what it's for, and how Parity checks it against the render. */
export const Kinds: Story = {
  render: () => (
    <Stage>
      <div className="grid w-fit grid-cols-2 gap-3">
        {a11yKindOrder.map((kind) => (
          <div key={kind} className="flex w-[22rem] flex-col gap-3 rounded-xl border border-white/10 p-4">
            <span>
              <A11yTag kind={kind}>{examples[kind]}</A11yTag>
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{a11yKinds[kind].title}</span>
              <span className="text-xs text-muted-foreground">{a11yKinds[kind].hint}</span>
              <span className="text-xs text-muted-foreground">{a11yKinds[kind].check}</span>
            </div>
          </div>
        ))}
      </div>
    </Stage>
  )
}

/** Picking a kind to place, like a stamp. Suggest has an agent draft annotations from the render for you to confirm. */
export const Toolbar: Story = {
  render: () => (
    <Stage className="flex flex-col gap-6">
      <A11yToolbar />
      <A11yToolbar active="name" />
      <A11yToolbar active="focus" />
    </Stage>
  )
}

const order: Record<string, number> = { email: 1, role: 2, cancel: 3, send: 4, close: 5 }

const focusOrder: Marker = (id, element) => {
  if (id in order) return <FocusStop n={order[id]!}>{element}</FocusStop>
  if (id === "dialog")
    return (
      <Annotate
        at="bottom-start"
        tags={[
          {
            kind: "keyboard",
            label: (
              <>
                <Key>Esc</Key> closes, focus returns to Invite
              </>
            )
          },
          { kind: "note", label: "Focus starts in Email addresses" }
        ]}
      >
        {element}
      </Annotate>
    )
  return element
}

/** The intended focus order through a dialog, numbered as Show tab order numbers the real one, with where focus goes. */
export const FocusOrder: Story = {
  render: () => (
    <Stage>
      <Board name="Invite teammates">
        <InviteDialogDesign mark={focusOrder} />
      </Board>
    </Stage>
  )
}

const structure: Marker = (id, element) => {
  switch (id) {
    case "header":
      return (
        <Annotate region tags={[{ kind: "landmark", label: "banner" }]}>
          {element}
        </Annotate>
      )
    case "logo-mark":
      return (
        <Annotate at="bottom-start" tags={[{ kind: "alt", label: "Decorative" }]}>
          {element}
        </Annotate>
      )
    case "nav":
      return (
        <Annotate at="bottom-start" tags={[{ kind: "landmark", label: 'navigation, "Main"' }]}>
          {element}
        </Annotate>
      )
    case "main":
      return (
        <Annotate region tags={[{ kind: "landmark", label: "main" }]}>
          {element}
        </Annotate>
      )
    case "h1":
      return <Annotate tags={[{ kind: "heading", label: "H1" }]}>{element}</Annotate>
    case "toggle":
      return (
        <Annotate
          at="end"
          tags={[
            { kind: "name", label: 'radio group, "Billing period"' },
            {
              kind: "keyboard",
              label: (
                <>
                  <Key>←</Key>
                  <Key>→</Key> switch
                </>
              )
            }
          ]}
        >
          {element}
        </Annotate>
      )
    case "plan-starter-name":
    case "plan-team-name":
    case "plan-scale-name":
      return (
        <Annotate at="end" className="w-fit" tags={[{ kind: "heading", label: "H2" }]}>
          {element}
        </Annotate>
      )
    case "footer":
      return (
        <Annotate region tags={[{ kind: "landmark", label: "contentinfo" }]}>
          {element}
        </Annotate>
      )
    default:
      return element
  }
}

/** A page's structure: its landmarks, its heading outline, a decorative image, and a control's name and keys. */
export const Structure: Story = {
  render: () => (
    <Stage>
      <Board name="Pricing" frame="Desktop">
        <PricingDesign mark={structure} />
      </Board>
    </Stage>
  )
}

const names: Marker = (id, element) => {
  switch (id) {
    case "dialog":
      return (
        <Annotate at="top-end" tags={[{ kind: "name", label: 'dialog, "Invite teammates"' }]}>
          {element}
        </Annotate>
      )
    case "title":
      return (
        <Annotate at="end" className="w-fit" tags={[{ kind: "heading", label: "H2" }]}>
          {element}
        </Annotate>
      )
    case "close":
      return (
        <Annotate at="bottom-end" tags={[{ kind: "name", label: 'button, "Close"' }]}>
          {element}
        </Annotate>
      )
    case "email":
      return (
        <Annotate
          at="end"
          tags={[
            { kind: "name", label: 'text field, "Email addresses"' },
            {
              kind: "keyboard",
              label: (
                <>
                  <Key>Enter</Key> adds, <Key>Backspace</Key> removes the last
                </>
              )
            }
          ]}
        >
          {element}
        </Annotate>
      )
    case "role":
      return (
        <Annotate at="end" tags={[{ kind: "name", label: 'combobox, "Role", Editor' }]}>
          {element}
        </Annotate>
      )
    case "status":
      return (
        <Annotate at="bottom-start" tags={[{ kind: "announce", label: "Politely: 2 invites ready to send" }]}>
          {element}
        </Annotate>
      )
    case "send":
      return (
        <Annotate at="bottom-end" tags={[{ kind: "name", label: 'button, "Send invites"' }]}>
          {element}
        </Annotate>
      )
    default:
      return element
  }
}

/** What a screen reader should say for each control, the keys a field takes, and what's announced as things change. */
export const NamesAndAnnouncements: Story = {
  render: () => (
    <Stage className="pt-20">
      <Board name="Invite teammates">
        <InviteDialogDesign mark={names} />
      </Board>
    </Stage>
  )
}

const rendered: Record<string, number> = { cancel: 4, send: 3 }

const checked: Marker = (id, element) => {
  if (id in order) {
    const stop = (
      <FocusStop n={order[id]!} rendered={rendered[id]}>
        {element}
      </FocusStop>
    )
    if (id === "close")
      return (
        <Annotate at="bottom-end" tags={[{ kind: "name", label: 'button, "Close"', status: "differs" }]}>
          {stop}
        </Annotate>
      )
    return stop
  }
  if (id === "title")
    return (
      <Annotate at="end" className="w-fit" tags={[{ kind: "heading", label: "H2", status: "matches" }]}>
        {element}
      </Annotate>
    )
  if (id === "status")
    return (
      <Annotate
        at="bottom-start"
        tags={[{ kind: "announce", label: "Politely: 2 invites ready to send", status: "differs" }]}
      >
        {element}
      </Annotate>
    )
  return element
}

const notes: A11yNote[] = [
  { kind: "focus", layer: "Email addresses", value: "1st", status: "matches" },
  { kind: "focus", layer: "Role", value: "2nd", status: "matches" },
  { kind: "focus", layer: "Cancel", value: "3rd", status: "differs", detail: "Tab visits it 4th, after Send invites" },
  { kind: "focus", layer: "Send invites", value: "4th", status: "differs", detail: "Tab visits it 3rd, before Cancel" },
  { kind: "focus", layer: "Close", value: "5th", status: "matches" },
  { kind: "heading", layer: "Title", value: "H2", status: "matches" },
  { kind: "name", layer: "Close", value: 'button, "Close"', status: "differs", detail: "An icon button with no name" },
  { kind: "name", layer: "Role", value: 'combobox, "Role", Editor', status: "matches" },
  {
    kind: "keyboard",
    layer: "Invite teammates",
    value: "Esc closes, focus returns to Invite",
    status: "unchecked",
    detail: "Not tried yet: ask an agent to"
  },
  {
    kind: "announce",
    layer: "Status",
    value: "Politely: 2 invites ready to send",
    status: "differs",
    detail: "No live region around it"
  },
  {
    kind: "note",
    layer: "Invite teammates",
    value: "Focus starts in Email addresses",
    status: "unchecked",
    detail: "Not checked"
  }
]

/**
 * Checked against the render: Cancel and Send invites are visited the other way round, Close has no name and the
 * status isn't a live region. The Accessibility tab lists them beside axe's issues and can hand them to an agent.
 */
export const CheckedAgainstTheRender: Story = {
  render: () => (
    <div className="flex h-screen bg-[#0c0c0f]">
      <Stage className="min-w-0 flex-1">
        <Board name="Invite teammates">
          <InviteDialogDesign mark={checked} />
        </Board>
      </Stage>
      <A11yPanel notes={notes} />
    </div>
  )
}
