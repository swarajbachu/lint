// Flat-config completion comes from the RulesConfig augmentation that
// scripts/postbuild.mjs writes into dist. These tests ask the TypeScript
// language service what it offers inside `rules: { | }` of a config that
// imports the built package, under the module settings projects actually
// use, so the feature is pinned by what an editor shows. They need
// `pnpm build` first and skip without it, like the Oxlint tests.

import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, test } from "vitest"

import { plugin } from "../src/plugin"

const ROOT = path.resolve(__dirname, "..")
const DIST = path.join(ROOT, "dist/eslint.d.ts")
const built = fs.existsSync(DIST)

const RULE_NAMES = Object.keys(plugin.rules).map((name) => `shadcn/${name}`)
// TypeScript offers a property that needs quoting as its quoted name.
const QUOTED = RULE_NAMES.map((name) => `"${name}"`)

const SETTINGS = {
  bundler: {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  },
  nodenext: {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  },
  node10: {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
  },
}

function completionsIn(
  fileName: string,
  source: string,
  settings: (typeof SETTINGS)[keyof typeof SETTINGS]
) {
  const marker = source.indexOf("/*|*/")
  const text = source.replace("/*|*/", "")
  // The language service asks for files with forward slashes on every
  // platform, so the in-memory file is keyed that way too.
  const normalized = fileName.replace(/\\/g, "/")
  const augmentation = path.join(ROOT, "dist/eslint.d.ts").replace(/\\/g, "/")
  const files = new Map([
    [normalized, text],
    [augmentation, fs.readFileSync(augmentation, "utf8")],
  ])
  const options: ts.CompilerOptions = {
    strict: true,
    allowJs: true,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    ...settings,
  }
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => "1",
    getScriptSnapshot: (f) =>
      files.has(f)
        ? ts.ScriptSnapshot.fromString(files.get(f)!)
        : ts.sys.fileExists(f)
          ? ts.ScriptSnapshot.fromString(ts.sys.readFile(f)!)
          : undefined,
    getCurrentDirectory: () => ROOT,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (f) => files.has(f) || ts.sys.fileExists(f),
    readFile: (f) => files.get(f) ?? ts.sys.readFile(f),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
  }
  const service = ts.createLanguageService(host, ts.createDocumentRegistry())
  const result = service.getCompletionsAtPosition(normalized, marker, {})
  return (result?.entries ?? []).map((e) => e.name)
}

const defineConfigSource = `
import { defineConfig } from "eslint/config"
import { plugin as shadcn } from "../dist/index.js"

export default defineConfig([
  { plugins: { shadcn }, rules: { /*|*/ } },
])
`

const linterConfigSource = `
import type { Linter } from "eslint"
import { plugin as shadcn } from "../dist/index.js"

export const config: Linter.Config = { plugins: { shadcn }, rules: { /*|*/ } }
`

describe("flat config completion", () => {
  test("the augmentation names every rule in plugin.rules and nothing else", () => {
    const source = fs.readFileSync(path.join(ROOT, "src/eslint.ts"), "utf8")
    const block =
      source.match(/declare module "@eslint\/core" \{[\s\S]*?\n\}/)?.[0] ?? ""
    const declared = [...block.matchAll(/"(shadcn\/[a-z-]+)"\?:/g)].map(
      (m) => m[1]
    )
    expect(declared.sort()).toEqual([...RULE_NAMES].sort())
  })

  describe.skipIf(!built)("through the built types", () => {
    test.each(Object.entries(SETTINGS))(
      "defineConfig, %s resolution, .ts config",
      (_, settings) => {
        const names = completionsIn(
          path.join(ROOT, "test/eslint.config.ts"),
          defineConfigSource,
          settings
        )
        for (const rule of QUOTED) expect(names).toContain(rule)
      }
    )

    test.each(Object.entries(SETTINGS))(
      "defineConfig, %s resolution, .mjs config",
      (_, settings) => {
        const names = completionsIn(
          path.join(ROOT, "test/eslint.config.mjs"),
          defineConfigSource,
          settings
        )
        for (const rule of QUOTED) expect(names).toContain(rule)
      }
    )

    test("Linter.Config annotation, bundler resolution", () => {
      const names = completionsIn(
        path.join(ROOT, "test/eslint.config.ts"),
        linterConfigSource,
        SETTINGS.bundler
      )
      for (const rule of QUOTED) expect(names).toContain(rule)
    })
  })
})
