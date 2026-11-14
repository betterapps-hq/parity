import type { AdapterStatusItem } from "@parity-app/core"
import { Blocks, CircleX, Palette, SquareTerminal, TriangleAlert } from "lucide-react"
import { DynamicIcon, type IconName, iconNames } from "lucide-react/dynamic"
import type { ReactNode } from "react"
import type { ProjectInfo } from "../../shared/protocol.ts"
import { useProject } from "../canvas/context.ts"
import { tally, useConsole } from "../console-store.ts"
import { type DesignStore, useSaveState } from "../design-store.ts"
import { useTokenList } from "../tokens-store.ts"
import { actions } from "./actions.ts"
import { projectAction, runAction } from "./adapter-actions.ts"
import { AdapterLogo } from "./AdapterLogo.tsx"
import { Hint } from "./Hint.tsx"
import { setLayout, useLayout } from "./layout.ts"
import { PerformanceStats } from "./PerformanceStats.tsx"
import { usePreferences } from "./preferences.ts"
import { Processes } from "./Processes.tsx"

/**
 * How the project was understood, with nothing configured by hand: an item for each of the project's tools, as its
 * adapter tells it, then the components and tokens Parity found. Each count opens what lists it.
 */
export function StatusBar() {
  const session = useProject()
  const { info, store, tokens: tokenStore } = session
  const tokens = useTokenList(tokenStore)
  const semantic = tokens.filter((token) => token.source === "semantic").length
  const { performanceStats } = usePreferences()
  const openTab = (tab: string) => setLayout({ left: true, leftTab: tab })

  // What an adapter's item does: open a left panel tab, or run one of its adapter's actions.
  const open = (item: AdapterStatusItem) => {
    const action =
      item.opens && "action" in item.opens ? projectAction(info, item.adapter, item.opens.action) : undefined

    if (item.opens && "tab" in item.opens) {
      openTab(item.opens.tab)
    } else if (action) {
      void runAction(session.id, action)
    }
  }

  const themed = tokens.length - semantic

  return (
    <footer className="@container/footer flex h-7 shrink-0 items-center gap-1 border-t bg-background px-1.5 text-xs text-muted-foreground">
      {info.status.map((item) => (
        <Item
          key={`${item.adapter}:${item.icon}:${item.hint}`}
          icon={<ItemIcon item={item} />}
          hint={item.hint}
          detail={item.detail}
          onClick={item.opens && (() => open(item))}
        >
          <strong className="font-medium text-foreground">{item.value}</strong>
          {item.words && <Words>{item.words}</Words>}
        </Item>
      ))}
      <Item
        icon={<Blocks className="size-3.5" />}
        hint={plural(info.componentCount, "component")}
        detail={`${componentOrigins(info)}. Click to show them`}
        onClick={() => openTab("components")}
      >
        <strong className="font-medium text-foreground">{info.componentCount}</strong>
        <Words> {noun(info.componentCount, "component")}</Words>
      </Item>
      <Item
        icon={<Palette className="size-3.5" />}
        hint={plural(tokens.length, "token")}
        detail={info.styles ? `${semantic} from the project, ${themed} from ${info.styles.name}` : "Click to show them"}
        onClick={() => openTab("tokens")}
      >
        <strong className="font-medium text-foreground">{tokens.length}</strong>
        <Words> tokens</Words>
      </Item>
      <span className="min-w-0 flex-1" />
      <ConsoleStatus projectId={session.id} />
      <SaveFailure store={store} />
      <Processes />
      {performanceStats && <PerformanceStats />}
    </footer>
  )
}

/*
 * Every item's tooltip has the same shape: a short title, the item's name and version or its count, then one short line
 * saying what it does or what clicking it does. The project's tools each give their own items, through their adapters
 * (`StatusItem`); the components and tokens are Parity's own. Paths, discovery notes and errors stay out, since they can run long; the
 * Components panel, a notification or an agent's tools give them.
 */

/**
 * An adapter's item's icon: the Lucide icon it names, or a plain one for a name Lucide doesn't have, else its adapter's
 * logo, filled with the text's colour.
 */
function ItemIcon({ item }: { item: AdapterStatusItem }) {
  if (!item.icon && item.logo) {
    return <AdapterLogo logo={item.logo} className="size-3.5" />
  }

  return <DynamicIcon name={iconName(item.icon)} className="size-3.5" />
}

function iconName(name: string | undefined): IconName {
  return iconNames.find((each) => each === name) ?? "circle"
}

/** Where the components come from: how many are the app's own, then how many each library gives, as "120 from the app". */
function componentOrigins(info: ProjectInfo): string {
  const counts = new Map<string | undefined, number>()

  for (const source of Object.values(info.sources)) {
    counts.set(source.library, (counts.get(source.library) ?? 0) + 1)
  }

  const libraries = info.libraries.flatMap((library) => {
    const count = counts.get(library.id)

    return count ? [`${count.toLocaleString()} from ${library.name}`] : []
  })

  return [`${(counts.get(undefined) ?? 0).toLocaleString()} from the app`, ...libraries].join(", ")
}

function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${noun(count, word)}`
}

function noun(count: number, word: string): string {
  return count === 1 ? word : `${word}s`
}

/**
 * An item's words, beside its icon and count. When the status bar is narrower than 56rem they're left to screen readers,
 * so the items fit as an icon and a number, and the tooltip says the rest.
 */
function Words({ children }: { children: ReactNode }) {
  return <span className="@max-4xl/footer:sr-only">{children}</span>
}

/** A status bar item, with a tooltip saying what it is: a button when it leads somewhere, plain text otherwise. */
function Item({
  icon,
  hint,
  detail,
  onClick,
  pressed,
  children
}: {
  icon: ReactNode
  hint: string
  detail?: string
  onClick?: () => void
  /** Whether what it opens is open, for one that opens and closes something. */
  pressed?: boolean
  children: ReactNode
}) {
  const className = "flex h-6 shrink-0 items-center gap-1.5 rounded px-1.5"

  return (
    <Hint label={hint} detail={detail}>
      {onClick ? (
        <button
          type="button"
          aria-pressed={pressed}
          className={`${className} hover:bg-accent hover:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground`}
          onClick={onClick}
        >
          {icon}
          {children}
        </button>
      ) : (
        <span className={className}>
          {icon}
          {children}
        </span>
      )}
    </Hint>
  )
}

/**
 * The designs' errors and warnings in the console (PAR-147), counted, which open it and close it again. With none,
 * it's a quiet way in: the console's icon, and its name while there's room.
 */
function ConsoleStatus({ projectId }: { projectId: string }) {
  const { errors, warnings } = tally(useConsole(projectId))
  const open = !!useLayout().console
  const detail = open ? "Click to close the console" : "Click to show the console"

  if (errors === 0 && warnings === 0) {
    return (
      <Item
        icon={<SquareTerminal className="size-3.5" />}
        hint="Console"
        detail={detail}
        onClick={() => void actions.console.run("panel")}
        pressed={open}
      >
        <Words>Console</Words>
      </Item>
    )
  }

  const said = [errors > 0 && plural(errors, "error"), warnings > 0 && plural(warnings, "warning")].filter(Boolean)

  return (
    <Item
      icon={
        errors > 0 ? (
          <CircleX className="size-3.5 text-destructive" />
        ) : (
          <TriangleAlert className="size-3.5 text-amber-500" />
        )
      }
      hint={`${said.join(" and ")} from the designs`}
      detail={detail}
      onClick={() => void actions.console.run("panel")}
      pressed={open}
    >
      <strong className="font-medium text-foreground tabular-nums">{errors > 0 ? errors : warnings}</strong>
      <span className="sr-only">{errors > 0 ? ` ${noun(errors, "error")}` : ` ${noun(warnings, "warning")}`}</span>
      {errors > 0 && warnings > 0 && (
        <>
          <span className="sr-only"> and </span>
          <TriangleAlert className="ml-1 size-3.5 text-amber-500" />
          <strong className="font-medium text-foreground tabular-nums">{warnings}</strong>
          <span className="sr-only">{` ${noun(warnings, "warning")}`}</span>
        </>
      )}
    </Item>
  )
}

/**
 * A save that failed, which nothing else would show. Unsaved changes show as a dot on the project's tab, so the status
 * bar doesn't repeat them.
 */
function SaveFailure({ store }: { store: DesignStore }) {
  const state = useSaveState(store)

  if (state.status !== "failed") {
    return null
  }

  return (
    <Item
      icon={<TriangleAlert className="size-3.5 text-destructive" />}
      hint="Couldn't save"
      detail="Click to try again"
      onClick={() => void actions.save.run("panel")}
    >
      <Words>
        <span className="text-destructive">Couldn&apos;t save</span>
      </Words>
    </Item>
  )
}
