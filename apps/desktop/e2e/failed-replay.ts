import { beforeEach } from "vite-plus/test"
import { App } from "./app.ts"

// A failed test sends the editor window's replay of the minute before it, and the run's log says where to watch it
// (PAR-1043). It runs after the test's own `afterEach`, so a reset that fails is in the replay too.
beforeEach(({ task, onTestFailed }) => {
  onTestFailed(() => App.current?.sendReplay(task.fullName))
})
