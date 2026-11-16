import { defineExtension, type Parity, type ProvidedAddress } from "@parity-app/extension"
import { z } from "zod"
import { inFolder, type PortlessState, readPortless, type Route } from "./portless.ts"

/*
 * Portless as an extension (docs/proposals/processes.md, Portless as an extension), using only Parity's public API: an
 * address provider that names each local server Portless routes to, and a discovery provider that offers those servers
 * to extensions' `find`, as Storybook's when it already runs. Portless's folder is what its manifest's `detect` found,
 * `PORTLESS_STATE_DIR` or its default `~/.portless`, which the manifest's `read` permission names.
 */

/** What the manifest's `detect` found: Portless's folder. */
const detected = z.object({ path: z.string() })

export default defineExtension({ activate })

function activate(parity: Parity): void {
  const found = detected.safeParse(parity.project.detected)

  if (!found.success) {
    parity.log.warn("Parity found no Portless folder.")

    return
  }

  const { path: folder } = found.data
  const read = () => readPortless(folder, (path) => parity.files.read(path))
  let state = read()

  const addresses = parity.providers.register("addresses", {
    async addresses(servers) {
      const { routes, address } = await state

      return servers.map((server) => ({
        server: server.id,
        addresses: routes.filter((route) => route.port === server.endpoint.port).map((route) => named(route, address))
      }))
    }
  })

  const discovery = parity.providers.register("discovery", {
    async discover() {
      const { routes, address } = await state

      return routes.map((route) => {
        const server = {
          key: route.hostname,
          name: route.hostname,
          endpoint: { url: `http://localhost:${route.port}`, port: route.port, protocol: "http" as const },
          addresses: [named(route, address)]
        }

        return route.pid ? { ...server, pid: route.pid } : server
      })
    }
  })

  // Routes come and go as servers start and stop.
  parity.subscriptions.push(
    parity.files.watch(inFolder(folder, "routes.json"), () => {
      state = read()
      addresses.changed()
      discovery.changed()
    }),
    addresses,
    discovery
  )
}

/** A route's name, as an address on this machine. */
function named(route: Route, address: PortlessState["address"]): ProvidedAddress {
  return { url: address(route.hostname), label: route.hostname, kind: "name", public: false }
}
