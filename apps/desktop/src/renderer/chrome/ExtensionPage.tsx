import { Button, Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@buildkitgg/shadcn"
import { X } from "lucide-react"
import { pageOf } from "../extension-views.ts"
import { useExtensions } from "../extensions.ts"
import { type ExtensionPage as Page, type ProjectSession, useProject, workspace } from "../workspace.ts"
import { ExtensionLogo } from "./ExtensionIcons.tsx"
import { ExtensionView } from "./ExtensionView.tsx"

/*
 * An extension's page (PAR-1094), such as a setup guide, in its project's place until it's closed. It's drawn from the
 * page's declarative view, at a page's size, for the project it was opened for.
 */

/** A page, while it shows in its project's place. */
export function ExtensionPageView({ page, active }: { page: Page & { title: string }; active: boolean }) {
  const project = useProject()
  const session = project?.session?.id === page.projectId ? project.session : undefined

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

/** The page's view, headed by its extension's logo, its title and the button that closes it. */
function PageContents({ session, page }: { session: ProjectSession; page: Page & { title: string } }) {
  const view = pageOf(useExtensions(session).extensions, page.extension, page.page)

  if (!view) {
    return (
      <Empty className="h-full border-0">
        <EmptyHeader>
          <EmptyTitle>{"This page isn't available"}</EmptyTitle>
          <EmptyDescription>{`The extension that added it isn't running for ${session.info.name}.`}</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={() => workspace.closePage()}>
          Close
        </Button>
      </Empty>
    )
  }

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex items-center gap-3">
        <ExtensionLogo icon={view.extension.icon} className="size-6 shrink-0" />
        <h1 className="min-w-0 flex-1 text-lg font-semibold tracking-tight">{view.title}</h1>
        <Button variant="ghost" size="icon" aria-label={`Close ${view.title}`} onClick={() => workspace.closePage()}>
          <X />
        </Button>
      </header>
      <ExtensionView session={session} view={view} size="page" />
    </article>
  )
}
