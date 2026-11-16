import { callerOrigin } from "@parity-app/core"

/**
 * The boundary between a project's code and Parity's window itself (PAR-1207), beside the one for its stylesheets in
 * `page-styles.ts`. A project's code runs in Parity's page, so it can reach what belongs to Parity's window: its
 * development client reloads the window when its server restarts, and a theme toggle sets `dark` on the page's `<html>`,
 * where Parity keeps its own theme. Whatever does it, code served from another origin than Parity's can't reload or
 * leave the window, nor change Parity's `<html>` or `<body>`: their attributes, classes and inline styles. No extension
 * needs to know.
 *
 * What a project's code does to them is dropped, not moved into its frames: a frame's body takes its classes and
 * attributes from the frame's modes, such as a theme mode's `dark`, which a toggle would otherwise override in every
 * frame. Changes through `dataset` aren't caught.
 */

let installed = false

/** Code that wrapped methods are called by, as the stack holds it. */
type Wrapper = (...args: never[]) => void

/** Parity's `<html>` and `<body>`, and their class lists and inline styles: what a project's code can't change. */
const kept = new WeakSet<Kept>()

/** What of Parity's `<html>` and `<body>` is kept: the elements, their class lists and their inline styles. */
type Kept = Element | DOMTokenList | CSSStyleDeclaration

/** Each origin and kind of change already logged, so a theme toggle clicked again isn't logged again. */
const logged = new Set<string>()

/** Keeps other origins' code from reloading Parity's window or changing its root. Once per page; later calls do nothing. */
export function guardWindow(): void {
  if (installed) {
    return
  }

  installed = true

  for (const element of [document.documentElement, document.body]) {
    kept.add(element)
    kept.add(element.classList)
    kept.add(element.style)
  }

  addEventListener("beforeunload", keepWindow)
  guardAttributes()
  guardClassList()
  guardStyle()
}

/**
 * Cancels an unload that another origin's code started, as a builder's development client reloading the window. An
 * unload runs this in the same call as the `location.reload()` or navigation that started it, so that code is on the
 * stack. Parity's own reloads, and closing or reloading the window from its menu, which no page code starts, go ahead.
 * Electron cancels it without asking.
 *
 * Any frame of another origin's counts, not only the first: what calls a listener can be Parity's own code in between,
 * as Sentry wraps every listener the page adds.
 */
function keepWindow(event: BeforeUnloadEvent): void {
  const holder = { stack: "" }
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = 50
  Error.captureStackTrace(holder, keepWindow)
  Error.stackTraceLimit = limit

  const outside = holder.stack
    .split("\n")
    .filter((line) => !line.includes(`${location.origin}/`))
    .join("\n")

  const origin = callerOrigin(outside, location.origin)

  if (origin) {
    event.preventDefault()
    tellOnce(origin, "reload", `Kept Parity's window open: code from ${origin} tried to reload or leave it.`)
  }
}

/**
 * The origin of the code that called `wrapper`, when it's another origin's than Parity's: the first frame below
 * `wrapper` with an address.
 */
function callerOf(wrapper: Wrapper): string | undefined {
  const holder = { stack: "" }
  Error.captureStackTrace(holder, wrapper)

  return callerOrigin(holder.stack, location.origin)
}

/** Whether a change to `target`, one of Parity's, by whatever called `wrapper`, is dropped, telling the log once. */
function dropped(target: Kept, wrapper: Wrapper, what: string): boolean {
  if (!kept.has(target)) {
    return false
  }

  const origin = callerOf(wrapper)

  if (origin) {
    tellOnce(origin, what, `Kept Parity's window as it was: code from ${origin} changed its root's ${what}.`)
  }

  return origin !== undefined
}

function tellOnce(origin: string, what: string, message: string): void {
  const key = `${origin} ${what}`

  if (!logged.has(key)) {
    logged.add(key)
    console.warn(`[window] ${message}`)
  }
}

/** `setAttribute` and the rest on Parity's `<html>` and `<body>`, and `className`. */
function guardAttributes(): void {
  const prototype = Element.prototype
  const original = Object.getOwnPropertyDescriptors(prototype)
  const setAttribute = original.setAttribute.value!
  const setAttributeNS = original.setAttributeNS.value!
  const removeAttribute = original.removeAttribute.value!
  const removeAttributeNS = original.removeAttributeNS.value!
  const toggleAttribute = original.toggleAttribute.value!
  const setClassName = original.className.set!

  const set = function (this: Element, name: string, value: string): void {
    if (!dropped(this, set, "attributes")) {
      setAttribute.call(this, name, value)
    }
  }

  const setNS = function (this: Element, namespace: string | null, name: string, value: string): void {
    if (!dropped(this, setNS, "attributes")) {
      setAttributeNS.call(this, namespace, name, value)
    }
  }

  const remove = function (this: Element, name: string): void {
    if (!dropped(this, remove, "attributes")) {
      removeAttribute.call(this, name)
    }
  }

  const removeNS = function (this: Element, namespace: string | null, name: string): void {
    if (!dropped(this, removeNS, "attributes")) {
      removeAttributeNS.call(this, namespace, name)
    }
  }

  // It answers as if it had toggled, so the project's code goes on as it would.
  const toggle = function (this: Element, name: string, force?: boolean): boolean {
    return dropped(this, toggle, "attributes")
      ? (force ?? !this.hasAttribute(name))
      : toggleAttribute.call(this, name, force)
  }

  const setName = function (this: Element, value: string): void {
    if (!dropped(this, setName, "class")) {
      setClassName.call(this, value)
    }
  }

  prototype.setAttribute = set
  prototype.setAttributeNS = setNS
  prototype.removeAttribute = remove
  prototype.removeAttributeNS = removeNS
  prototype.toggleAttribute = toggle
  Object.defineProperty(prototype, "className", { ...original.className, set: setName })
}

/** `classList` on Parity's `<html>` and `<body>`, which theme toggles change. */
function guardClassList(): void {
  const prototype = DOMTokenList.prototype
  const original = Object.getOwnPropertyDescriptors(prototype)
  const add = original.add.value!
  const remove = original.remove.value!
  const toggle = original.toggle.value!
  const replace = original.replace.value!

  const added = function (this: DOMTokenList, ...tokens: string[]): void {
    if (!dropped(this, added, "class")) {
      add.apply(this, tokens)
    }
  }

  const removed = function (this: DOMTokenList, ...tokens: string[]): void {
    if (!dropped(this, removed, "class")) {
      remove.apply(this, tokens)
    }
  }

  // These answer as if they'd changed it, so the project's code goes on as it would.
  const toggled = function (this: DOMTokenList, token: string, force?: boolean): boolean {
    return dropped(this, toggled, "class") ? (force ?? !this.contains(token)) : toggle.call(this, token, force)
  }

  const replaced = function (this: DOMTokenList, token: string, newToken: string): boolean {
    return dropped(this, replaced, "class") ? this.contains(token) : replace.call(this, token, newToken)
  }

  prototype.add = added
  prototype.remove = removed
  prototype.toggle = toggled
  prototype.replace = replaced
}

/**
 * Inline styles on Parity's `<html>` and `<body>`: `setProperty`, `removeProperty` and each property set by name, as
 * `style.colorScheme`, which a theme toggle sets, or `style.overflow`, which a scroll lock sets. Chrome sets a property
 * by name without a setter to wrap, so their `style` is a proxy that drops what another origin's code sets through it.
 */
function guardStyle(): void {
  const prototype = CSSStyleDeclaration.prototype
  const original = Object.getOwnPropertyDescriptors(prototype)
  const setProperty = original.setProperty.value!
  const removeProperty = original.removeProperty.value!

  const set = function (this: CSSStyleDeclaration, property: string, value: string | null, priority?: string): void {
    if (!dropped(this, set, "style")) {
      setProperty.call(this, property, value, priority)
    }
  }

  // It answers with the value it would have taken out.
  const remove = function (this: CSSStyleDeclaration, property: string): string {
    return dropped(this, remove, "style") ? this.getPropertyValue(property) : removeProperty.call(this, property)
  }

  prototype.setProperty = set
  prototype.removeProperty = remove

  const elementStyle = Object.getOwnPropertyDescriptors(HTMLElement.prototype).style
  const getStyle = elementStyle.get!
  const proxies = new WeakMap<CSSStyleDeclaration, CSSStyleDeclaration>()

  const proxyFor = (style: CSSStyleDeclaration): CSSStyleDeclaration => {
    const made = proxies.get(style)

    if (made) {
      return made
    }

    const trap = (target: CSSStyleDeclaration, property: string | symbol, value: string): boolean => {
      if (!dropped(target, trap, "style")) {
        Reflect.set(target, property, value)
      }

      return true
    }

    const proxy = new Proxy(style, {
      set: trap,
      // Its methods are the style's own, called on it, not on the proxy.
      get(target, property) {
        // oxlint-disable-next-line anti-slop/no-reflect-get -- a proxy passes on whatever is read from the style, by name
        const value: unknown = Reflect.get(target, property)

        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a method read through the proxy is called on the style
        return typeof value === "function" ? value.bind(target) : value
      }
    })

    proxies.set(style, proxy)

    return proxy
  }

  const getter = function (this: HTMLElement): CSSStyleDeclaration {
    const style = getStyle.call(this)

    return kept.has(this) ? proxyFor(style) : style
  }

  Object.defineProperty(HTMLElement.prototype, "style", { ...elementStyle, get: getter })
}
