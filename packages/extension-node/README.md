# @parity-app/extension-node

Helpers for an extension's Node code, beside [`@parity-app/extension`](../extension/README.md), which stays pure. Parity
runs each extension in a Node host of its own, so its code can load the project's own copy of its tool:

```ts
import { pathToFileURL } from "node:url"
import { findPackage, packageEntry } from "@parity-app/extension-node"

const tailwind = await findPackage(parity.project.root, "@tailwindcss/node")
const entry = tailwind && packageEntry(tailwind, "runtime")
const loaded = entry && (await import(pathToFileURL(entry).href))
```

`findPackage` finds a package as Parity does, through pnpm's links and Yarn Plug'n'Play too, from the project's root or
from a package that depends on it. `packageEntry` gives the file its `exports` or `main` name for a use: `runtime`,
`types`, `source`, `style` or `browser`.
