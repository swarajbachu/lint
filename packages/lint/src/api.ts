import * as fs from "node:fs/promises"
import * as path from "node:path"
import { parseSync } from "oxc-parser"
import { glob } from "tinyglobby"

import { rules as availableRules } from "./plugin"
import { scopesFor } from "./standalone/scope"

export type ShadcnRuleId = `shadcn/${keyof typeof availableRules}`
export type ShadcnRuleSetting =
  | "off"
  | "warn"
  | "error"
  | 0
  | 1
  | 2
  | ["off" | "warn" | "error" | 0 | 1 | 2, ...unknown[]]

export interface ShadcnLintConfig {
  cwd?: string
  files?: string[]
  ignores?: string[]
  settings?: Record<string, unknown>
  rules: Partial<Record<ShadcnRuleId, ShadcnRuleSetting>>
}

export interface ShadcnLintSuggestion {
  description: string
  replacement: string
  range: [number, number]
}

export interface ShadcnLintDiagnostic {
  filePath: string
  ruleId: string | null
  severity: "warning" | "error"
  message: string
  line: number
  column: number
  endLine: number
  endColumn: number
  fix?: ShadcnLintSuggestion
  suggestions?: ShadcnLintSuggestion[]
}

const EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".mts",
  ".cjs",
  ".cts",
])

function severityOf(value: ShadcnRuleSetting) {
  const level = Array.isArray(value) ? value[0] : value
  if (level === "off" || level === 0) return null
  return level === "warn" || level === 1 ? "warning" : "error"
}

function optionsOf(value: ShadcnRuleSetting) {
  return Array.isArray(value) ? value.slice(1) : []
}

function languageOf(file: string) {
  const extension = path.extname(file).toLowerCase()
  if (extension === ".tsx") return "tsx"
  if (extension === ".ts" || extension === ".mts" || extension === ".cts")
    return "ts"
  if (extension === ".jsx") return "jsx"
  return "js"
}

function sourceTypeOf(file: string) {
  const extension = path.extname(file).toLowerCase()
  return extension === ".cjs" || extension === ".cts" ? "script" : "module"
}

function lineStartsOf(source: string) {
  const starts = [0]
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1)
  }
  return starts
}

function positionOf(offset: number, starts: number[]) {
  let low = 0
  let high = starts.length
  while (low + 1 < high) {
    const middle = (low + high) >> 1
    if (starts[middle] <= offset) low = middle
    else high = middle
  }
  return { line: low + 1, column: offset - starts[low] + 1 }
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

function attachParents(node: any, parent: any = null) {
  if (!node || typeof node.type !== "string") return
  Object.defineProperty(node, "parent", { value: parent, configurable: true })
  node.range ??= [node.start, node.end]
  for (const child of childrenOf(node)) attachParents(child, node)
}

function walk(node: any, visitors: Record<string, (node: any) => void>) {
  if (!node || typeof node.type !== "string") return
  visitors[node.type]?.(node)
  for (const child of childrenOf(node)) walk(child, visitors)
  visitors[`${node.type}:exit`]?.(node)
}

function render(template: string, data: Record<string, unknown> = {}) {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key) =>
    Object.hasOwn(data, key) ? String(data[key] ?? "") : `{{${key}}}`
  )
}

function replacementOf(fix: any): ShadcnLintSuggestion | undefined {
  if (typeof fix !== "function") return undefined
  const edit = fix({
    replaceTextRange: (range: [number, number], text: string) => ({
      range,
      text,
    }),
    replaceText: (node: any, text: string) => ({ range: node.range, text }),
    remove: (node: any) => ({ range: node.range, text: "" }),
    insertTextBefore: (node: any, text: string) => ({
      range: [node.range[0], node.range[0]],
      text,
    }),
    insertTextAfter: (node: any, text: string) => ({
      range: [node.range[1], node.range[1]],
      text,
    }),
  })
  if (!edit || !Array.isArray(edit.range) || typeof edit.text !== "string")
    return undefined
  return {
    description: "Apply fix",
    replacement: edit.text,
    range: edit.range,
  }
}

async function inputFiles(inputs: string[], cwd: string, ignores: string[]) {
  const patterns: string[] = []
  for (const input of inputs) {
    const stat = await fs.stat(path.resolve(cwd, input)).catch(() => null)
    patterns.push(
      stat?.isDirectory()
        ? `${input.replace(/\\/g, "/").replace(/\/$/, "")}/**/*`
        : input
    )
  }
  const files = await glob(patterns, {
    cwd,
    absolute: true,
    ignore: ignores,
  })
  return files.filter((file: string) =>
    EXTENSIONS.has(path.extname(file).toLowerCase())
  )
}

async function lintFile(filePath: string, config: ShadcnLintConfig) {
  const source = await fs.readFile(filePath, "utf8")
  const parsed = parseSync(path.basename(filePath), source, {
    lang: languageOf(filePath),
    sourceType: sourceTypeOf(filePath),
  })
  const starts = lineStartsOf(source)
  const diagnostics: ShadcnLintDiagnostic[] = []
  for (const error of parsed.errors) {
    if (error.severity !== "Error") continue
    const label = error.labels?.[0]
    const start = positionOf(label?.start ?? 0, starts)
    const end = positionOf(label?.end ?? label?.start ?? 0, starts)
    diagnostics.push({
      filePath,
      ruleId: null,
      severity: "error",
      message: error.message,
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
    })
  }
  attachParents(parsed.program)
  const getScope = scopesFor(parsed.program)

  for (const [ruleId, setting] of Object.entries(config.rules)) {
    if (setting == null) continue
    const severity = severityOf(setting)
    if (!severity) continue
    const name = ruleId.slice("shadcn/".length) as keyof typeof availableRules
    const rule = availableRules[name]
    if (!rule) continue
    const context = {
      cwd: config.cwd,
      physicalFilename: filePath,
      options: optionsOf(setting),
      settings: config.settings ? { shadcn: config.settings } : {},
      sourceCode: {
        ast: parsed.program,
        text: source,
        getText: (node: any) => source.slice(node.start, node.end),
        getScope,
      },
      report(descriptor: any) {
        const node = descriptor.node ?? parsed.program
        const range: [number, number] = node.range ?? [
          node.start ?? 0,
          node.end ?? 0,
        ]
        const explicit = descriptor.loc
        const start = explicit
          ? {
              ...(explicit.start ?? explicit),
              column: (explicit.start ?? explicit).column + 1,
            }
          : positionOf(range[0], starts)
        const end = explicit?.end
          ? { ...explicit.end, column: explicit.end.column + 1 }
          : explicit
            ? start
            : positionOf(range[1], starts)
        const messages = rule.meta.messages as Record<string, string>
        const message =
          descriptor.message ??
          render(
            messages?.[descriptor.messageId] ??
              descriptor.messageId ??
              "Lint finding",
            descriptor.data
          )
        const fix = replacementOf(descriptor.fix)
        const suggestions = descriptor.suggest
          ?.map((suggestion: any) => {
            const replacement = replacementOf(suggestion.fix)
            if (!replacement) return null
            return {
              ...replacement,
              description:
                suggestion.desc ??
                render(
                  messages?.[suggestion.messageId] ?? "Apply suggestion",
                  suggestion.data
                ),
            }
          })
          .filter(Boolean)
        diagnostics.push({
          filePath,
          ruleId,
          severity,
          message,
          line: start.line,
          column: start.column,
          endLine: end.line,
          endColumn: end.column,
          ...(fix ? { fix } : {}),
          ...(suggestions?.length ? { suggestions } : {}),
        })
      },
    }
    walk(parsed.program, rule.create(context))
  }
  return diagnostics
}

/** Runs the shadcn rules using a Rust-native parser with no ESLint runtime. */
export async function lintFiles(
  paths: string[],
  config: ShadcnLintConfig
): Promise<ShadcnLintDiagnostic[]> {
  const cwd = path.resolve(config.cwd ?? process.cwd())
  const ignores = [
    "**/node_modules/**",
    "**/.git/**",
    ...(config.ignores ?? []),
  ]
  let files = await inputFiles(paths, cwd, ignores)
  if (config.files?.length) {
    const included = new Set(await glob(config.files, { cwd, absolute: true }))
    files = files.filter((file) => included.has(file))
  }
  const results = await Promise.all(
    files.map((file: string) => lintFile(file, { ...config, cwd }))
  )
  return results.flat()
}
