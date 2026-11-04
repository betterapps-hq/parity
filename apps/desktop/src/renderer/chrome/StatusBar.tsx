import { Blocks, BookOpen, Brush, Hammer, Palette, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"
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
  /** What detection found for a tool, and where. */
  const detected = (id: string) => info.detection.tools.find((tool) => tool.id === id)?.summary ?? ""
  return (
    <footer className="@container/footer flex h-7 shrink-0 items-center gap-1 border-t bg-background px-1.5 text-xs text-muted-foreground">
      <Item
        icon={<Brush className="size-3.5" />}
        hint={`Renders components with ${info.renderer.name}, the project's own framework`}
        detail={detected(info.renderer.id)}
      >
        <Words>
          <strong className="font-medium text-foreground">{info.renderer.name}</strong>
        </Words>
      </Item>
      <Item
        icon={<Hammer className="size-3.5" />}
        hint={`Builds with ${info.builder.name} ${info.builder.toolVersion}, the project's own toolchain`}
        detail={`${detected(info.builder.id)}\n${info.detection.packageManager.summary}`}
      >
        <Words>
          <strong className="font-medium text-foreground">{info.builder.name}</strong> {info.builder.toolVersion}
        </Words>
      </Item>
      <Item
        icon={<Blocks className="size-3.5" />}
        hint="Show components"
        detail={info.notes.join("\n")}
        onClick={() => openTab("components")}
      >
        <strong className="font-medium text-foreground">{info.componentCount}</strong>
        <Words> {info.componentCount === 1 ? "component" : "components"}</Words>
      </Item>
      <Item
        icon={<Palette className="size-3.5" />}
        hint={`Show tokens: ${semantic} from the project and ${tokens.length - semantic} from ${info.styles?.name ?? "the theme"}`}
        detail={info.styles && detected(info.styles.id)}
        onClick={() => openTab("tokens")}
      >
        <strong className="font-medium text-foreground">{tokens.length}</strong>
        <Words> tokens</Words>
      </Item>
      {info.storybook && (
        <Item
          icon={<BookOpen className="size-3.5" />}
          hint={`Open Storybook in your browser: ${Object.keys(info.storybook.stories).length} components have stories`}
          detail={detected("storybook")}
          onClick={() => void openInStorybook(session)}
        >
          <Words>
            <strong className="font-medium text-foreground">Storybook</strong>
          </Words>
        </Item>
      )}
      <span className="flex-1" />
      <SaveFailure store={store} />
      <Processes />
      {performanceStats && <PerformanceStats />}
    </footer>
  )
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
      hint={state.error}
      detail="Click to try again."
      onClick={() => void save()}
    >
      <span className="text-destructive">Couldn&apos;t save</span>
    </Item>
  )
}
