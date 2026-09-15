#!/usr/bin/env node
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createJiti } from "jiti"

import { lintFiles, type ShadcnLintConfig } from "./api"

const HELP = `Usage: shadcn-lint [options] [paths...]

Run @shadcn/lint in projects that use Biome or another primary toolchain.

Options:
  -c, --config <path>  Config file (default: shadcn-lint.config.* or components.json)
      --cwd <path>     Project directory (default: current directory)
  -f, --format <name>  stylish or json (default: stylish)
  -h, --help           Show this help
`

function argumentsOf(argv: string[]) {
  let configPath: string | undefined
  let cwd = process.cwd()
  let format = "stylish"
  const paths: string[] = []
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value === "-h" || value === "--help") return { help: true } as const
    if (value === "-c" || value === "--config") {
      configPath = argv[++index] ?? ""
      if (!configPath) throw new Error(`${value} requires a path`)
      continue
    }
    if (value === "-f" || value === "--format") {
      format = argv[++index] ?? ""
      if (format !== "json" && format !== "stylish") {
        throw new Error(`${value} must be "json" or "stylish"`)
      }
      continue
    }
    if (value === "--cwd") {
      const directory = argv[++index]
      if (!directory) throw new Error("--cwd requires a path")
      cwd = path.resolve(directory)
      continue
    }
    if (value.startsWith("-")) throw new Error(`Unknown option: ${value}`)
    paths.push(value)
  }
  return {
    help: false,
    configPath,
    cwd,
    format,
    paths: paths.length ? paths : ["."],
  }
}

const DEFAULT_CONFIGS = [
  "shadcn-lint.config.ts",
  "shadcn-lint.config.mts",
  "shadcn-lint.config.js",
  "shadcn-lint.config.mjs",
  "shadcn-lint.config.json",
]

async function exists(file: string) {
  return fs.access(file).then(
    () => true,
    () => false
  )
}

async function configAt(
  file: string | undefined,
  cwd: string
): Promise<ShadcnLintConfig> {
  const selected = file
    ? path.resolve(cwd, file)
    : await (async () => {
        for (const candidate of DEFAULT_CONFIGS) {
          const absolute = path.resolve(cwd, candidate)
          if (await exists(absolute)) return absolute
        }
        return path.resolve(cwd, "components.json")
      })()
  let config: ShadcnLintConfig | undefined
  if (path.basename(selected) === "components.json") {
    const components = JSON.parse(await fs.readFile(selected, "utf8"))
    config = components.shadcnLint
  } else {
    const jiti = createJiti(import.meta.url)
    config = await jiti.import(selected, { default: true })
  }
  if (!config || typeof config !== "object" || !config.rules) {
    throw new Error(
      path.basename(selected) === "components.json"
        ? `${selected} must contain a shadcnLint object with rules`
        : `${selected} must contain a rules object`
    )
  }
  return { ...config, cwd: config.cwd ?? cwd }
}

function stylish(diagnostics: Awaited<ReturnType<typeof lintFiles>>) {
  return diagnostics
    .map(
      (item) =>
        `${item.filePath}:${item.line}:${item.column} ${item.severity} ${item.ruleId ?? "shadcn"}: ${item.message}`
    )
    .join("\n")
}

export async function main(argv = process.argv.slice(2)) {
  const options = argumentsOf(argv)
  if (options.help) {
    process.stdout.write(HELP)
    return 0
  }
  const config = await configAt(options.configPath, options.cwd)
  const diagnostics = await lintFiles(options.paths, config)
  process.stdout.write(
    options.format === "json"
      ? `${JSON.stringify(diagnostics, null, 2)}\n`
      : diagnostics.length
        ? `${stylish(diagnostics)}\n`
        : ""
  )
  return diagnostics.length ? 1 : 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
    process.exitCode = 2
  })
