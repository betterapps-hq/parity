import { snapshotProject } from "./detect.ts"

/*
 * Prints the detection snapshot of the project at the path it's given, for `detection.test.ts` to take a Plug'n'Play
 * project's in a plain Node process: `node packages/fixtures/src/snapshot.ts <root>`.
 */

const [root] = process.argv.slice(2)

if (!root) {
  throw new Error("Usage: node packages/fixtures/src/snapshot.ts <project root>")
}

process.stdout.write(JSON.stringify(await snapshotProject(root)))
