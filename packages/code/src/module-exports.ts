import ts from "typescript"

/** What a module exports at run time, as its source says, read by TypeScript's parser rather than by pattern. */
export interface ModuleExports {
  /** The names it exports values by, `default` among them; types are left out. */
  names: string[]
  /** It passes on everything another module exports, by `export * from`, whose names only that module knows. */
  reexportsAll: boolean
  /** It starts with the `"use client"` directive. */
  usesClient: boolean
  /** The constants it exports whose values are literals, by name, with each value's text, as Next's segment config. */
  literals: [name: string, value: string][]
}

/**
 * What a module exports, from its source: declarations (each binding a destructuring pattern makes too), export lists,
 * `export *`, and `export default`. Comments, types and `declare`d names don't count.
 */
export function readModuleExports(text: string): ModuleExports {
  const source = ts.createSourceFile("module.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set<string>()
  const literals: [string, string][] = []
  let reexportsAll = false

  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement)) {
      if (!statement.isExportEquals) {
        names.add("default")
      }

      continue
    }

    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) {
        continue
      }

      const clause = statement.exportClause

      if (!clause) {
        reexportsAll ||= statement.moduleSpecifier !== undefined
      } else if (ts.isNamespaceExport(clause)) {
        names.add(clause.name.text)
      } else {
        for (const element of clause.elements) {
          if (!element.isTypeOnly) {
            names.add(element.name.text)
          }
        }
      }

      continue
    }

    const modifiers = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : []
    const has = (kind: ts.SyntaxKind) => modifiers.some((modifier) => modifier.kind === kind)

    if (!has(ts.SyntaxKind.ExportKeyword) || has(ts.SyntaxKind.DeclareKeyword)) {
      continue
    }

    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (has(ts.SyntaxKind.DefaultKeyword)) {
        names.add("default")
      } else if (statement.name) {
        names.add(statement.name.text)
      }
    } else if (ts.isEnumDeclaration(statement) && !has(ts.SyntaxKind.ConstKeyword)) {
      names.add(statement.name.text)
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of bindingNames(declaration.name)) {
          names.add(name)
        }

        const value = declaration.initializer && literalText(declaration.initializer)

        if (ts.isIdentifier(declaration.name) && value !== undefined) {
          literals.push([declaration.name.text, value])
        }
      }
    }
  }

  return { names: [...names], reexportsAll, usesClient: usesClient(source), literals }
}

/** The names a declaration binds: its own, or each a destructuring pattern makes, however nested. */
function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) {
    return [name.text]
  }

  return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : bindingNames(element.name)))
}

/** A value's text when it's a literal: a string, number, boolean, or an array of them, without an `as const`. */
function literalText(value: ts.Expression): string | undefined {
  const inner = ts.isAsExpression(value) && value.type.getText() === "const" ? value.expression : value

  return isLiteral(inner) ? inner.getText() : undefined
}

function isLiteral(value: ts.Expression): boolean {
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.every(isLiteral)
  }

  if (ts.isPrefixUnaryExpression(value)) {
    return value.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(value.operand)
  }

  return (
    ts.isStringLiteral(value) ||
    ts.isNoSubstitutionTemplateLiteral(value) ||
    ts.isNumericLiteral(value) ||
    value.kind === ts.SyntaxKind.TrueKeyword ||
    value.kind === ts.SyntaxKind.FalseKeyword
  )
}

/** Whether a module's directive prologue says `"use client"`. */
function usesClient(source: ts.SourceFile): boolean {
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false
    }

    if (statement.expression.text === "use client") {
      return true
    }
  }

  return false
}
