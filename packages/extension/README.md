# @parity-app/extension

The one package a Parity extension imports: the types its code and manifest are written against, `defineExtension`, and
the manifest check its tests run. It's private for now, so only Parity's own extensions use it.

```ts
// src/extension.ts
import { defineExtension } from "@parity-app/extension"

export default defineExtension({
  activate(parity) {
    parity.subscriptions.push(
      parity.commands.register("hello.greet", async () => {
        await parity.ui.notify(`Hello from ${parity.project.name}`)
      })
    )
  }
})
```

Its manifest, the `parity` field of `package.json`, declares the command and where it shows, so Parity draws it in
Search before the code loads, and starts the extension the first time it runs:

```json
{
  "name": "parity-hello",
  "version": "1.0.0",
  "type": "module",
  "main": "src/extension.ts",
  "parity": {
    "displayName": "Hello",
    "prefix": "hello",
    "icon": { "viewBox": "0 0 24 24", "path": "M12 2 2 22h20z" },
    "activates": ["onCommand:hello.greet"],
    "contributes": {
      "commands": [{ "id": "hello.greet", "title": "Say hello", "icon": "hand" }],
      "menus": { "search": [{ "command": "hello.greet" }] }
    }
  }
}
```

The `icon` is the tool's logo as one path, drawn in the text's color. Give it a `color` with a hex for each theme, as
`{ "light": "#FF4785", "dark": "#FF4785" }`, and the logo takes it when its status bar item is hovered.

A test checks the manifest as Parity does, and names the field that breaks a rule:

```ts
import { readExtension } from "@parity-app/extension/manifest"
import { expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }

it("has a manifest Parity accepts", () => {
  expect(readExtension(packageJson).manifest.contributes.commands?.[0]?.id).toBe("hello.greet")
})
```

## What's in it

- **`defineExtension({ activate, deactivate })`** types an extension from its first line. Parity calls `activate` with
  the `parity` object when an event in `activates` happens, and `deactivate` before the extension's process ends. What
  `activate` returns is the extension's API, for extensions that name it in `extensionDependencies`.
- **The types**, from `@parity-app/extension`: `Parity` and each of its areas, the manifest, providers and processes.
- **`readExtension`**, from `@parity-app/extension/manifest`: the check Parity runs on every manifest before it loads
  the extension's code.
- **Styles helpers**, from `@parity-app/extension/styles`, for a styles provider: `writeTokenChanges` and
  `writeCustomProperty`, which write token values into a stylesheet's blocks as Parity does without a styles extension,
  and `comparableValue` and `sameCondition`, which compare declarations as Parity does.
- **Node helpers** are in [`@parity-app/extension-node`](../extension-node/README.md), so this package stays pure:
  `findPackage` and `packageEntry` find the project's own copy of a package and the file to load from it.

## Reference

- [Extensions](../../docs/extensions.md): the manifest's rules, the host each extension runs in, and every area of the
  `parity` object.
- [The developer API proposal](../../docs/proposals/developer-api.md): what's planned, and what's been decided.
- Parity's own extensions, in `packages/extension-*`, as samples.
