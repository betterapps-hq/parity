/**
 * Common system failures in plain words, by the code Node and the browser give them. Each says what a person can act
 * on, never the code itself.
 */
const byCode: Record<string, string> = {
  EACCES: "Parity doesn't have permission.",
  EPERM: "Parity doesn't have permission.",
  EROFS: "The disk is read-only.",
  ENOSPC: "The disk is full.",
  EDQUOT: "The disk is full.",
  EBUSY: "Another app has the file open.",
  ENOENT: "The file or folder is gone.",
  ENOTDIR: "The folder is gone.",
  EEXIST: "Something with that name is already there.",
  ENAMETOOLONG: "The name is too long.",
  EADDRINUSE: "Another app is using the port.",
  ECONNREFUSED: "Parity couldn't connect.",
  ECONNRESET: "The connection dropped.",
  ETIMEDOUT: "The connection timed out.",
  ENOTFOUND: "Parity couldn't connect.",
  EAI_AGAIN: "Parity couldn't connect."
}

/** Electron puts this before a message that crossed from the main process. */
const remotePrefix = /^Error invoking remote method '[^']+': (?:\w*Error: )?/

/**
 * Why something failed, in a sentence a person can read: a known system failure in plain words, or else the error's
 * own message, without Electron's prefix and ending in a period. `undefined` when there's nothing to say.
 */
export function plainReason(error: unknown): string | undefined {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : undefined
  let text: string | undefined
  if (error instanceof Error) text = error.message
  else if (typeof error === "string") text = error
  if (code && byCode[code]) return byCode[code]
  if (!text) return undefined
  text = text.replace(remotePrefix, "").trim()
  const coded = /^(E[A-Z_]+)\b/.exec(text)?.[1] ?? /\b(E[A-Z]{3,})\b/.exec(text)?.[1]
  if (coded && byCode[coded]) return byCode[coded]
  if (/^(?:TypeError: )?fetch failed$|^Failed to fetch$/i.test(text)) return "Parity couldn't connect."
  if (!text) return undefined
  const sentence = text[0]!.toUpperCase() + text.slice(1)
  return /[.!?…]$/.test(sentence) ? sentence : `${sentence}.`
}
