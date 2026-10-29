import type { ComponentInfo } from "@parity/core"
import { useSyncExternalStore } from "react"

/** The project's components with their inferred props. Empty until the service has read them from source. */
export class ComponentStore {
  private components: Readonly<Record<string, ComponentInfo>> = {}
  private readonly listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get = () => this.components

  set(components: Record<string, ComponentInfo>): void {
    this.components = components
    for (const listener of this.listeners) listener()
  }
}

export function useComponentInfo(store: ComponentStore, name: string | undefined): ComponentInfo | undefined {
  const components = useSyncExternalStore(store.subscribe, store.get)
  return name ? components[name] : undefined
}

export function useComponents(store: ComponentStore): Readonly<Record<string, ComponentInfo>> {
  return useSyncExternalStore(store.subscribe, store.get)
}
