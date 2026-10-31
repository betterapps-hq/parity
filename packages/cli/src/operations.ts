import type {
  AccessibilityResponse,
  ComponentsResponse,
  ConsoleResponse,
  ProblemsResponse,
  PropsResponse,
  TokenInfo
} from "./client.ts"
import { type ExecResponse, executionFailed } from "./execute.ts"

interface Field {
  schema: Record<string, unknown>
  required?: boolean
  read(value: unknown, name: string): unknown
}

function text(description: string, required = false, fallback?: string): Field {
  return {
    schema: {
      type: "string",
      minLength: 1,
      pattern: "\\S",
      description,
      ...(fallback === undefined ? {} : { default: fallback })
    },
    required,
    read(value, name) {
      if (value === undefined && !required) return fallback
      if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a nonblank string`)
      return value
    }
  }
}
function boolean(description: string): Field {
  return {
    schema: { type: "boolean", default: false, description },
    read(value, name) {
      if (value === undefined) return false
      if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`)
      return value
    }
  }
}
function selector(description: string, fallback?: string): Field {
  const item = { type: "string", minLength: 1, pattern: "\\S" }
  return {
    schema: {
      oneOf: [item, { type: "array", minItems: 1, items: item }],
      description,
      ...(fallback ? { default: fallback } : {})
    },
    read(value, name) {
      if (value === undefined) return fallback
      if (typeof value === "string" && value.trim()) return value
      if (Array.isArray(value) && value.length && value.every((item) => typeof item === "string" && item.trim())) {
        return value.length === 1 ? value[0] : value
      }
      throw new Error(`${name} must be a nonblank string or a nonempty list of nonblank strings`)
    }
  }
}
const tab = text("Tab id, project root or name. Defaults to the active tab.")
const design = text("Design id or name.", true)
const scale: Field = {
  schema: { type: "number", minimum: 0.25, maximum: 3, default: 1, description: "Pixel density." },
  read(value) {
    if (value === undefined) return 1
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0.25 || value > 3) {
      throw new Error("scale must be a finite number from 0.25 to 3")
    }
    return value
  }
}
const rootText = text("Absolute project folder path.", true)
const absoluteRoot = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/
const root: Field = {
  ...rootText,
  schema: { ...rootText.schema, pattern: absoluteRoot.source },
  read(value) {
    const path = rootText.read(value, "root")
    if (typeof path !== "string" || !absoluteRoot.test(path)) {
      throw new Error("root must be an absolute project folder path")
    }
    return path
  }
}

/** The adapters share these contracts; they only parse their syntax and format results. */
export interface Operation<Result> {
  inputSchema: Record<string, unknown>
  run(
    input: Record<string, unknown>,
    send: <T>(method: string, params: Record<string, unknown>) => Promise<T>
  ): Promise<Result>
  failed(result: Result): boolean
}
function fieldsContract(fields: Record<string, Field>) {
  return {
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.schema])),
      required: Object.entries(fields)
        .filter(([, field]) => field.required)
        .map(([key]) => key)
    },
    request(input: Record<string, unknown>): Record<string, unknown> {
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("Operation input must be an object")
      for (const key of Object.keys(input))
        if (!Object.hasOwn(fields, key)) throw new Error(`Unknown input field ${key}`)
      const result: Record<string, unknown> = {}
      for (const [key, field] of Object.entries(fields)) {
        const value = field.read(input[key], key)
        if (value !== undefined) result[key] = value
      }
      return result
    }
  }
}
function operation<Result>(
  method: string,
  fields: Record<string, Field>,
  failed: (result: Result) => boolean = () => false
): Operation<Result> {
  const contract = fieldsContract(fields)
  return {
    inputSchema: contract.inputSchema,
    run: (input, send) => send<Result>(method, contract.request(input)),
    failed
  }
}
const checks = {
  tab,
  design,
  state: selector('State id, list of ids, or "all".', "all"),
  mode: selector('Mode id, list of ids, "shown" or "all".', "shown")
}

export const operations = {
  tabs: operation<unknown>("tabs", {}),
  state: operation<unknown>("state", { tab }),
  open: operation<unknown>("open", { root }),
  screenshot: operation<ExecResponse>(
    "screenshot",
    {
      tab,
      design,
      scale,
      state: selector('State id, list of ids, or "all". Defaults to the state the design shows.'),
      mode: selector('Mode id, list of ids, "shown" or "all". Defaults to the primary mode.')
    },
    executionFailed
  ),
  problems: operation<ProblemsResponse>("problems", checks, (result) => result.problems.length > 0),
  accessibility: operation<AccessibilityResponse>("accessibility", checks, (result) => result.findings.length > 0),
  console: operation<ConsoleResponse>("console", { tab, clear: boolean("Empty the console after reading.") }),
  tokens: operation<TokenInfo[]>("tokens", {
    tab,
    category: text("Token category."),
    source: text("Token source, such as semantic or theme."),
    search: {
      schema: { type: "string", description: "Token name search." },
      read(value) {
        if (value !== undefined && typeof value !== "string") throw new Error("search must be a string")
        return value
      }
    }
  }),
  components: operation<ComponentsResponse>("components", { tab }),
  props: operation<PropsResponse>("props", {
    tab,
    component: text("Component id or name.", true),
    all: boolean("Include passed-through attributes.")
  })
}

const skill = fieldsContract({ path: text("Skill file to read.", false, "SKILL.md") })
export const skillOperation = {
  inputSchema: skill.inputSchema,
  async run(input: Record<string, unknown>, read: (path: string) => Promise<string>): Promise<string> {
    const { path } = skill.request(input)
    if (typeof path !== "string") throw new Error("path must be a nonblank string")
    return read(path)
  }
}
