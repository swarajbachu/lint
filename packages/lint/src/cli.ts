#!/usr/bin/env node
import * as fs from "node:fs/promises"
import * as path from "node:path"

import { lintFiles, type ShadcnLintConfig } from "./api"

const HELP = `Usage: shadcn-lint [options] [paths...]

Run @shadcn/lint in projects that use Biome or another primary toolchain.

Options:
  -c, --config <path>  Config file (default: shadcn-lint.config.json)
  -f, --format <name>  stylish or json (default: stylish)
  -h, --help           Show this help
`

function argumentsOf(argv: string[]) {
  let configPath = "shadcn-lint.config.json"
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
    if (value.startsWith("-")) throw new Error(`Unknown option: ${value}`)
    paths.push(value)
  }
  return {
    help: false,
    configPath,
    format,
    paths: paths.length ? paths : ["."],
  }
}

async function configAt(file: string): Promise<ShadcnLintConfig> {
  const absolute = path.resolve(file)
  const config = JSON.parse(await fs.readFile(absolute, "utf8"))
  if (!config || typeof config !== "object" || !config.rules) {
    throw new Error(`${file} must contain a rules object`)
  }
  return { ...config, cwd: config.cwd ?? path.dirname(absolute) }
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
  const config = await configAt(options.configPath)
  const diagnostics = await lintFiles(options.paths, config)
  process.stdout.write(
    options.format === "json"
      ? `${JSON.stringify(diagnostics, null, 2)}\n`
      : diagnostics.length
        ? `${stylish(diagnostics)}\n`
        : ""
  )
  return diagnostics.some((item) => item.severity === "error") ? 1 : 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
    process.exitCode = 2
  })
