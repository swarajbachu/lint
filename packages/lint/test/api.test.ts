import * as path from "node:path"
import { describe, expect, test } from "vitest"

import { lintFiles } from "../src/api"
import { PROJECT } from "./helpers"

describe("programmatic API", () => {
  test("runs project-aware rules without a host linter configuration", async () => {
    const diagnostics = await lintFiles(["app/oxlint.tsx"], {
      cwd: PROJECT,
      rules: {
        "shadcn/no-restyle": ["error", { allow: ["layout"] }],
        "shadcn/no-raw-colors": "error",
      },
    })

    expect(
      diagnostics.some((item) => item.ruleId === "shadcn/no-restyle")
    ).toBe(true)
    expect(
      diagnostics.some((item) => item.ruleId === "shadcn/no-raw-colors")
    ).toBe(true)
    expect(diagnostics.every((item) => path.isAbsolute(item.filePath))).toBe(
      true
    )
  })

  test("returns stable source ranges", async () => {
    const diagnostics = await lintFiles(["app/oxlint.tsx"], {
      cwd: PROJECT,
      rules: { "shadcn/no-unknown-classes": "error" },
    })

    const typo = diagnostics.find((item) => item.message.includes("flex-cols"))
    expect(typo).toMatchObject({
      ruleId: "shadcn/no-unknown-classes",
      severity: "error",
      line: expect.any(Number),
      column: expect.any(Number),
      endLine: expect.any(Number),
      endColumn: expect.any(Number),
    })
  })

  test("ignores directives for rules owned by another linter", async () => {
    const diagnostics = await lintFiles(["app/foreign-directives.tsx"], {
      cwd: PROJECT,
      rules: {},
    })

    expect(diagnostics).toEqual([])
  })

  test("resolves same-file wrappers without an ESLint scope manager", async () => {
    const diagnostics = await lintFiles(["app/local-wrapper.tsx"], {
      cwd: PROJECT,
      rules: { "shadcn/no-restyle": ["error", { allow: ["layout"] }] },
    })

    expect(diagnostics.map((item) => item.message)).toContainEqual(
      expect.stringContaining(
        "<LocalButton> forwards className to <Button>, which owns its color"
      )
    )
  })

  test("keeps parser error ranges", async () => {
    const diagnostics = await lintFiles(["app/syntax-error.tsx"], {
      cwd: PROJECT,
      rules: {},
    })

    expect(diagnostics[0]).toMatchObject({
      ruleId: null,
      line: 1,
      column: 7,
      endLine: 1,
      endColumn: 8,
    })
  })

  test("normalizes rule configuration locations", async () => {
    const diagnostics = await lintFiles(["app/oxlint.tsx"], {
      cwd: PROJECT,
      rules: {
        "shadcn/no-restyle": ["error", { contracts: [{ pattern: "[" }] }],
      },
    })

    expect(diagnostics[0]).toMatchObject({
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
    })
  })
})
