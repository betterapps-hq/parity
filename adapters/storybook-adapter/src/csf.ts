import ts from "typescript"

/** A JSON value an arg can hold, as a story file writes it: functions, elements and other code are left out. */
export type ArgValue = string | number | boolean | null | ArgValue[] | StoryArgs

/** Args by name, as a story or its meta gives them. */
export interface StoryArgs {
  [name: string]: ArgValue
}

/** What a CSF file says about itself and each of its stories. */
export interface StoryFile {
  /** The meta's `title`, as `UI/Button`, when it gives one. */
  title?: string
  /** The component the meta names, as the file imports it, when it names one. */
  component?: ImportedName
  stories: Story[]
}

/** A name a file imports: the module it's from, as written, and its name there, `default` for a default export. */
export interface ImportedName {
  specifier: string
  name: string
}

/** One story a CSF file exports. */
export interface Story {
  /** Its export's name, as `PrimaryLarge`. */
  exportName: string
  /** What Storybook calls it: its `name`, else its export's name in words, as `Primary Large`. */
  name: string
  /** The meta's args with its own over them, those that are JSON. */
  args: StoryArgs
  /**
   * Where the function it draws with is, when it or the meta has one rather than drawing the component with its args:
   * its export itself for a function (CSF 2), `Primary.render` for its own, or `default.render` for the meta's.
   */
  render?: string
}

/**
 * What a CSF file says, from its code alone: the default export's `title`, `component` and `args`, and for each named
 * export, a story object or function, its `name`, `args` and whether it renders itself. A file without a default
 * export isn't a story file, so it gives none.
 */
export function readStoryFile(source: string, path = "story.tsx"): StoryFile {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const constants = new Map<string, ts.Expression>()
  const imports = new Map<string, ImportedName>()
  const exported: { name: string; value: ts.Expression }[] = []
  let meta: ts.Expression | undefined

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      addImports(statement, statement.moduleSpecifier.text, imports)
    } else if (ts.isVariableStatement(statement)) {
      const isExported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)

      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          constants.set(declaration.name.text, declaration.initializer)

          if (isExported) {
            exported.push({ name: declaration.name.text, value: declaration.initializer })
          }
        }
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      meta = statement.expression
    }
  }

  const metaObject = objectOf(meta, constants)

  if (!metaObject) {
    return { stories: [] }
  }

  const metaArgs = argsOf(property(metaObject, "args"), constants)
  const metaRenders = property(metaObject, "render") !== undefined
  const title = stringOf(property(metaObject, "title"))
  const componentName = identifierOf(property(metaObject, "component"))
  const component = componentName ? imports.get(componentName) : undefined
  const stories = exported.flatMap(({ name, value }) => storyOf(name, value, constants, metaArgs, metaRenders))
  const read: StoryFile = { stories }

  if (title) {
    read.title = title
  }

  if (component) {
    read.component = component
  }

  return read
}

function storyOf(
  name: string,
  value: ts.Expression,
  constants: ReadonlyMap<string, ts.Expression>,
  metaArgs: StoryArgs,
  metaRenders: boolean
): Story[] {
  const inner = unwrap(value)

  // A function is a story that draws itself (CSF 2).
  if (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) {
    return [{ exportName: name, name: storyName(name), args: metaArgs, render: name }]
  }

  const story = objectOf(value, constants)

  if (!story) {
    return []
  }

  const read: Story = {
    exportName: name,
    name: stringOf(property(story, "name")) ?? storyName(name),
    args: { ...metaArgs, ...argsOf(property(story, "args"), constants) }
  }

  if (property(story, "render") !== undefined) {
    read.render = `${name}.render`
  } else if (metaRenders) {
    read.render = "default.render"
  }

  return [read]
}

/** An export's name in words, as Storybook shows it: `PrimaryLarge` as `Primary Large`. */
export function storyName(exportName: string): string {
  return exportName
    .replaceAll(/([a-z\d])([A-Z])/g, "$1 $2")
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replaceAll(/[_-]+/g, " ")
    .trim()
}

function addImports(statement: ts.ImportDeclaration, specifier: string, imports: Map<string, ImportedName>): void {
  const clause = statement.importClause

  if (!clause || clause.isTypeOnly) {
    return
  }

  if (clause.name) {
    imports.set(clause.name.text, { specifier, name: "default" })
  }

  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    for (const element of clause.namedBindings.elements) {
      imports.set(element.name.text, { specifier, name: (element.propertyName ?? element.name).text })
    }
  }
}

/** An expression without what only types it: `satisfies`, `as`, `!` and brackets. */
function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression

  while (
    ts.isSatisfiesExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression
  }

  return current
}

/** The object an expression is, following a constant it names. */
function objectOf(
  expression: ts.Expression | undefined,
  constants: ReadonlyMap<string, ts.Expression>
): ts.ObjectLiteralExpression | undefined {
  const inner = expression && unwrap(expression)

  if (inner && ts.isIdentifier(inner)) {
    const named = constants.get(inner.text)

    return named && named !== expression ? objectOf(named, constants) : undefined
  }

  return inner && ts.isObjectLiteralExpression(inner) ? inner : undefined
}

/** A property of an object by its name: its value, the name for a shorthand, or `true` for a method, which is there. */
function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const element of object.properties) {
    const key =
      element.name && (ts.isIdentifier(element.name) || ts.isStringLiteral(element.name))
        ? element.name.text
        : undefined

    if (key !== name) {
      continue
    }

    if (ts.isPropertyAssignment(element)) {
      return element.initializer
    }

    if (ts.isShorthandPropertyAssignment(element)) {
      return element.name
    }

    if (ts.isMethodDeclaration(element)) {
      return ts.factory.createTrue()
    }
  }

  return undefined
}

function stringOf(expression: ts.Expression | undefined): string | undefined {
  const inner = expression && unwrap(expression)

  return inner && (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) ? inner.text : undefined
}

function identifierOf(expression: ts.Expression | undefined): string | undefined {
  const inner = expression && unwrap(expression)

  return inner && ts.isIdentifier(inner) ? inner.text : undefined
}

/** An `args` object's JSON values, following a constant it names. */
function argsOf(expression: ts.Expression | undefined, constants: ReadonlyMap<string, ts.Expression>): StoryArgs {
  const object = objectOf(expression, constants)

  return object ? objectValue(object) : {}
}

function objectValue(object: ts.ObjectLiteralExpression): StoryArgs {
  const values: StoryArgs = {}

  for (const element of object.properties) {
    if (!ts.isPropertyAssignment(element) || !(ts.isIdentifier(element.name) || ts.isStringLiteral(element.name))) {
      continue
    }

    const value = valueOf(element.initializer)

    if (value !== undefined) {
      values[element.name.text] = value
    }
  }

  return values
}

/** A literal's JSON value, or undefined for code that isn't one. */
function valueOf(expression: ts.Expression): ArgValue | undefined {
  const inner = unwrap(expression)

  if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) {
    return inner.text
  }

  if (ts.isNumericLiteral(inner)) {
    return Number(inner.text)
  }

  if (
    ts.isPrefixUnaryExpression(inner) &&
    inner.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(inner.operand)
  ) {
    return -Number(inner.operand.text)
  }

  if (inner.kind === ts.SyntaxKind.TrueKeyword || inner.kind === ts.SyntaxKind.FalseKeyword) {
    return inner.kind === ts.SyntaxKind.TrueKeyword
  }

  if (inner.kind === ts.SyntaxKind.NullKeyword) {
    return null
  }

  if (ts.isArrayLiteralExpression(inner)) {
    const items: ArgValue[] = []

    for (const element of inner.elements) {
      const item = valueOf(element)

      if (item === undefined) {
        return undefined
      }

      items.push(item)
    }

    return items
  }

  return ts.isObjectLiteralExpression(inner) ? objectValue(inner) : undefined
}
