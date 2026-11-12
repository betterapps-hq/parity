import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { bindText, findNode, propFromText, textProps } from "@parity-app/core"
import { Link2, Plus, X } from "lucide-react"
import type { ReactNode } from "react"
import { useProject } from "../canvas/context.ts"
import { kindColors } from "../canvas/kinds.tsx"
import type { ContainerEntry } from "../design-store.ts"
import { Hint } from "./Hint.tsx"
import { updateAndRecord } from "./inspector-events.ts"
import { revealSelection } from "./reveal.ts"

const propColor = kindColors.component

/**
 * The text of a component design's own text layer, which can use one of the component's text props. Using a prop, it's
 * the prop's name, which goes to it in the component's Props, with an × inside to go back to text of its own.
 * Otherwise it's `children`, the text field itself, with a button beside it to use a prop or make one from the text.
 */
export function TextWithProp({
  entry,
  nodeId,
  bound,
  children
}: {
  entry: ContainerEntry
  nodeId: string
  /** The prop the text uses now. */
  bound: string | undefined
  children: ReactNode
}) {
  const session = useProject()
  const { store } = session
  const { key, container } = entry

  // Each change records the prop the field uses, before and after (PAR-713).
  const update = (label: string, change: Parameters<typeof store.updateContainer>[2]) =>
    updateAndRecord(store, key, label, change, {
      field: "bind.text",
      layers: [nodeId],
      read: (current) => findNode(current.root, nodeId)?.bind?.text
    })

  if (bound !== undefined) {
    return (
      <div className="group relative min-w-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full min-w-0 justify-start gap-1.5 px-2 pr-7 text-xs font-normal"
          aria-label={`Uses the ${bound} prop. Go to it in ${container.name}'s props`}
          onClick={() => {
            session.selection.set({ design: key })
            revealSelection(session)
          }}
        >
          <Link2 className="size-3.5 shrink-0" style={{ color: propColor }} />
          <span className="truncate font-mono" style={{ color: propColor }}>
            {bound}
          </span>
        </Button>
        <Hint label={`Stop using ${bound}, keeping what it shows`}>
          <button
            type="button"
            aria-label={`Stop using ${bound}, keeping what it shows`}
            className="absolute top-1/2 right-1 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-accent hover:text-foreground"
            onClick={() => update(`Stop using ${bound}`, (current) => bindText(current, nodeId, undefined))}
          >
            <X className="size-3" />
          </button>
        </Hint>
      </div>
    )
  }

  const props = textProps(container)

  return (
    <div className="flex min-w-0 items-start gap-1">
      <div className="min-w-0 flex-1">{children}</div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Hint label="Use a prop for this text">
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground"
                aria-label="Use a prop for this text"
              >
                <Link2 />
              </Button>
            </Hint>
          }
        />
        <DropdownMenuContent align="end" className="w-60">
          {props.length > 0 && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Use a prop</DropdownMenuLabel>
                {props.map((name) => (
                  <DropdownMenuItem
                    key={name}
                    className="font-mono"
                    onClick={() => update(`Use ${name}`, (current) => bindText(current, nodeId, name))}
                  >
                    {name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => update("Make prop", (current) => propFromText(current, nodeId).container)}>
            <Plus /> New prop from this text
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
