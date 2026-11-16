import type { PreviewGlobal } from "@parity-app/core"
import ts from "typescript"
import { z } from "zod"

/** A value read from a preview's source: JSON, or `undefined` where the source computes it as it runs. */
type Literal = string | number | boolean | null | Literal[] | { [key: string]: Literal } | undefined

/** How many names deep a value is followed to the declaration that holds it. */
const nameLimit = 8

/**
 * The globals a preview file declares in `globalTypes`, as Storybook's toolbar lists them, read from its source without
 * running it (PAR-105). The exports can be named or the default export's properties, and the default export can be an
 * object, a `const` holding one, or what `definePreview` is given. A global's options are its toolbar's `items`, as
 * strings or `{ value, title }`; a global without items, or one its file computes as it runs, is passed over. Each
 * starts at its `initialGlobals` value, else its `defaultValue`.
 */
export function readPreviewGlobals(path: string, text: string): PreviewGlobal[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path))
  const declared = new Map<string, ts.Expression>()
  const exported = new Map<string, ts.Expression>()
  let defaultExport: ts.Expression | undefined

  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      const isExported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)

      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          declared.set(declaration.name.text, declaration.initializer)

          if (isExported) {
            exported.set(declaration.name.text, declaration.initializer)
          }
        }
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      defaultExport = statement.expression
    }
  }

  const literal = (node: ts.Expression | undefined, depth = 0): Literal => evaluate(node, declared, depth)

  const fromDefault = (name: string): Literal => {
    const preview = record.safeParse(literal(previewObject(defaultExport, declared)))

    return preview.success ? preview.data[name] : undefined
  }

  const types = record.safeParse(literal(exported.get("globalTypes")) ?? fromDefault("globalTypes"))
  const initial = record.catch({}).parse(literal(exported.get("initialGlobals")) ?? fromDefault("initialGlobals"))

  if (!types.success) {
    return []
  }

  return Object.entries(types.data).flatMap(([id, value]): PreviewGlobal[] => {
    const type = globalType.safeParse(value)

    if (!type.success) {
      return []
    }

    const { toolbar } = type.data

    const options = toolbar.items.flatMap((each) => {
      const parsed = toolbarItem.safeParse(each)

      return parsed.success ? [parsed.data] : []
    })

    if (options.length === 0) {
      return []
    }

    return [
      {
        id,
        name: toolbar.title ?? type.data.name ?? type.data.description,
        options,
        initial: optionalWord.parse(initial[id]) ?? type.data.defaultValue
      }
    ]
  })
}

/** The object a default export holds: written there, in a `const` it names, or given to `definePreview`. */
function previewObject(
  node: ts.Expression | undefined,
  declared: Map<string, ts.Expression>
): ts.Expression | undefined {
  let current = node

  for (let depth = 0; current && depth < nameLimit; depth++) {
    current = unwrapped(current)

    if (ts.isIdentifier(current)) {
      current = declared.get(current.text)
    } else if (ts.isCallExpression(current)) {
      current = current.arguments[0]
    } else {
      return current
    }
  }

  return undefined
}

/** What a value written in the source is, following names to the `const`s that hold them. */
function evaluate(node: ts.Expression | undefined, declared: Map<string, ts.Expression>, depth: number): Literal {
  if (!node || depth > nameLimit) {
    return undefined
  }

  const expression = unwrapped(node)

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text
  }

  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text)
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true
  }

  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false
  }

  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return null
  }

  if (ts.isIdentifier(expression)) {
    return evaluate(declared.get(expression.text), declared, depth + 1)
  }

  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.map((element) => evaluate(element, declared, depth))
  }

  if (ts.isObjectLiteralExpression(expression)) {
    const object: Record<string, Literal> = {}

    for (const property of expression.properties) {
      if (ts.isPropertyAssignment(property)) {
        const key = propertyKey(property.name)

        if (key !== undefined) {
          object[key] = evaluate(property.initializer, declared, depth)
        }
      } else if (ts.isShorthandPropertyAssignment(property)) {
        object[property.name.text] = evaluate(property.name, declared, depth + 1)
      } else if (ts.isSpreadAssignment(property)) {
        const spread = record.safeParse(evaluate(property.expression, declared, depth + 1))

        if (spread.success) {
          Object.assign(object, spread.data)
        }
      }
    }

    return object
  }

  return undefined
}

/** An expression without the parentheses, `as`, `satisfies` and `!` around it. */
function unwrapped(node: ts.Expression): ts.Expression {
  let current = node

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression
  }

  return current
}

function propertyKey(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }

  return undefined
}

/** An object written in the source, by its keys. */
const record = z.record(z.string(), z.custom<Literal>())

/** Text that names something, or `undefined` for anything else. */
const optionalWord = z.string().min(1).optional().catch(undefined)

/** One of a toolbar's `items`: an option's value, or `{ value, title }`. */
const toolbarItem = z.union([
  z
    .string()
    .min(1)
    .transform((id) => ({ id })),
  z
    .object({ value: z.string().min(1), title: optionalWord })
    .transform(({ value, title }) => ({ id: value, name: title }))
])

/** A global type as Storybook declares one, with what Parity reads of it. */
const globalType = z.object({
  name: optionalWord,
  description: optionalWord,
  defaultValue: optionalWord,
  toolbar: z
    .object({ title: optionalWord, items: z.array(z.custom<Literal>()).catch([]) })
    .catch({ title: undefined, items: [] })
})

function scriptKind(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) {
    return ts.ScriptKind.TSX
  }

  if (path.endsWith(".ts")) {
    return ts.ScriptKind.TS
  }

  return path.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.JS
}
