import * as path from "node:path"
import parser from "@typescript-eslint/parser"
import { ESLint, type Linter } from "eslint-runtime"

import { plugin } from "./plugin"

export type ShadcnRuleId = `shadcn/${keyof typeof plugin.rules}`
export type ShadcnRuleSetting = Linter.RuleEntry

export interface ShadcnLintConfig {
  /** Directory used for globs and project discovery. Defaults to process.cwd(). */
  cwd?: string
  /** Files understood by the parser. */
  files?: string[]
  /** Files excluded before linting. */
  ignores?: string[]
  /** The same settings.shadcn object accepted by the linter plugins. */
  settings?: Record<string, unknown>
  /** Rules use their existing shadcn/* names and options. */
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

/**
 * Runs the shadcn rules without requiring an ESLint or Oxlint configuration.
 * This is the integration point for projects that use Biome as their primary
 * linter and formatter.
 */
export async function lintFiles(
  paths: string[],
  config: ShadcnLintConfig
): Promise<ShadcnLintDiagnostic[]> {
  const cwd = path.resolve(config.cwd ?? process.cwd())
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [
      ...(config.ignores?.length ? [{ ignores: config.ignores }] : []),
      {
        files: config.files ?? ["**/*.{js,jsx,ts,tsx}"],
        languageOptions: {
          parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { shadcn: plugin },
        rules: config.rules,
        ...(config.settings ? { settings: config.settings } : {}),
      },
    ],
  })
  const results = await eslint.lintFiles(paths)

  return results.flatMap((result) =>
    result.messages.map((message) => ({
      filePath: path.resolve(result.filePath),
      ruleId: message.ruleId,
      severity: message.severity === 2 ? "error" : "warning",
      message: message.message,
      line: message.line,
      column: message.column,
      endLine: message.endLine ?? message.line,
      endColumn: message.endColumn ?? message.column,
      ...(message.fix
        ? {
            fix: {
              description: "Apply fix",
              replacement: message.fix.text,
              range: message.fix.range,
            },
          }
        : {}),
      ...(message.suggestions?.length
        ? {
            suggestions: message.suggestions.map((suggestion) => ({
              description: suggestion.desc,
              replacement: suggestion.fix.text,
              range: suggestion.fix.range,
            })),
          }
        : {}),
    }))
  )
}
