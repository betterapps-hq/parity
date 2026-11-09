import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import type { FoundComponent } from "@parity-app/code"
import { isFunction, isRecord, type Live, type LiveFunction, type LiveObject, type Load } from "./live.ts"

/** As much of React as libgen's tests use, read from the copy of React they load. */
export interface TestReact {
  /** A context, with its `Provider` and `Consumer`, which `useContext` reads. */
  createContext(value: Live): LiveObject
  createElement: LiveFunction
  useContext(context: Live): Live
  renderToStaticMarkup(element: Live): Live
}

/** Loads modules as the project whose `package.json` this is has them installed. */
export function loadFrom(packageJson: string): Load {
  const from = createRequire(packageJson)

  // A module's namespace is an object of its exports.
  return async (specifier) => await import(pathToFileURL(from.resolve(specifier)).href)
}

/** React and its server renderer, from the project `load` loads from. */
export async function testReact(load: Load): Promise<TestReact> {
  const { createContext, createElement, useContext } = await load("react")
  const { renderToStaticMarkup } = await load("react-dom/server")

  if (!isFunction(createContext) || !isFunction(createElement) || !isFunction(useContext)) {
    throw new Error("React didn't load.")
  }

  if (!isFunction(renderToStaticMarkup)) {
    throw new Error("React's server renderer didn't load.")
  }

  return {
    createContext(value) {
      const context = createContext(value)

      if (!isRecord(context)) {
        throw new Error("React's createContext made no context.")
      }

      return context
    },
    createElement,
    useContext: (context) => useContext(context),
    renderToStaticMarkup
  }
}

/** A component the type checker found, with only the name it's exported by: what parts are tried with. */
export function foundComponent(name: string): FoundComponent {
  return {
    name,
    as: "function",
    file: "",
    group: "",
    requiredProps: [],
    type: "",
    entry: "",
    export: name,
    props: {},
    fingerprint: "",
    samples: {}
  }
}
