import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@buildkitgg/shadcn-baseui-kit"
import { pageOf } from "../extension-views.ts"
import { useExtensions } from "../extensions.ts"
import { type ExtensionPage as Page, type ProjectSession, useTabs } from "../workspace.ts"
import { ContributionIcon, ExtensionLogo } from "./ExtensionIcons.tsx"
import { ExtensionView } from "./ExtensionView.tsx"

/*
 * An extension's page (PAR-1094), such as a setup guide, in a tab at the top of its own. It's drawn from the page's
 * declarative view, at a page's size, for the project it was opened for.
 */

/** A page's tab contents, while it's the tab that shows. */
export function ExtensionPageView({ page, active }: { page: Page; active: boolean }) {
  const session = useTabs().find((tab) => tab.session?.id === page.projectId)?.session

  return (
    <main hidden={!active} className="min-h-0 flex-1 overflow-y-auto">
      {session ? (
        <PageContents session={session} page={page} />
      ) : (
        <Empty className="h-full border-0">
          <EmptyHeader>
            <EmptyTitle>{"This page's project isn't open"}</EmptyTitle>
            <EmptyDescription>Open the project again to see it.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </main>
  )
}

function PageContents({ session, page }: { session: ProjectSession; page: Page }) {
  const view = pageOf(useExtensions(session).extensions, page.extension, page.page)

  if (!view) {
    return (
      <Empty className="h-full border-0">
        <EmptyHeader>
          <EmptyTitle>{"This page isn't available"}</EmptyTitle>
          <EmptyDescription>{`The extension that added it isn't running for ${session.info.name}.`}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex items-center gap-3">
        <ExtensionLogo icon={view.extension.icon} className="size-6 shrink-0" />
        <h1 className="text-lg font-semibold tracking-tight">{view.title}</h1>
      </header>
      <ExtensionView session={session} view={view} size="page" />
    </article>
  )
}

/** A page's icon in its tab at the top: its own, or its extension's logo. */
export function PageTabIcon({ page }: { page: Page }) {
  const session = useTabs().find((tab) => tab.session?.id === page.projectId)?.session

  return session ? <PageIcon session={session} page={page} /> : null
}

function PageIcon({ session, page }: { session: ProjectSession; page: Page }) {
  const view = pageOf(useExtensions(session).extensions, page.extension, page.page)

  return view ? <ContributionIcon name={view.icon} logo={view.extension.icon} className="size-3.5 shrink-0" /> : null
}
