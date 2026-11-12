import { fileURLToPath } from "node:url"
import { expect, it } from "vite-plus/test"
import { snippetReference } from "./reference.ts"

const root = fileURLToPath(new URL("../../..", import.meta.url))

// The reference agents read is generated from `SnippetApi`, so it can't drift from the code. When the API or a type it
// names changes, run this test with `-u` to write the new reference.
it("keeps the snippet API reference in step with SnippetApi (PAR-958)", async () => {
  await expect(snippetReference(root)).toMatchFileSnapshot("../../cli/skills/reference.md")
}, 60_000)
