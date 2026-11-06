import type { Checks } from "@parity-app/channel"
import { CodedError, canvasDocument, detectionCorrections, finiteNumber, parseInput } from "@parity-app/core"
import { z } from "zod"
import type { ServiceMethods } from "./protocol.ts"

/**
 * The project service's checks on what a window asks of it (PAR-565). The project's own code runs in the window's page,
 * beside `window.canvasHost`, so it can send any method with any params: each request is read here before its handler
 * sees it, and refused with `invalid_input` and the field at fault. Ports between Parity's own processes and threads
 * aren't checked (PAR-578).
 */

const themeVariable = z.object({ name: z.string(), value: z.string() })
const tokenChange = z.object({ name: z.string(), theme: z.string(), value: z.string() })
// A write without a value takes the token out, so `value` is there but may be undefined.
const tokenWrite = z.object({ name: z.string(), theme: z.string(), value: z.string().or(z.undefined()) })
const stringRecord = z.record(z.string(), z.string())

const renderJob = z.object({
  projectId: z.string(),
  guestUrl: z.string(),
  components: z.record(z.string(), z.object({ path: z.string(), export: z.string() })).optional(),
  theme: z.array(themeVariable),
  // The node tree is drawn by the offscreen window's guest, which reads it as the canvas does.
  tree: z.unknown(),
  mode: z.object({
    width: finiteNumber,
    height: finiteNumber.optional(),
    viewport: z.object({ width: finiteNumber, height: finiteNumber }),
    classNames: z.array(z.string()),
    attributes: stringRecord,
    globals: stringRecord.optional()
  }),
  scale: finiteNumber.positive(),
  audit: z.boolean().optional(),
  colorTokens: z.array(z.string()).optional(),
  inlinePortals: z.literal(true).optional(),
  previews: z.array(tokenChange).optional(),
  design: z.object({ key: z.string(), state: z.string().optional(), mode: z.string().optional() }).optional()
})

const previewJob = z.object({ component: z.string(), job: renderJob })

const pictureFrame = z.object({ src: z.string(), mode: z.string(), width: finiteNumber, height: finiteNumber })
const projectPicture = z.object({
  taken: finiteNumber,
  screens: z.array(z.object({ name: z.string(), main: pictureFrame, phone: pictureFrame.optional() }))
})

const project = z.object({ projectId: z.string() })
const processId = z.object({ id: z.string() })
const roots = z.object({ roots: z.array(z.string()) })

/** Each method's params. A schema whose output drifts from `ServiceMethods` is a compile error. */
const serviceParams: { [M in keyof ServiceMethods]: z.ZodType<ServiceMethods[M]["params"]> } = {
  "project.open": z.object({ root: z.string().optional() }),
  "project.close": project,
  "project.components": project,
  "project.correctComponents": project.extend({ corrections: detectionCorrections.optional() }),
  "library.catalog": project,
  "library.add": project.extend({ library: z.string() }),
  "library.importStyles": project.extend({ library: z.string() }),
  "document.save": project.extend({ path: z.string(), document: canvasDocument }),
  "images.import": project.extend({ name: z.string(), type: z.string(), data: z.string() }),
  "project.undoEdit": project.extend({ id: z.string() }),
  "storybook.open": project.extend({ component: z.string().optional() }),
  "document.saveCopy": z.object({ path: z.string(), document: canvasDocument }),
  "designs.export": project.extend({
    folder: z.string(),
    designs: z.array(z.string()),
    scale: finiteNumber.positive()
  }),
  "layers.export": project.extend({
    folder: z.string(),
    layers: z.array(z.object({ design: z.string(), node: z.string().optional() })),
    files: z.array(
      z.object({
        layer: z.number().int().nonnegative(),
        name: z.string(),
        size: z.object({ format: z.enum(["png", "jpg"]), scale: z.union([z.literal(1), z.literal(2), z.literal(3)]) })
      })
    )
  }),
  "frames.capture": z.object({ job: renderJob, height: finiteNumber.optional() }),
  "frames.stored": z.object({ job: renderJob }),
  "frames.clearStored": z.undefined(),
  "pictures.store": z.object({ root: z.string(), picture: projectPicture }),
  "pictures.read": roots,
  "pictures.keepOnly": roots,
  "previews.lookup": z.object({ previews: z.array(previewJob) }),
  "previews.make": z.object({ preview: previewJob, priority: z.enum(["visible", "idle"]) }),
  "accessibility.check": project.extend({ design: z.string() }),
  "code.read": project.extend({ path: z.string() }),
  "tokens.save": project.extend({ changes: z.array(tokenWrite) }),
  "processes.list": z.object({}),
  "processes.stop": processId,
  "processes.restart": processId,
  "processes.dismiss": processId
}

/** Reads each request's params as `serviceParams` says, or throws `CodedError` with `invalid_input`. */
export const serviceChecks = Object.fromEntries(
  Object.entries(serviceParams).map(([method, schema]) => [method, (params: unknown) => parseInput(schema, params)])
) as Checks<ServiceMethods>

/** A request for a method the service doesn't have. */
export function unknownServiceMethod(method: string): CodedError {
  return new CodedError(`The project service has no method ${JSON.stringify(method)}`, {
    code: "invalid_input",
    field: "method"
  })
}
