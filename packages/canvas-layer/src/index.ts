/*
 * What's drawn in an internal extension's canvas layer (docs/proposals/extensions-in-the-window.md): the hooks that
 * read the layer's camera, boxes, colors and frames, the context Parity provides round each layer, and the tab's frame
 * loop behind `useFrame`.
 */

export { createFrameLoop, type Frame, type FrameLoop, type FrameLoopOptions } from "./frame-loop.ts"

export { CanvasLayerContext, type CanvasLayerContextValue, useBox, useCamera, useColor, useFrame } from "./hooks.ts"
