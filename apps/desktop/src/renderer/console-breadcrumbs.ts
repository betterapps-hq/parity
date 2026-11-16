/**
 * Whether a console call came from the project's code rather than Parity's (PAR-814). A project's components run in the
 * editor window and the offscreen ones, loaded from its builder's origin, so a stack with a frame from any other web
 * origin than the page's has the project's code in it. What the project logs is the project's, so it isn't sent.
 */
export function loggedByProject(stack: string, pageOrigin: string): boolean {
  for (const [url] of stack.matchAll(/https?:\/\/[^\s)]+/g)) {
    if (!url.startsWith(`${pageOrigin}/`)) {
      return true
    }
  }

  return false
}

/** The stack of the console call being recorded, with room for Sentry's own frames above the caller's. */
export function consoleCallStack(): string {
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = 50

  try {
    return new Error("console").stack ?? ""
  } finally {
    Error.stackTraceLimit = limit
  }
}
