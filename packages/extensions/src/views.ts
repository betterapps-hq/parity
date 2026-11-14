import type {
  Disposable,
  FormField,
  FormView,
  Parity,
  View,
  ViewData,
  ViewItem,
  ViewKind,
  ViewOptions
} from "@parity-app/extension-api"

/*
 * `parity.views` in an extension's host (PAR-1094): the tabs, sections and pages its manifest declares, each filled with
 * a view of the kind the manifest names. Each view keeps its items and options here and sends them whole.
 */

type FieldValue = string | number | boolean

/** A form's handlers, which a change the person makes goes to, after the form keeps it. */
export interface Form {
  handlers: Set<(key: string, value: FieldValue) => void>
  changed(key: string, value: FieldValue): void
}

/** Where a host sends its views' data. */
export interface ViewSink {
  send(id: string, data: ViewData): void
  clear(id: string): void
  reveal(id: string): Promise<void>
}

/**
 * `parity.views`: each view keeps its items and options, and sends them whole once the extension's code has finished
 * what it's doing, so a run of upserts goes as one message.
 */
export function viewsOf(
  declared: Readonly<Record<string, ViewKind>>,
  commands: ReadonlySet<string>,
  forms: Map<string, Form>,
  sink: ViewSink
): Parity["views"] {
  const filled = new Set<string>()

  const checkActions = (options: Partial<ViewOptions>) => {
    for (const action of [...(options.toolbar ?? []), ...(options.itemActions ?? [])]) {
      if (!commands.has(action.command)) {
        throw new Error(`${action.command} isn't a command the manifest declares`)
      }
    }
  }

  const make = <Item extends ViewItem | FormField, Options extends ViewOptions>(
    id: string,
    kind: ViewKind,
    options: Options
  ): View<Item, Options> => {
    const holds = declared[id]

    if (holds === undefined) {
      throw new Error(`${id} isn't a tab, section or page the manifest declares`)
    }

    if (holds !== kind) {
      throw new Error(`${id} holds a ${holds} view, not a ${kind}`)
    }

    if (filled.has(id)) {
      throw new Error(`${id} is filled already. Dispose of its view first.`)
    }

    checkActions(options)
    filled.add(id)
    const items = new Map<string, Item>()
    let current: Options = { ...options }
    let disposed = false
    let queued = false

    const flush = () => {
      queued = false

      if (!disposed) {
        sink.send(id, { kind, options: current, items: [...items.values()] })
      }
    }

    const changed = () => {
      if (!queued && !disposed) {
        queued = true
        queueMicrotask(flush)
      }
    }

    const list = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

    if (kind === "form") {
      const handlers = new Set<(key: string, value: FieldValue) => void>()

      forms.set(id, {
        handlers,
        changed(key, value) {
          const field = items.get(key)

          if (field && "type" in field) {
            // SAFETY: the window sends a value of the field's own type.
            items.set(key, { ...field, value } as Item)
            changed()
          }

          for (const handler of handlers) {
            handler(key, value)
          }
        }
      })
    }

    changed()

    return {
      set(next) {
        items.clear()

        for (const item of next) {
          items.set(item.key, item)
        }

        changed()
      },
      upsert(next) {
        for (const item of list(next)) {
          items.set(item.key, item)
        }

        changed()
      },
      remove(keys) {
        for (const key of list(keys)) {
          items.delete(key)
        }

        changed()
      },
      update(change) {
        checkActions(change)
        current = { ...current, ...change }
        changed()
      },
      reveal: () => sink.reveal(id),
      dispose() {
        if (!disposed) {
          disposed = true
          filled.delete(id)
          forms.delete(id)
          sink.clear(id)
        }
      }
    }
  }

  return {
    table: (id, options) => make(id, "table", options),
    tree: (id, options = {}) => make(id, "tree", options),
    list: (id, options = {}) => make(id, "list", options),
    keyValue: (id, options = {}) => make(id, "keyValue", options),
    form(id, options = {}): FormView {
      const view = make<FormField, ViewOptions>(id, "form", options)

      return {
        ...view,
        onChange(handler) {
          const form = forms.get(id)
          form?.handlers.add(handler)

          return once(() => form?.handlers.delete(handler))
        }
      }
    }
  }
}

/** A disposable that runs `dispose` the first time only. */
function once(dispose: () => void): Disposable {
  let done = false

  return {
    dispose() {
      if (!done) {
        done = true
        dispose()
      }
    }
  }
}
