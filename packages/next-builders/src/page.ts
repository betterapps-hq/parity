import { z } from "zod"
import { guestModuleFile } from "./guest-app.ts"

/*
 * What a page Next rendered for the guest app says: where its scripts and stylesheets are, and how the browser gets the
 * guest module, from the client reference in the page's React Server Components payload. Next writes that reference the
 * same way whichever bundler built the page: the module's id, then the chunks that hold it and what it imports.
 */

/** A page of the guest app, as its HTML says. */
export interface GuestPage {
  /** Its scripts, in the order the page loads them. */
  scripts: string[]
  /** Its stylesheets, in the order the page links them. */
  stylesheets: string[]
  /** The guest module's id and chunks, when the page is the guest's, or those of the client module `file` names. */
  guest?: { id: string; chunks: string[] }
}

/**
 * Reads a page Next rendered for the guest app: the guest's own, or, with `file`, the page of one of the guest app's
 * client modules, from the guest app's folder.
 */
export function readGuestPage(html: string, file: string = guestModuleFile): GuestPage {
  const tags = (pattern: RegExp) => [...html.matchAll(pattern)].map((match) => decodeEntities(match[1]!))
  const scripts = tags(/<script\b[^>]*?\bsrc="([^"]+)"/g)
  const stylesheets = tags(/<link\b[^>]*?\brel="stylesheet"[^>]*?\bhref="([^"]+)"/g)
  const guest = clientReference(payload(html), `/${file}`)

  return guest ? { scripts, stylesheets, guest } : { scripts, stylesheets }
}

/** A string Next pushes to `self.__next_f`, as the page writes it: a JSON string literal. */
const pushedString = z.string()

/** The page's React Server Components payload: the strings Next pushes to `self.__next_f`, joined. */
function payload(html: string): string {
  const chunks = html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)

  return [...chunks].map((match) => parsed(match[1]!, pushedString) ?? "").join("")
}

/** A client reference's row: the module's id, the chunks that hold it, and the export, with what Next adds after. */
const referenceRow = z.tuple([z.string(), z.array(z.string())]).rest(z.unknown())

/** A row of its own for a string the payload repeats, which others name as `$<row>`. */
const stringRow = z.string()

/**
 * The client reference to the module whose id names `file`: a row `<row>:I[<id>,[<chunks>],<export>]`. Turbopack's ids
 * are the module's path (`[project]/.next/parity/app/guest.tsx [app-client] (ecmascript)`), and so are webpack's in
 * development. Since Next.js 16.4 a string the payload repeats is a row of its own, which others name as `$<row>`.
 */
function clientReference(rsc: string, file: string): GuestPage["guest"] {
  const rows = new Map<string, string>()
  const references: z.output<typeof referenceRow>[] = []

  for (const line of rsc.split("\n")) {
    const row = /^([0-9a-f]+):(I?)([["].*)$/.exec(line)

    if (!row) {
      continue
    }

    if (row[2] === "I") {
      const reference = parsed(row[3]!, referenceRow)

      if (reference) {
        references.push(reference)
      }
    } else {
      const text = parsed(row[3]!, stringRow)

      if (text !== undefined) {
        rows.set(row[1]!, text)
      }
    }
  }

  const resolved = (text: string) => (/^\$[0-9a-f]+$/.test(text) ? rows.get(text.slice(1)) : text)

  for (const [rawId, rawChunks] of references) {
    const id = resolved(rawId)

    if (id?.includes(file)) {
      return { id, chunks: rawChunks.map(resolved).filter((chunk) => chunk !== undefined) }
    }
  }

  return undefined
}

/** The JSON `text` as `schema` reads it, or nothing when it isn't JSON or isn't what the schema expects. */
function parsed<T>(text: string, schema: z.ZodType<T>): T | undefined {
  try {
    const result = schema.safeParse(JSON.parse(text))

    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

function decodeEntities(text: string): string {
  return text.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#x27;", "'")
}
