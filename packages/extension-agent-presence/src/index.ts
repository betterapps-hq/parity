/*
 * Agent presence, an internal extension with only a window module (`./window`). What's exported here is for the app's
 * stories, which play the same queue and choreography in a layer of their own.
 */

export { AgentPresence } from "./AgentPresence.tsx"

export { AgentQueue, agentKey, type HoldBoard, type QueuedStep } from "./queue.ts"

export { locate, onScreen, type Target, type TargetReads } from "./targets.ts"
