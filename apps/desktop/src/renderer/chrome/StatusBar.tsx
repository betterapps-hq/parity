import { Blocks, BookOpen, Brush, Hammer, Palette, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"
import type { ProjectInfo } from "../../shared/protocol.ts"
import { useProject } from "../canvas/context.ts"
import { type DesignStore, useSaveState } from "../design-store.ts"
import { useTokenList } from "../tokens-store.ts"
import { save } from "./commands.ts"
import { Hint } from "./Hint.tsx"
import { setLayout } from "./layout.ts"
import { PerformanceStats } from "./PerformanceStats.tsx"
import { usePreferences } from "./preferences.ts"
import { Processes } from "./Processes.tsx"
import { openInStorybook } from "./storybook.ts"

/** How the project was understood, with nothing configured by hand. Each count opens the panel that lists it. */
export function StatusBar() {
  const session = useProject()
  const { info, store, tokens: tokenStore } = session
  const tokens = useTokenList(tokenStore)
  const semantic = tokens.filter((token) => token.source === "semantic").length
  const { performanceStats } = usePreferences()
  const openTab = (tab: string) => setLayout({ left: true, leftTab: tab })
  const stories = info.storybook ? Object.keys(info.storybook.stories).length : 0
  const themed = tokens.length - semantic
  return (
    <footer className="@container/footer flex h-7 shrink-0 items-center gap-1 border-t bg-background px-1.5 text-xs text-muted-foreground">
      <Item
        icon={<Brush className="size-3.5" />}
        hint={titled(info, info.renderer.id, info.renderer.name)}
        detail={withStatus(info, info.renderer.id, "Renders the project's components")}
      >
        <Words>
          <strong className="font-medium text-foreground">{info.renderer.name}</strong>
        </Words>
      </Item>
      <Item
        icon={<Hammer className="size-3.5" />}
        hint={titled(info, info.builder.id, info.builder.name)}
        detail={withStatus(info, info.builder.id, `Builds the project, with ${info.detection.packageManager.name}`)}
      >
        <Words>
          <strong className="font-medium text-foreground">{info.builder.name}</strong> {info.builder.toolVersion}
        </Words>
      </Item>
      <Item
        icon={<Blocks className="size-3.5" />}
        hint={plural(info.componentCount, "component")}
        detail="Click to show them"
        onClick={() => openTab("components")}
      >
        <strong className="font-medium text-foreground">{info.componentCount}</strong>
        <Words> {info.componentCount === 1 ? "component" : "components"}</Words>
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
      {info.storybook && (
        <Item
          icon={<BookOpen className="size-3.5" />}
          hint={titled(info, "storybook", "Storybook")}
          detail={`${plural(stories, "component")} with stories. Click to open it`}
          onClick={() => void openInStorybook(session)}
        >
          <strong className="font-medium text-foreground">{stories}</strong>
          <Words> in Storybook</Words>
        </Item>
      )}
      <span className="min-w-0 flex-1" />
      <SaveFailure store={store} />
      <Processes />
      {performanceStats && <PerformanceStats />}
    </footer>
  )
}

/*
 * Every item's tooltip has the same shape: a short title, the item's name and version or its count, then one short line
 * saying what it does or what clicking it does. Paths, discovery notes and errors stay out, since they can run long; the
 * Components panel, a notification or an agent's tools give them.
 */

/** A tool's name with its version, when detection found one. */
function titled(info: ProjectInfo, id: string, name: string): string {
  const version = info.detection.tools.find((tool) => tool.id === id)?.version
  return version ? `${name} ${version}` : name
}

/** A tooltip's line, with a note when the tool's version is one Parity doesn't test. */
function withStatus(info: ProjectInfo, id: string, line: string): string {
  const status = info.detection.tools.find((tool) => tool.id === id)?.status
  if (status === "dropped" || status === "newer") return `${line}. Parity doesn't test this version`
  return line
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${count === 1 ? noun : `${noun}s`}`
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
  children
}: {
  icon: ReactNode
  hint: string
  detail?: string
  onClick?: () => void
  children: ReactNode
}) {
  const className = "flex h-6 shrink-0 items-center gap-1.5 rounded px-1.5"
  return (
    <Hint label={hint} detail={detail}>
      {onClick ? (
        <button type="button" className={`${className} hover:bg-accent hover:text-foreground`} onClick={onClick}>
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
 * A save that failed, which nothing else would show. Unsaved changes show as a dot on the project's tab, so the status
 * bar doesn't repeat them.
 */
function SaveFailure({ store }: { store: DesignStore }) {
  const state = useSaveState(store)
  if (state.status !== "failed") return null
  return (
    <Item
      icon={<TriangleAlert className="size-3.5 text-destructive" />}
      hint="Couldn't save"
      detail="Click to try again"
      onClick={() => void save()}
    >
      <Words>
        <span className="text-destructive">Couldn&apos;t save</span>
      </Words>
    </Item>
  )
}
