import { Kbd } from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Component } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { expect, userEvent, within } from "storybook/test"
import type { PreviewImage } from "../../shared/protocol.ts"
import { kindColors } from "../canvas/kinds.tsx"
import type { PreviewState } from "../component-previews.ts"
import { projectInfo, roots } from "../stories/host.ts"
import accordion from "../stories/previews/accordion.png?inline"
import attachmentGroup from "../stories/previews/attachment-group.png?inline"
import button from "../stories/previews/button.png?inline"
import calendar from "../stories/previews/calendar.png?inline"
import inputGroupText from "../stories/previews/input-group-text.png?inline"
import kitButtonDestructive from "../stories/previews/kit-button-destructive.webp?inline"
import kitButtonGhost from "../stories/previews/kit-button-ghost.webp?inline"
import kitButtonLink from "../stories/previews/kit-button-link.webp?inline"
import kitButtonOutline from "../stories/previews/kit-button-outline.webp?inline"
import kitButtonSecondary from "../stories/previews/kit-button-secondary.webp?inline"
import kitButton from "../stories/previews/kit-button.webp?inline"
import select from "../stories/previews/select.png?inline"
import { type CardVariant, ComponentCard, type ComponentCardProps, ComponentPopover } from "./ComponentCard.tsx"
import { Hint } from "./Hint.tsx"
import { useHoverCard } from "./hover-card.ts"
import { formatKeys } from "./keys.ts"
import { Name } from "./Name.tsx"

/** The example project's Storybook logo, as its adapter offers Open in Storybook with it. */
const storybookLogo = projectInfo(roots.example).actions.find((action) => action.adapter === "storybook")?.icon

/**
 * A component's card in the Assets panel: its preview, large, with its name, file and what to do with it. It opens
 * beside the row as a token's card does, in a popover a step up from the panel, never in a tooltip. The pictures here
 * are real previews of examples/shadcn-vite, as the offscreen renderer made them (PAR-207, PAR-515).
 */
const meta = {
  title: "Parity/Left panel/Component card",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** A kept preview's pictures, sized as the store gives them. */
const picture = (src: string, width: number, height: number): PreviewImage => ({
  thumb: src,
  large: src,
  width,
  height
})

const pictures = {
  inputGroupText: picture(inputGroupText, 134, 104),
  button: picture(button, 339, 88),
  select: picture(select, 346, 96),
  accordion: picture(accordion, 518, 348),
  calendar: picture(calendar, 291, 352),
  attachmentGroup: picture(attachmentGroup, 608, 285)
}

const made = (image: PreviewImage): PreviewState => ({ state: "made", image })

const cards: (ComponentCardProps & { label: string })[] = [
  {
    label: "Small",
    name: "nova/InputGroupText",
    path: "src/components/nova/input-group.tsx",
    preview: made(pictures.inputGroupText)
  },
  {
    label: "Wide and short",
    name: "nova/Select",
    path: "src/components/nova/select.tsx",
    preview: made(pictures.select)
  },
  {
    label: "Tall",
    name: "nova/Calendar",
    path: "src/components/nova/calendar.tsx",
    preview: made(pictures.calendar)
  },
  {
    label: "Larger than the card",
    name: "nova/Accordion",
    path: "src/components/nova/accordion.tsx",
    preview: made(pictures.accordion)
  },
  {
    label: "The project's own",
    name: "Button",
    path: "src/components/ui/button.tsx",
    preview: made(pictures.button)
  },
  {
    label: "A library instance",
    name: "nova/AttachmentGroup",
    instance: true,
    preview: made(pictures.attachmentGroup),
    actions: "Right-click to insert a detached copy."
  }
]

/** Where a card sits: the panel's own background, as the Assets panel is. */
function Stage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`min-h-screen bg-background p-6 text-foreground ${className}`}>{children}</div>
}

/** A card as it is inside its popover, without opening one. */
function Surface({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
      <div className="w-80 rounded-lg bg-popover text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
        {children}
      </div>
    </figure>
  )
}

/**
 * Made previews of different shapes. Each sits on the project's page as it was drawn, framed, in a box of one height,
 * so cards are the same size as the pointer moves down the list; one larger than the box is scaled to fit.
 */
export const Pictures: Story = {
  render: () => (
    <Stage className="flex flex-wrap items-start gap-6">
      {cards.map(({ label, ...card }) => (
        <Surface key={label} label={label}>
          <ComponentCard {...card} />
        </Surface>
      ))}
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("InputGroupText")).toBeInTheDocument()
    await expect(within(canvasElement).getAllByText("nova").length).toBeGreaterThan(0)
  }
}

/**
 * Everything else a preview can be: waiting its turn, being drawn, updating after its code changed (the last picture,
 * dimmed), drawing nothing of its own (PAR-517), failing to draw, and why: it needs props its sample doesn't give, a
 * provider around it, or a server (PAR-208). Only a made picture sits on the project's page.
 */
export const States: Story = {
  render: () => (
    <Stage className="flex flex-wrap items-start gap-6">
      <Surface label="Waiting its turn">
        <ComponentCard name="nova/Tabs" path="src/components/nova/tabs.tsx" preview={{ state: "waiting" }} />
      </Surface>
      <Surface label="Being drawn">
        <ComponentCard name="nova/Tabs" path="src/components/nova/tabs.tsx" preview={{ state: "making" }} />
      </Surface>
      <Surface label="Updating">
        <ComponentCard
          name="nova/Select"
          path="src/components/nova/select.tsx"
          preview={{ state: "making", last: pictures.select }}
        />
      </Surface>
      <Surface label="Draws nothing of its own">
        <ComponentCard name="nova/MessageGroup" path="src/components/nova/message.tsx" preview={{ state: "empty" }} />
      </Surface>
      <Surface label="Fails to draw">
        <ComponentCard
          name="Chart"
          path="src/components/chart.tsx"
          preview={{ state: "failed", error: "Maximum update depth exceeded." }}
        />
      </Surface>
      <Surface label="Needs props">
        <ComponentCard
          name="DataTable"
          path="src/components/data-table.tsx"
          preview={{ state: "failed", error: "Cannot read properties of undefined (reading 'map')" }}
          missing={["columns", "rows"]}
        />
      </Surface>
      <Surface label="Needs a provider">
        <ComponentCard
          name="AvatarFallback"
          path="src/components/ui/avatar.tsx"
          preview={{ state: "failed", error: "AvatarFallback: `AvatarFallback` must be used within `Avatar`" }}
        />
      </Surface>
      <Surface label="Only renders on a server">
        <ComponentCard
          name="InvoicePdf"
          path="src/components/invoice-pdf.tsx"
          preview={{ state: "failed", error: "process is not defined" }}
        />
      </Surface>
      <Surface label="Fails on the canvas too">
        <ComponentCard
          name="nova/SidebarMenuItem"
          path="src/components/nova/sidebar.tsx"
          preview={{ state: "failed", error: "useSidebar must be used within a SidebarProvider." }}
          status="Fails to draw on the canvas: useSidebar must be used within a SidebarProvider."
        />
      </Surface>
    </Stage>
  )
}

const variant = (value: string, src: string): CardVariant => ({ value, preview: made(picture(src, 164, 96)) })

/**
 * Everything a card can show (PAR-208): the large picture, then the component's variants, made when the card first
 * opens, where pointing at one shows it large; its file; how often the designs use it and its stories; and Insert,
 * Open file and Open in Storybook. In the insert picker Enter inserts, so the card there has no Insert.
 */
export const VariantsAndActions: Story = {
  render: () => (
    <Stage className="flex flex-wrap items-start gap-6">
      <Surface label="In the Components panel">
        <ComponentCard
          name="Button"
          path="src/components/ui/button.tsx"
          preview={made(picture(kitButton, 164, 96))}
          variants={{
            prop: "variant",
            options: [
              variant("default", kitButton),
              variant("outline", kitButtonOutline),
              variant("secondary", kitButtonSecondary),
              variant("ghost", kitButtonGhost),
              variant("destructive", kitButtonDestructive),
              variant("link", kitButtonLink)
            ]
          }}
          uses={153}
          stories={1}
          onInsert={() => undefined}
          onOpenFile={() => undefined}
          offers={[{ id: "storybook:open", name: "Open in Storybook", logo: storybookLogo, run: () => undefined }]}
        />
      </Surface>
      <Surface label="Variants still being made">
        <ComponentCard
          name="Button"
          path="src/components/ui/button.tsx"
          preview={made(picture(kitButton, 164, 96))}
          variants={{
            prop: "variant",
            options: [
              variant("default", kitButton),
              { value: "outline", preview: { state: "making" } },
              { value: "secondary", preview: { state: "waiting" } }
            ]
          }}
          uses={0}
          onOpenFile={() => undefined}
        />
      </Surface>
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getAllByRole("figure")[0]!
    await expect(within(card).getByText("Used 153 times")).toBeInTheDocument()
    await expect(within(card).getByRole("button", { name: "Open in Storybook" })).toBeInTheDocument()
    await userEvent.hover(within(card).getByRole("button", { name: "variant destructive" }))
    await expect(within(card).getByRole("button", { name: "variant destructive" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  }
}

/** A row of the Assets panel's component list, as it is today. */
function Row({
  name,
  card,
  ...anchor
}: { name: string; card?: ReturnType<typeof useHoverCard> } & ComponentProps<"button">) {
  return (
    <button
      {...anchor}
      type="button"
      aria-expanded={card?.open}
      onPointerEnter={card?.enter}
      onPointerLeave={card?.leave}
      className="flex h-7 w-full cursor-grab items-center gap-2 rounded-md pr-8 pl-8 text-left text-sm hover:bg-accent aria-expanded:bg-accent"
    >
      <Component className="size-3.5 shrink-0" style={{ color: kindColors.component }} />
      <Name>{name}</Name>
    </button>
  )
}

function OpenRow({ name, ...props }: ComponentCardProps) {
  const card = useHoverCard(true)

  return (
    <ComponentPopover {...props} name={name} card={card}>
      <Row name={name.slice(name.lastIndexOf("/") + 1)} card={card} />
    </ComponentPopover>
  )
}

/**
 * The card beside its row, as resting the pointer there opens it: to the right of the panel, aligned to the row's top,
 * at a token card's width and gap. The panel is the app's background; the card is a step lighter, with an edge.
 */
export const BesideItsRow: Story = {
  render: () => (
    <Stage className="p-0">
      <div className="flex h-screen">
        <div className="flex w-64 flex-col border-r bg-background py-2">
          <div className="px-8 pt-1 text-2xs text-muted-foreground">
            <Name className="block">input-group</Name>
          </div>
          {["InputGroup", "InputGroupAddon", "InputGroupButton", "InputGroupInput"].map((name) => (
            <Row key={name} name={name} />
          ))}
          <OpenRow
            name="nova/InputGroupText"
            path="src/components/nova/input-group.tsx"
            preview={made(pictures.inputGroupText)}
          />
          <Row name="InputGroupTextarea" />
          <div className="px-8 pt-1 text-2xs text-muted-foreground">
            <Name className="block">input-otp</Name>
          </div>
          <Row name="InputOTP" />
        </div>
        <div className="flex-1 bg-muted/40" />
      </div>
    </Stage>
  ),
  play: async () => {
    const card = await within(document.body).findByRole("dialog")
    await expect(within(card).getByText("src/components/nova/input-group.tsx")).toBeInTheDocument()
  }
}

const hints = [
  { label: "Frame", keys: "F" },
  { label: "Open in Storybook" },
  { label: "nova/InputGroupText", detail: "src/components/nova/input-group.tsx" }
]

/**
 * Tooltips as the app's hints draw them: shadcn's tooltip, unchanged, reading raised colors from the stylesheet rather
 * than the theme's inverted ones, so in the dark theme it's a step lighter than a popover and in the light theme white
 * with an edge. The edge and shadow go round the box and its pointer as one shape.
 */
export const Tooltips: Story = {
  render: () => (
    <Stage className="flex flex-col gap-6">
      {hints.map(({ label, detail, keys }) => (
        <div key={label} className="flex h-10 items-center">
          <Hint
            open
            side="right"
            label={
              <span className="flex items-center gap-1.5">
                {label}
                {keys && <Kbd>{formatKeys(keys)}</Kbd>}
              </span>
            }
            detail={detail}
          >
            <span className="rounded-md border px-2 py-1 text-xs">Hover</span>
          </Hint>
        </div>
      ))}
    </Stage>
  )
}
