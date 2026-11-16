// What the scripts that try a built copy of the app read to reach it through its agent: the file the app writes when
// its agent starts, and the agent's answers.
import { z } from "zod"

/** Where the running app's agent listens, from the file it writes when it starts. */
export const agentConnection = z.object({ url: z.string(), token: z.string() })

/** An agent call that succeeded: a result, and no error. */
export const agentAnswer = z.object({ result: z.json(), error: z.never().optional() })
