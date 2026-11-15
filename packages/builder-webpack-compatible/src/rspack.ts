import type { Bundler, BundlerCompiler, BundlerConfig, BundlerPlugin } from "./bundler.ts"

/*
 * Rspack as a bundler, from the project's own `@rspack/core` or the copy Rsbuild ships: both extensions build with it.
 */

/** The parts of Rspack's API the builders use, as its package exports them. */
export interface RspackApi {
  (config: BundlerConfig): BundlerCompiler
  rspackVersion?: string
  version?: string
  HotModuleReplacementPlugin: new () => BundlerPlugin
  DefinePlugin: new (definitions: Record<string, string>) => BundlerPlugin
  NormalModuleReplacementPlugin: new (test: RegExp, replace: (resource: { request: string }) => void) => BundlerPlugin
  CssExtractRspackPlugin?: (new () => BundlerPlugin) & { loader: string }
}

/** What Rspack's package exports: its API as `rspack`, and as its default, which CommonJS builds wrap once more. */
export interface RspackModule {
  rspack?: RspackApi
  default?: RspackApi & { rspack?: RspackApi }
}

/** Rspack's API from its package's module: its `rspack` export, or its default. */
export function rspackApi(module: RspackModule, from: string): RspackApi {
  const api = module.rspack ?? module.default?.rspack ?? module.default

  if (!api?.HotModuleReplacementPlugin) {
    throw new TypeError(`${from} doesn't export Rspack's API`)
  }

  return api
}

/** Rspack as the shared builder code uses it, named as the tool driving it (Rsbuild, with its version) if not Rspack. */
export function rspackBundler(rspack: RspackApi, tool?: { name: string; version: string }): Bundler {
  const extract = rspack.CssExtractRspackPlugin

  const bundler: Bundler = {
    name: tool?.name ?? "Rspack",
    version: tool?.version ?? rspack.rspackVersion ?? rspack.version ?? "",
    compiler: (config) => rspack(config),
    hotModuleReplacement: () => new rspack.HotModuleReplacementPlugin(),
    define: (definitions) => new rspack.DefinePlugin(definitions),
    replaceModules: (test, replace) =>
      new rspack.NormalModuleReplacementPlugin(test, (resource) => {
        const replaced = replace(resource.request)

        if (replaced !== undefined) {
          resource.request = replaced
        }
      })
  }

  if (extract) {
    bundler.extractCss = { plugin: () => new extract(), loader: extract.loader }
  }

  return bundler
}
