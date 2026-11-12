import type { CssDeclaration } from "@parity-app/style"
import type { LoadedGuest } from "./guest.ts"
import { request } from "./service.ts"

/**
 * The classes a project's styling framework writes for its frames' layers (PAR-942). In a Tailwind project a frame
 * draws a layer with the classes Parity will write for it in code, compiled by the project's own Tailwind, so the
 * canvas has the code's cascade. The service holds the compiler, so a frame asks: until the answer comes, and for a
 * layer with a declaration the framework has no class for, the frame draws its own rule for the node, which draws the
 * same declarations.
 */
export interface FrameClasses {
  /**
   * The classes that draw a layer's declarations, once the framework has written every one of them. Until then it
   * gives nothing, asks the service for the ones it hasn't seen, and tells `subscribe`'s listeners when they come.
   */
  classesFor: (declarations: readonly CssDeclaration[]) => string[] | undefined
  /** Every class written so far, compiled, for the project's frames to adopt after its own styles. */
  sheet: CSSStyleSheet
  /** Goes up each time classes arrive, so a frame knows to draw with them. */
  revision: () => number
  subscribe: (listener: () => void) => () => void
}

const byGuest = new WeakMap<LoadedGuest, FrameClasses>()

/**
 * A project's frame classes, for the guest its frames are drawn with now: a guest loaded again, as when the project's
 * stylesheets change, starts with none, since its classes may mean something else.
 */
export function frameClasses(projectId: string, loaded: LoadedGuest): FrameClasses {
  let classes = byGuest.get(loaded)

  if (!classes) {
    classes = askingFrameClasses(loaded, (declarations, written) =>
      request("styles.classes", { projectId, declarations, written })
    )
    byGuest.set(loaded, classes)
  }

  return classes
}

/** What `styles.classes` answers. */
type Written = Awaited<ReturnType<typeof request<"styles.classes">>>

const keyOf = ({ property, value, when }: CssDeclaration) =>
  JSON.stringify([property, value, when?.state, when?.viewport, when?.theme])

/**
 * Frame classes that ask `write` for the declarations they haven't seen, a task's worth at a time, with the classes
 * they already hold, which are compiled again with the new ones. One ask waits for the one before it, since each
 * answer's stylesheet replaces the last: two at once would each name only the classes held before both, and the answer
 * that came second would drop the classes the first one wrote (PAR-962).
 */
export function askingFrameClasses(
  loaded: Pick<LoadedGuest, "prepare">,
  write: (declarations: CssDeclaration[], written: string[]) => Promise<Written>
): FrameClasses {
  /** Each declaration's classes, or null for one the framework has no class for. */
  const known = new Map<string, string[] | null>()
  const asking = new Map<string, CssDeclaration>()
  const listeners = new Set<() => void>()
  const sheet = new CSSStyleSheet()
  // Tailwind's `@property` rules, which a shadow root ignores, so the document takes them.
  const registrations = new CSSStyleSheet()
  let revision = 0
  let unsupported = false
  let scheduled = false
  let asked = Promise.resolve()

  async function ask(): Promise<void> {
    scheduled = false
    const batch = [...asking.values()]
    asking.clear()

    try {
      const held = new Set([...known.values()].flatMap((names) => names ?? []))
      const written = await write(batch, [...held])

      if (!written.supported) {
        unsupported = true

        return
      }

      const { scoped, global } = loaded.prepare(written.css)
      sheet.replaceSync(scoped)

      if (global !== "") {
        registrations.replaceSync(global)

        if (!document.adoptedStyleSheets.includes(registrations)) {
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, registrations]
        }
      }

      for (const [index, declaration] of batch.entries()) {
        known.set(keyOf(declaration), written.classes[index] ?? null)
      }

      revision++

      for (const listener of listeners) {
        listener()
      }
    } catch {
      // These layers go on drawing from their rules, which draw the same declarations, so there's nothing to tell the
      // person; the request recorded its own failure. Declarations asked for later are tried afresh.
      for (const declaration of batch) {
        known.set(keyOf(declaration), null)
      }
    }
  }

  return {
    classesFor(declarations) {
      if (unsupported) {
        return undefined
      }

      const classes = new Set<string>()
      let missing = false

      for (const declaration of declarations) {
        const key = keyOf(declaration)
        const written = known.get(key)

        if (written === undefined) {
          asking.set(key, declaration)
          missing = true
        } else if (written === null) {
          return undefined
        } else {
          for (const name of written) {
            classes.add(name)
          }
        }
      }

      if (asking.size > 0 && !scheduled) {
        scheduled = true
        setTimeout(() => {
          asked = asked.then(ask)
        })
      }

      return missing ? undefined : [...classes]
    },
    sheet,
    revision: () => revision,
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    }
  }
}
