import { orderedStates, shownStates, withShownStates, withStateOrder } from "@parity-app/core"
import { ShowList } from "../chrome/ShowList.tsx"
import { ModeViewportIcon } from "../chrome/viewports.tsx"
import { type ContainerEntry, useModeSettings } from "../design-store.ts"
import { moved } from "../inspector/controls/list-parts.tsx"
import { useSelection } from "../selection.ts"
import { useProject } from "./context.ts"
import { storyScreensFile } from "./story-screens.ts"
import { containerModes, withModes } from "./view.ts"

/** What a design's states are called: a Storybook file's are its stories. */
export function stateNouns(entry: Pick<ContainerEntry, "path">): { one: string; many: string } {
  return entry.path === storyScreensFile ? { one: "story", many: "stories" } : { one: "state", many: "states" }
}

/**
 * A design's modes in its own order, as its Modes section and its board's modes menu list them: each one's switch
 * shows it, and the first shown is drawn at full size, the rest beside it (PAR-1071).
 */
export function ModesList({ entry, group }: { entry: ContainerEntry; group: string }) {
  const { store, selection } = useProject()
  const settings = useModeSettings(store)
  const selected = useSelection(selection)
  const { container, key } = entry
  const { all, ordered, primary, companions } = containerModes(settings, container)
  const order = ordered.map((mode) => mode.id)
  const shown = new Set([primary.id, ...companions.map((mode) => mode.id)])

  return (
    <ShowList
      group={group}
      entries={ordered.map((mode) => ({
        id: mode.id,
        name: mode.name,
        icon: <ModeViewportIcon of={mode} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />,
        chips: [`${mode.width}px`, ...mode.options.slice(1).map(({ option }) => option.name)]
      }))}
      shown={shown}
      selected={selected.design === key && selected.node === undefined ? selected.mode : undefined}
      only="At least one mode always shows"
      onMove={(from, to) =>
        store.updateView(key, `Move ${ordered[from]!.name}`, (view) =>
          withModes(view, moved(order, from, to), [...shown], all)
        )
      }
      onShow={(id, on) => {
        const name = ordered.find((mode) => mode.id === id)?.name ?? id
        const next = on ? [...shown, id] : [...shown].filter((each) => each !== id)

        store.updateView(key, `${on ? "Show" : "Hide"} ${name}`, (view) => withModes(view, order, next, all))
      }}
    />
  )
}

/**
 * A design's states in its own order, as its board's menu lists them: a Storybook file's stories, as many as it has,
 * each shown as a row or not by its switch and put in order as modes are (PAR-1071).
 */
export function StatesList({ entry, group }: { entry: ContainerEntry; group: string }) {
  const { store } = useProject()
  const { container, key } = entry
  const ordered = orderedStates(container)
  const shown = new Set(shownStates(container).map((state) => state.id))

  return (
    <ShowList
      group={group}
      entries={ordered.map((state) => ({ id: state.id, name: state.name }))}
      shown={shown}
      only={`At least one ${stateNouns(entry).one} always shows`}
      onMove={(from, to) =>
        store.updateView(key, `Move ${ordered[from]!.name}`, (view) =>
          withStateOrder(
            view,
            container,
            moved(
              ordered.map((state) => state.id),
              from,
              to
            )
          )
        )
      }
      onShow={(id, on) => {
        const name = ordered.find((state) => state.id === id)?.name ?? id
        const next = on ? [...shown, id] : [...shown].filter((each) => each !== id)

        store.updateView(key, `${on ? "Show" : "Hide"} ${name}`, (view) => withShownStates(view, container, next))
      }}
    />
  )
}
