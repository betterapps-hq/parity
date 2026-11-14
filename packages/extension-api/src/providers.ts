import type { Disposable, Route } from "./api.ts"
import type { Address, Endpoint } from "./processes.ts"

/*
 * Providers: jobs an extension does for Parity, declared in its manifest's `contributes.providers` and given behaviour
 * with `parity.providers.register`. Parity calls a provider with plain data and waits for its answer, so each method is
 * asynchronous and takes and returns only what JSON can carry. An address or discovery provider's call has a time
 * limit: an answer that's late, throws or doesn't fit is left out, and the rest go ahead.
 */

/** Reads an app's routes from its router's own files, so the canvas draws each page. */
export interface RouterProvider {
  /**
   * The project's routes, each parent before its children. Empty when the router's files aren't there, as before its
   * tooling first writes them. Parity asks while the project opens.
   */
  routes(): Promise<Route[]>
}

/** What an address provider is told about a server. Nothing of its output or environment. */
export interface ServerFacts {
  /** Its id among the project's processes. */
  id: string
  name: string
  endpoint: Endpoint
  pid?: number
  /** Its folder, when Parity knows it. */
  cwd?: string
}

/** An address a provider gives, which Parity marks with the provider's id. */
export type ProvidedAddress = Omit<Address, "provider">

/** Says where else a server is reached, as a name Portless routes to it. Asked within 2 seconds. */
export interface AddressProvider {
  /** The other places each server is reached, for a batch of servers with an endpoint. */
  addresses(servers: ServerFacts[]): Promise<{ server: string; addresses: ProvidedAddress[] }[]>
}

/** A server running that Parity didn't start, as a discovery provider finds it. */
export interface DiscoveredServer {
  /** Stable while the server runs, as `storybook.shop` for a route. */
  key: string
  /** On this machine: Parity drops a server whose endpoint isn't. */
  endpoint: Endpoint
  name?: string
  pid?: number
  cwd?: string
  /** Addresses the provider knows it by, under the same rules as an address provider's. */
  addresses?: ProvidedAddress[]
}

/** Finds servers running that Parity didn't start, when an extension calls `processes.find`. Asked within 5 seconds. */
export interface DiscoveryProvider {
  /** Servers running now, for the open project. */
  discover(project: { root: string }): Promise<DiscoveredServer[]>
  /** How long an answer stays good, in milliseconds. Kept until `changed()` unless said. */
  maxAgeMs?: number
}

/** Each kind of provider, by the name the manifest's `contributes.providers` declares it under. */
export interface ProviderKinds {
  router: RouterProvider
  addresses: AddressProvider
  discovery: DiscoveryProvider
}

/** A registered provider. Disposing it takes it away. */
export interface ProviderHandle extends Disposable {
  /** Says what it would answer has changed, as when Portless's routes do, so Parity asks again. */
  changed(): void
}

/** `parity.providers`. */
export interface ProviderRegistry {
  /** Gives behaviour to a provider the manifest's `contributes.providers` declares. A second of one kind is refused. */
  register<Kind extends keyof ProviderKinds>(kind: Kind, provider: ProviderKinds[Kind]): ProviderHandle
}
