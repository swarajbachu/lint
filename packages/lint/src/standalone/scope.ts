type Scope = {
  set: Map<string, Variable>
  upper: Scope | null
}

type Variable = {
  defs: any[]
  references: any[]
}

function identifiersOf(pattern: any, identifiers: any[] = []) {
  if (!pattern) return identifiers
  if (pattern.type === "Identifier") identifiers.push(pattern)
  else if (pattern.type === "RestElement")
    identifiersOf(pattern.argument, identifiers)
  else if (pattern.type === "AssignmentPattern")
    identifiersOf(pattern.left, identifiers)
  else if (
    pattern.type === "ObjectPattern" ||
    pattern.type === "ArrayPattern"
  ) {
    for (const item of pattern.properties ?? pattern.elements ?? []) {
      identifiersOf(item?.value ?? item?.argument ?? item, identifiers)
    }
  }
  return identifiers
}

function childrenOf(node: any) {
  const children: any[] = []
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue
    if (Array.isArray(value)) children.push(...value)
    else children.push(value)
  }
  return children.filter((value) => value && typeof value.type === "string")
}

function define(
  scope: Scope,
  name: any,
  definition: any,
  definitions: WeakSet<any>
) {
  for (const identifier of identifiersOf(name)) {
    definitions.add(identifier)
    const variable = scope.set.get(identifier.name) ?? {
      defs: [],
      references: [],
    }
    variable.defs.push({ ...definition, name: identifier })
    scope.set.set(identifier.name, variable)
  }
}

function find(scope: Scope, name: string) {
  for (let current: Scope | null = scope; current; current = current.upper) {
    const variable = current.set.get(name)
    if (variable) return variable
  }
  return null
}

function isReference(node: any, definitions: WeakSet<any>) {
  if (definitions.has(node)) return false
  const parent = node.parent
  if (!parent) return false
  if (parent.type.startsWith("JSX")) return false
  if (
    (parent.type === "Property" && parent.key === node && !parent.computed) ||
    (parent.type === "MemberExpression" &&
      parent.property === node &&
      !parent.computed) ||
    parent.type.startsWith("Import") ||
    parent.type === "LabeledStatement"
  )
    return false
  return true
}

export function scopesFor(program: any) {
  const root: Scope = { set: new Map(), upper: null }
  const scopes = new WeakMap<any, Scope>()
  const definitions = new WeakSet<any>()

  const collect = (node: any, parentScope: Scope) => {
    const ownsScope =
      node.type === "Program" ||
      node.type === "BlockStatement" ||
      /Function(Expression|Declaration)$/.test(node.type) ||
      node.type === "ArrowFunctionExpression"
    const scope =
      node.type === "Program"
        ? root
        : ownsScope
          ? { set: new Map(), upper: parentScope }
          : parentScope
    scopes.set(node, scope)
    if (node.type === "VariableDeclarator")
      define(scope, node.id, { type: "Variable", node }, definitions)
    if (
      /Function(Expression|Declaration)$/.test(node.type) ||
      node.type === "ArrowFunctionExpression"
    ) {
      for (const parameter of node.params ?? [])
        define(scope, parameter, { type: "Parameter", node }, definitions)
    }
    for (const child of childrenOf(node)) collect(child, scope)
  }
  collect(program, root)

  const references = (node: any) => {
    if (node.type === "Identifier" && isReference(node, definitions)) {
      const variable = find(scopes.get(node) ?? root, node.name)
      if (variable) {
        const parent = node.parent
        const write =
          (parent?.type === "AssignmentExpression" && parent.left === node) ||
          parent?.type === "UpdateExpression"
        variable.references.push({
          identifier: node,
          init: false,
          isRead: () => !write,
          isWrite: () => write,
        })
      }
    }
    for (const child of childrenOf(node)) references(child)
  }
  references(program)
  return (node: any) => scopes.get(node) ?? root
}
