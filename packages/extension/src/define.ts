import type { ExtensionApi, ExtensionModule } from "./api.ts"

/**
 * An extension, typed from its first line: `export default defineExtension({ activate(parity) { … } })`. What
 * `activate` returns is the extension's API, typed as written, for extensions that name it in `extensionDependencies`.
 */
export function defineExtension<Api extends void | ExtensionApi = void>(
  extension: ExtensionModule<Api>
): ExtensionModule<Api> {
  return extension
}
