/** What an extension's package contributes, as far as Settings lists it: its commands and status items. */
export interface ContributingExtension {
  contributes: {
    commands?: readonly { id: string; title: string }[]
    statusItems?: readonly { id: string; title: string }[]
  }
}

/** What the open project says of its tools' adapters: the role each fills and its status items. */
export interface AdapterFacts {
  renderer: { id: string }
  builder: { id: string }
  router?: { id: string }
  styles?: { id: string }
  /** The app's routes; the root has no parent. */
  routes: readonly { parent?: string }[]
  /** The screens adapters read, by the adapter that read each. */
  entities: { screens?: readonly { adapter: string }[] }
  /** The status bar items adapters show, by adapter. */
  status: readonly { adapter: string }[]
}

/**
 * What a built-in extension adds to the open project, as Settings lists it: what its adapter does for the role it fills,
 * then the commands its extension offers, by their names, then a status bar item when it shows one. An extension's
 * contributions are those whose ids start with its own, as `storybook.open`. Nothing for a tool the project doesn't use.
 */
export function extensionAdds(
  id: string,
  project: AdapterFacts,
  extensions: readonly ContributingExtension[] = []
): string[] {
  const own = (contribution: { id: string }) => contribution.id.startsWith(`${id}.`)
  const contributed = extensions.filter((extension) => extension.contributes.commands?.some(own))

  const commands = contributed.flatMap(
    (extension) => extension.contributes.commands?.filter(own).map((command) => command.title) ?? []
  )

  const shown =
    project.status.some((item) => item.adapter === id) ||
    contributed.some((extension) => extension.contributes.statusItems?.some(own))

  return unique([...rolesOf(id, project), ...commands, ...(shown ? ["A status bar item"] : [])])
}

/** What an adapter does for each role it fills in the project. */
function rolesOf(id: string, project: AdapterFacts): string[] {
  const roles: string[] = []

  if (project.renderer.id === id) {
    roles.push("Renders the project's components")
  }

  if (project.builder.id === id) {
    roles.push("Serves the project's code to the canvas")
  }

  if (project.styles?.id === id) {
    roles.push("Reads the theme as tokens", "Writes styles as classes")
  }

  if (project.router?.id === id) {
    const pages = project.routes.filter((route) => route.parent !== undefined).length

    roles.push(`Reads the app's routes as pages (${pages.toLocaleString()})`)
  }

  const screens = project.entities.screens?.filter((screen) => screen.adapter === id).length ?? 0

  if (screens > 0) {
    roles.push(`Reads its files as screens (${screens.toLocaleString()})`)
  }

  return roles
}

function unique(items: string[]): string[] {
  return [...new Set(items)]
}
