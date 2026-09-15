// Optional editor completions for ESLint users. Kept outside the main entry so
// standalone and Biome users never resolve ESLint declarations.
import type {} from "@eslint/core"

export {}

type Severity = 0 | 1 | 2 | "off" | "warn" | "error"
type ShadcnRuleSetting<Options> = Severity | [Severity, Options]
type Contract = {
  pattern: string
  allow?: string[]
  deny?: string[]
  message?: string
}
type CommonOptions = {
  allow?: string[]
  deny?: string[]
  contracts?: Contract[]
  message?: string
  componentImports?: string[]
  ignoreImports?: string[]
  mergeFunctions?: string[]
  variantFunctions?: string[]
}
type ScanningOptions = CommonOptions & { scanAllStrings?: boolean }
type RestyleMessage =
  | string
  | Partial<
      Record<
        | "default"
        | "layout"
        | "color"
        | "typography"
        | "spacing"
        | "shape"
        | "effects"
        | "motion",
        string
      >
    >
type RestyleOptions = Omit<CommonOptions, "message" | "contracts"> & {
  message?: RestyleMessage
  contracts?: (Omit<Contract, "message"> & { message?: RestyleMessage })[]
}

declare module "@eslint/core" {
  interface RulesConfig {
    "shadcn/no-restyle"?: ShadcnRuleSetting<RestyleOptions>
    "shadcn/no-raw-colors"?: ShadcnRuleSetting<ScanningOptions>
    "shadcn/no-arbitrary-values"?: ShadcnRuleSetting<ScanningOptions>
    "shadcn/no-inline-styles"?: ShadcnRuleSetting<
      Pick<CommonOptions, "allow" | "deny" | "contracts" | "message">
    >
    "shadcn/require-static-classes"?: ShadcnRuleSetting<
      Pick<
        CommonOptions,
        | "message"
        | "componentImports"
        | "ignoreImports"
        | "mergeFunctions"
        | "variantFunctions"
      >
    >
    "shadcn/no-unknown-classes"?: ShadcnRuleSetting<CommonOptions>
  }
}
