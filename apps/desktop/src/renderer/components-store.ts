import type { ComponentInfo } from "@parity-app/core"
import { createStore, useStore } from "./store.ts"

/** The project's components with their inferred props. Empty until the service has read them from source. */
export class ComponentStore {
  private readonly components = createStore<Readonly<Record<string, ComponentInfo>>>(() => ({}))

  subscribe = this.components.subscribe

  get = this.components.get

  set(components: Record<string, ComponentInfo>): void {
    this.components.set(components)
  }
}

export function useComponents(store: ComponentStore): Readonly<Record<string, ComponentInfo>> {
  return useStore(store)
}
