import { z } from "zod"

/** What a secret is replaced with. */
export const redacted = "[redacted]"

export interface ScrubOptions {
  /**
   * Values that are secret wherever they appear, such as the open project's `.env` values from `envSecrets`. Values
   * under 8 characters are ignored, since replacing `true` or `3000` everywhere would hide more than it protects.
   */
  secrets?: Iterable<string>
}

/** Replaces secrets and leaves everything else as written. */
export interface Scrubber {
  /** The text with each secret in it replaced by `[redacted]`. */
  text(text: string): string
  /**
   * A copy of the value with every string in it scrubbed, and the whole value of a field whose name says it holds a
   * secret, such as `password` or `accessToken`. Plain objects and arrays are copied; an `Error` becomes a copy of its
   * class with its message, stack and fields scrubbed. Other objects, such as dates and byte arrays, are kept as they
   * are. A Sentry event, breadcrumb or log goes through it whole, stack frames included.
   */
  value<T>(value: T): T
}

/** The shortest secret given by value that's replaced. */
const shortestSecret = 8

/**
 * Keys and tokens with a known shape. Each is replaced whole, since its prefix says only what kind of key leaked.
 * Private key blocks come first, as their body would otherwise be read as several long random strings.
 */
const keyPatterns: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  // JSON Web Tokens: a header and a payload, both base64url JSON objects, and a signature.
  /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+/g,
  // OpenAI, Anthropic and others: sk-…, sk-proj-…, sk-ant-api03-….
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  // Stripe's secret and restricted keys.
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g,
  // GitHub's personal, OAuth, user-to-server, server-to-server and refresh tokens, and fine-grained ones.
  /\bgh[oprsu]_[A-Za-z0-9]{36,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,}/g,
  // Slack's bot, user, app and refresh tokens.
  /\bxox[abeoprs]-[A-Za-z0-9-]{10,}/g,
  // AWS access key IDs, long-lived and temporary.
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bAIza[A-Za-z0-9_-]{35}/g,
  /\bnpm_[A-Za-z0-9]{36}\b/g,
  /\bsntr[sy]s_[A-Za-z0-9+/=_-]{20,}/g
]

/** `Bearer` and the token after it, in a header or a message. The word stays, so it's clear what was there. */
const bearer = /\b(Bearer\s+)(?!\[redacted\])[A-Za-z0-9._~+/=-]{8,}/gi

/** The password in a URL's `user:password@`. The scheme, the user and the host stay. */
const urlCredentials = /\b([a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)(?!\[redacted\])[^\s/@]+@/gi

/**
 * A name and its value in text, as `.env` lines, query strings, JSON and messages write them: `API_KEY=…`,
 * `?access_token=…`, `"password": "…"`, `secret: …`. The value is replaced when the name says it's secret.
 */
const namedValueStart = /(["']?)([A-Za-z_][A-Za-z0-9_.-]*)\1\s*[:=]\s*/g

/** The value after a name: quoted, or up to a space or the punctuation that ends one in a URL, JSON or a list. */
const valueAt = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|[^\s&,;"'<>(){}[\]]+/y

/** Runs of characters a random key is written in: base64, base64url and hex. */
const randomRun = /[A-Za-z0-9+/_=-]{32,}/g

/** Hex with or without dashes: hashes, commit SHAs, UUIDs and trace IDs, which are never secret on their own. */
const hex = /^[0-9a-fA-F-]+$/

/** A file name's extension after a run, as content hashes in file names have. */
const extension = /^\.[A-Za-z0-9]{1,5}\b/

/**
 * The most of a run that may be in lowercase words of 4 letters or more for it to count as random. Paths and
 * identifiers, such as `useHighlightedCodeForComponentPreview2`, are half words or more; a random 32-character key is
 * under this 99 times in 100.
 */
const randomWordShare = 0.4

/** The fewest bits per character a random run has, so `AAAABBBB1111…` isn't one. Random keys have 4 or more. */
const randomEntropy = 3.5

/** Prefixes that make a name ending in `token` a credential. A bare `token` is Parity's design token. */
const credentialTokenPrefixes = new Set([
  "access",
  "api",
  "auth",
  "bearer",
  "bot",
  "client",
  "csrf",
  "github",
  "id",
  "jwt",
  "npm",
  "oauth",
  "personal",
  "private",
  "refresh",
  "secret",
  "security",
  "sentry",
  "session",
  "slack",
  "xsrf"
])

/** Whether a field or variable of this name holds a secret, so its whole value is replaced. */
export function isSecretName(name: string): boolean {
  // `GITHUB_TOKEN`, `STRIPE_KEY`, `DB_PASSWORD`: an environment variable's name says what it holds.
  if (/^[A-Z0-9_]+$/.test(name) && /(?:^|_)(?:TOKEN|KEY|SECRET|PASSWORD|PASSWD|CREDENTIALS?)$/.test(name)) {
    return true
  }

  const normal = name.toLowerCase().replace(/[^a-z0-9]/g, "")

  if (/password|passwd|passphrase|secret|apikey|accesskey|privatekey|credential|authorization|cookie/.test(normal)) {
    return true
  }

  if (normal === "auth") {
    return true
  }

  const token = /^(.+?)tokens?$/.exec(normal)

  return token !== null && credentialTokenPrefixes.has(token[1] ?? "")
}

/** Shannon entropy in bits per character. */
function entropyOf(text: string): number {
  const counts = new Map<string, number>()

  for (const character of text) {
    counts.set(character, (counts.get(character) ?? 0) + 1)
  }

  let bits = 0

  for (const count of counts.values()) {
    const share = count / text.length
    bits -= share * Math.log2(share)
  }

  return bits
}

/**
 * Whether a run looks like a random key rather than a word, path, hash or picture: upper and lower case letters and
 * digits, mostly not in words. Hex is left alone, as are runs in a file name or a `data:` URL's base64.
 */
function isRandom(run: string, before: string, after: string): boolean {
  if (hex.test(run)) {
    return false
  }

  if (before.endsWith("base64,") || extension.test(after)) {
    return false
  }

  if (!/[a-z]/.test(run) || !/[A-Z]/.test(run) || !/[0-9]/.test(run)) {
    return false
  }

  const inWords = (run.match(/[a-z]{4,}/g) ?? []).join("").length

  return inWords / run.length < randomWordShare && entropyOf(run) >= randomEntropy
}

/**
 * The text with the value after each secret name replaced. A name that isn't secret leaves its value to be read
 * again, so `https://example.com/?access_token=…` still finds `access_token` after `https:`.
 */
function redactNamedValues(input: string): string {
  let output = ""
  let last = 0

  for (const match of input.matchAll(namedValueStart)) {
    const [start, , name = ""] = match

    if (match.index < last || !isSecretName(name)) {
      continue
    }

    const valueStart = match.index + start.length
    valueAt.lastIndex = valueStart
    const value = valueAt.exec(input)?.[0]

    if (value === undefined || value.startsWith(redacted)) {
      continue
    }

    const quote = value.startsWith('"') || value.startsWith("'") ? value.charAt(0) : ""
    output += `${input.slice(last, valueStart)}${quote}${redacted}${quote}`
    last = valueStart + value.length
  }

  return output + input.slice(last)
}

/** An error's field, when it's text. */
const errorText = z.string()

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** A plain object as the scrubber finds it, whose fields can hold anything. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the scrubber walks any value an event or Sentry holds, so a field can be anything
type PlainObject = Record<string, unknown>

function isPlainObject(value: unknown): value is PlainObject {
  const prototype: unknown = Object.getPrototypeOf(value)

  return prototype === Object.prototype || prototype === null
}

/**
 * A scrubber for every event before it leaves a process: `createTelemetry` runs one on each event's attributes before
 * its sinks, and the app's and the CLI's Sentry hooks run one on what Sentry sends (decisions.md, "Secrets are scrubbed
 * before any event leaves a process").
 */
export function createScrubber(options: ScrubOptions = {}): Scrubber {
  const secrets = [...new Set(options.secrets ?? [])].filter((secret) => secret.length >= shortestSecret)
  // Longest first, so a value containing another is replaced whole.
  secrets.sort((a, b) => b.length - a.length)
  const given = secrets.length > 0 ? new RegExp(secrets.map(escapeForRegExp).join("|"), "g") : undefined

  function text(input: string): string {
    let output = given ? input.replace(given, redacted) : input

    for (const pattern of keyPatterns) {
      output = output.replace(pattern, redacted)
    }

    output = output.replace(bearer, `$1${redacted}`)
    output = output.replace(urlCredentials, `$1${redacted}@`)
    output = redactNamedValues(output)

    return output.replace(randomRun, (run, offset: number, whole: string) => {
      const before = whole.slice(Math.max(0, offset - 7), offset)
      const after = whole.slice(offset + run.length, offset + run.length + 7)

      return isRandom(run, before, after) ? redacted : run
    })
  }

  function value<T>(input: T): T {
    const seen = new WeakMap<object, unknown>()

    // oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- walks any value an event or Sentry holds, whatever each part is
    function scrub(item: unknown): unknown {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the walk takes any value, and text is the one kind it changes
      if (typeof item === "string") {
        return text(item)
      }

      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the walk takes any value, and only objects have parts to walk
      if (typeof item !== "object" || item === null) {
        return item
      }

      const done = seen.get(item)

      if (done !== undefined) {
        return done
      }

      if (Array.isArray(item)) {
        return scrubArray(item)
      }

      if (item instanceof Error) {
        return scrubError(item)
      }

      return isPlainObject(item) ? scrubObject(item) : item
    }

    function scrubArray(item: readonly unknown[]): unknown[] {
      const copy: unknown[] = []
      seen.set(item, copy)

      for (const element of item) {
        copy.push(scrub(element))
      }

      return copy
    }

    function scrubError(item: Error): Error {
      const copy: Error = Object.create(Object.getPrototypeOf(item))
      seen.set(item, copy)
      copyFields(item, copy)

      for (const field of ["name", "message", "stack"] as const) {
        // An error's own fields can hold anything at run time, whatever its type says.
        const own = errorText.safeParse(item[field])

        if (own.success) {
          Object.defineProperty(copy, field, { value: text(own.data), writable: true, configurable: true })
        }
      }

      if (item.cause !== undefined) {
        Object.defineProperty(copy, "cause", { value: scrub(item.cause), writable: true, configurable: true })
      }

      return copy
    }

    function scrubObject(item: PlainObject): PlainObject {
      const copy: PlainObject = {}
      seen.set(item, copy)

      return copyFields(item, copy)
    }

    /** Copies each field, scrubbed, from `from` to `to`, and gives `to` back. */
    function copyFields<To extends Error | PlainObject>(from: Error | PlainObject, to: To): To {
      for (const [name, field] of Object.entries(from)) {
        const secret = isSecretName(name) && field !== null && field !== undefined && field !== true && field !== false

        Object.defineProperty(to, name, {
          value: secret ? redacted : scrub(field),
          writable: true,
          enumerable: true,
          configurable: true
        })
      }

      return to
    }

    // SAFETY: `scrub` gives back what it's given with only strings changed, so the copy has the input's type.
    return scrub(input) as T
  }

  return { text, value }
}

/**
 * The values in a `.env` file worth scrubbing: every value 8 characters or longer that isn't a number or `true` or
 * `false`. It reads `KEY=value`, `export KEY=value`, quoted values and `#` comments, as dotenv does.
 */
export function envSecrets(file: string): string[] {
  const values: string[] = []

  for (const line of file.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=\s*(.*)$/.exec(line)

    if (!match) {
      continue
    }

    let raw = (match[1] ?? "").trim()
    const quote = raw.charAt(0)

    if ((quote === '"' || quote === "'" || quote === "`") && raw.indexOf(quote, 1) > 0) {
      raw = raw.slice(1, raw.indexOf(quote, 1))
    } else {
      raw = raw.replace(/\s+#.*$/, "")
    }

    if (raw.length < shortestSecret || /^(?:-?\d+(?:\.\d+)?|true|false)$/i.test(raw)) {
      continue
    }

    values.push(raw)
  }

  return values
}
