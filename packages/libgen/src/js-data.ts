import ts from "typescript"

/**
 * The data a JavaScript module declares at its top level, read with the TypeScript parser rather than run: arrays,
 * objects, strings, numbers and booleans, by the name each is declared as. Members of enums compiled the way esbuild
 * writes them (`((i) => (i.ARROWS = "arrows", i))(e || {})`) read as their values, so a published data file such as
 * Phosphor's icon list can be read without running code that came from the network. Anything else is left out.
 */
export function moduleData(text: string): Map<string, unknown> {
  const source = ts.createSourceFile("data.mjs", text, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  const declared = new Map<string, unknown>()
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const value = compiledEnum(declaration.initializer) ?? literal(declaration.initializer, declared)
      if (value !== undefined) declared.set(declaration.name.text, value)
    }
  }
  return declared
}

/** An enum as esbuild compiles it: an arrow that assigns each member to its parameter, called at once. */
function compiledEnum(node: ts.Expression): Record<string, unknown> | undefined {
  const call = unwrap(node)
  if (!ts.isCallExpression(call)) return undefined
  const arrow = unwrap(call.expression)
  if (!ts.isArrowFunction(arrow) || arrow.parameters.length !== 1) return undefined
  const param = arrow.parameters[0]!.name
  if (!ts.isIdentifier(param) || ts.isBlock(arrow.body)) return undefined
  const members: Record<string, unknown> = {}
  const visit = (expression: ts.Expression): void => {
    const node = unwrap(expression)
    if (!ts.isBinaryExpression(node)) return
    if (node.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      visit(node.left)
      visit(node.right)
    } else if (
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      ts.isIdentifier(node.left.expression) &&
      node.left.expression.text === param.text
    ) {
      members[node.left.name.text] = literal(node.right, new Map())
    }
  }
  visit(arrow.body)
  return Object.keys(members).length > 0 ? members : undefined
}

function unwrap(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node
}

/** A literal's value, with names and enum members looked up in what's been declared; `undefined` for anything else. */
function literal(node: ts.Expression, declared: Map<string, unknown>): unknown {
  const value = unwrap(node)
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text
  if (ts.isNumericLiteral(value)) return Number(value.text)
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false
  if (ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.MinusToken) {
    const number = literal(value.operand, declared)
    return typeof number === "number" ? -number : undefined
  }
  if (ts.isArrayLiteralExpression(value)) return value.elements.map((element) => literal(element, declared))
  if (ts.isObjectLiteralExpression(value)) {
    const object: Record<string, unknown> = {}
    for (const property of value.properties) {
      if (!ts.isPropertyAssignment(property)) continue
      const name = property.name
      if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
        object[name.text] = literal(property.initializer, declared)
      }
    }
    return object
  }
  if (ts.isIdentifier(value)) return declared.get(value.text)
  if (ts.isPropertyAccessExpression(value) && ts.isIdentifier(value.expression)) {
    const owner = declared.get(value.expression.text)
    return owner && typeof owner === "object" ? (owner as Record<string, unknown>)[value.name.text] : undefined
  }
  return undefined
}
