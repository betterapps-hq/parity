/*
 * How picking something up, carrying it and dropping it moves on the canvas: a layer, a board or a sticker, the same
 * whoever drags it. When someone else in the room drags, their preview moves the same way and adds their outline and
 * name. Design only for now: the canvas's own drags (`layer-drag.ts`) don't use it yet.
 *
 * - Picking up: what's picked up grows 3% and lifts onto a shadow, in 120 ms (`DragLift`).
 * - Carrying: it follows the pointer exactly. From a layout, a picture of it is carried (`DragPicture`) while a faded
 *   copy shows where it would land (`LandingSpot`), and the layout makes room as it will.
 * - Dropping: the picture flies from the pointer into its landing spot and settles, in 180 ms.
 * - Cancelling, with Esc: it flies back to where it was, a little slower, in 260 ms, so it reads as going back.
 */

/** Where a drag is: being carried, flying into where it lands, or flying back to where it was. */
export type DragPhase = "carrying" | "dropping" | "cancelling"

/** How long a dropped picture takes to fly into its landing spot. */
export const dropMs = 180

/** How long a cancelled drag takes to fly back to where it was. */
export const cancelMs = 260

/** How lifted things settle: quick to start, gentle to land. */
export const settle = "cubic-bezier(0.2, 0, 0, 1)"
