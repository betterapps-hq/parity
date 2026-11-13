import { canvasDocument as canvasDocumentSchema, detectionCorrections, finiteNumber } from "@parity-app/core"
import { recoveryCopySchema } from "@parity-app/editor"
import { z } from "zod"

/**
 * What a window may send each of the project service's methods (PAR-565), as zod schemas that are also the params'
 * types (PAR-578): `ServiceMethods` takes each method's params from here, so a field can't be in a type and missing from
 * its schema, where the check would strip it on the way in (PAR-992).
 */

// A project file's schema, and a recovery copy's that holds it, are too large for TypeScript to write out where
// `serviceParams` uses them, which the CLI's declarations need. Named as interfaces, they're written by name.
type CanvasDocumentType = typeof canvasDocumentSchema

type RecoveryCopyType = typeof recoveryCopySchema

// oxlint-disable-next-line typescript/no-empty-interface -- the name is the point
interface CanvasDocumentSchema extends CanvasDocumentType {}

// oxlint-disable-next-line typescript/no-empty-interface -- the name is the point
interface RecoveryCopySchema extends RecoveryCopyType {}

const canvasDocument: CanvasDocumentSchema = canvasDocumentSchema
const recoveryCopy: RecoveryCopySchema = recoveryCopySchema

const themeVariable = z.object({ name: z.string(), value: z.string() })
const tokenChange = z.object({ name: z.string(), theme: z.string(), value: z.string() })

// A write without a value takes the token out, so `value` is there but may be undefined.
const tokenWrite = z.object({ name: z.string(), theme: z.string(), value: z.string().or(z.undefined()) })
const stringRecord = z.record(z.string(), z.string())

const guestComponentSource = z.object({ path: z.string(), export: z.string(), version: z.number().optional() })
const frameViewport = z.object({ width: finiteNumber, height: finiteNumber })

/** A frame the offscreen render window draws, to measure it or capture it. */
export const renderJob = z.object({
  /** The project drawn, so the render window lets go of its last guest when the project's moves to a new address. */
  projectId: z.string(),
  guestUrl: z.string(),
  /** Components the guest adds before drawing, since the type checker found them after it loaded. */
  components: z.record(z.string(), guestComponentSource).optional(),
  theme: z.array(themeVariable),
  /** The node tree, which the offscreen window's guest reads as the canvas does. */
  tree: z.unknown(),
  /**
   * The frame and the window it stands for, as core's `frameGeometry` gives them, so the offscreen frame matches the
   * live one. `height` is the frame's own fixed height, which clips it; without one the frame is as tall as its content.
   * `viewport` is the browser window, which viewport units and the project's window size checks measure, and which
   * keeps its height when the frame grows past it.
   */
  mode: z.object({
    width: finiteNumber,
    height: finiteNumber.optional(),
    viewport: frameViewport,
    classNames: z.array(z.string()),
    attributes: stringRecord,
    /** The mode's options by variable, for decorators. */
    globals: stringRecord.optional(),
    /** The mode stands for a phone or a tablet, whose frames take thin scrollbars (core's `isTouchMode`). */
    touch: z.literal(true).optional()
  }),
  scale: finiteNumber.positive(),
  /** Also check the frame with axe-core. */
  audit: z.boolean().optional(),
  /** When auditing, the color tokens to read the values of in the frame, for contrast fixes. */
  colorTokens: z.array(z.string()).optional(),
  /**
   * Draw what the frame's components portal out of it (a dialog, a popover's popup, a menu) inside it, in the flow after
   * the rest, as a component preview does (PAR-517).
   */
  inlinePortals: z.literal(true).optional(),
  /**
   * Every token value that differs from the project's compiled CSS, such as unsaved edits: the complete set, not
   * changes. Each frame starts from the compiled stylesheet and lays these over it, so no frame inherits another's.
   */
  previews: z.array(tokenChange).optional(),
  /**
   * The design it draws, by key, with the state and mode, so what the frame writes to the console is kept as that
   * design's (PAR-147). None for a component preview. No stored name has it.
   */
  design: z.object({ key: z.string(), state: z.string().optional(), mode: z.string().optional() }).optional()
})

export type RenderJob = z.infer<typeof renderJob>

/** A component's preview to look up or make: the job that draws it, as inserting it would place it. */
const previewJob = z.object({ component: z.string(), job: renderJob })

export type PreviewJob = z.infer<typeof previewJob>

/** One frame in a project's picture: its bitmap, and its mode as the board's caption names it. */
const pictureFrame = z.object({
  /** The bitmap as a data URL: a WebP, or a PNG where the service couldn't encode one. */
  src: z.string(),
  /** The mode's name, such as Mobile. */
  mode: z.string(),
  /** The frame's width and its window's height, in its own CSS pixels: the picture shows the top of the frame. */
  width: finiteNumber,
  height: finiteNumber
})

export type PictureFrame = z.infer<typeof pictureFrame>

/** A screen in a project's picture: its main frame, and the phone frame beside it where its board shows one. */
const pictureScreen = z.object({ name: z.string(), main: pictureFrame, phone: pictureFrame.optional() })

export type PictureScreen = z.infer<typeof pictureScreen>

/**
 * A project's picture for the start page (PAR-607): its first few screens as the canvas last drew them once saved, so a
 * card can show the first and flip through the rest.
 */
const projectPicture = z.object({
  /** When it was taken, in milliseconds since 1970. */
  taken: finiteNumber,
  screens: z.array(pictureScreen)
})

export type ProjectPicture = z.infer<typeof projectPicture>

const project = z.object({ projectId: z.string() })

/** A declaration a frame asks the project's classes for, as `@parity-app/style-schema` has them. */
const cssDeclaration = z.object({
  property: z.string(),
  value: z.string(),
  when: z
    .object({ state: z.string().optional(), viewport: z.string().optional(), theme: z.string().optional() })
    .optional()
})

const exportSize = z.object({
  format: z.enum(["png", "jpg"]),
  scale: z.union([z.literal(1), z.literal(2), z.literal(3)])
})

const processId = z.object({ id: z.string() })
const roots = z.object({ roots: z.array(z.string()) })

/** Each method's params. */
export const serviceParams = {
  "project.open": z.object({ root: z.string().optional() }),
  "project.close": project,
  "project.detectAgain": project,
  "project.components": project,
  "project.correctComponents": project.extend({ corrections: detectionCorrections.optional() }),
  "library.catalog": project,
  "library.add": project.extend({ library: z.string() }),
  "library.importStyles": project.extend({ library: z.string() }),
  "document.save": project.extend({ path: z.string(), document: canvasDocument }),
  "recovery.keep": project.extend({ copy: recoveryCopy.optional() }),
  "recovery.read": project,
  "images.import": project.extend({ name: z.string(), type: z.string(), data: z.string() }),
  "images.scan": project,
  "images.saveFrom": project.extend({ url: z.url({ protocol: /^https$/ }), name: z.string().min(1) }),
  "images.remove": project.extend({ path: z.string() }),
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
    files: z.array(z.object({ layer: z.number().int().nonnegative(), name: z.string(), size: exportSize }))
  }),
  "layers.picture": project.extend({
    layers: z.array(
      z.object({
        design: z.string(),
        node: z.string().optional(),
        name: z.string(),
        at: z.object({ x: finiteNumber, y: finiteNumber })
      })
    )
  }),
  "frames.capture": z.object({ job: renderJob, height: finiteNumber.optional() }),
  "frames.stored": z.object({ jobs: z.string() }),
  "frames.changes": z.object({ frames: z.string() }),
  "frames.clearStored": z.undefined(),
  "pictures.store": z.object({ root: z.string(), picture: projectPicture }),
  "pictures.read": roots,
  "pictures.keepOnly": roots,
  "start.check": roots,
  "previews.lookup": z.object({ previews: z.array(previewJob) }),
  "previews.make": z.object({ preview: previewJob, priority: z.enum(["visible", "idle"]) }),
  "accessibility.check": project.extend({ design: z.string() }),
  "tokens.save": project.extend({ changes: z.array(tokenWrite) }),
  "styles.classes": project.extend({ declarations: z.array(cssDeclaration), written: z.array(z.string()) }),
  "processes.list": z.object({}),
  "processes.stop": processId,
  "processes.restart": processId,
  "processes.dismiss": processId
}

/** Each method's params, as its schema reads them. */
export type ServiceParams = { [M in keyof typeof serviceParams]: z.output<(typeof serviceParams)[M]> }
