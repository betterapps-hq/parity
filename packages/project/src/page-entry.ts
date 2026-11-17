import type { PageModules } from "@parity-app/core"

/**
 * The module a builder serves first in the app's own page (PAR-1260): it imports the page runtime and the extensions'
 * page modules, and starts the runtime with them, so React's hydration hook is installed before the app's own code
 * loads. `specifier` writes each module's absolute path the way the builder imports it. The runtime does nothing in a
 * page that isn't in one of Parity's frames, so the app's page is the app's own anywhere else.
 */
export function pageEntrySource(modules: PageModules, specifier: (file: string) => string = (file) => file): string {
  const imported = (prefix: string, list: PageModules["routers"]) =>
    list.map((module, index) => ({
      name: `${prefix}${index}`,
      line: `import { ${module.export} as ${prefix}${index} } from ${JSON.stringify(specifier(module.file))}`
    }))

  const routers = imported("router", modules.routers)
  const hydration = imported("hydration", modules.hydration)

  return [
    `import { startPageRuntime } from ${JSON.stringify(specifier(modules.runtime))}`,
    ...routers.map(({ line }) => line),
    ...hydration.map(({ line }) => line),
    `startPageRuntime({ routers: [${routers.map(({ name }) => name).join(", ")}], hydration: [${hydration.map(({ name }) => name).join(", ")}] })`,
    ""
  ].join("\n")
}
