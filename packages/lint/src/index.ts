// @shadcn/lint: the plugin, and a small window onto the project model.
// There is no preset; the README shows the setup.

import { plugin } from "./plugin"
import { componentsFor } from "./project/components"
import { projectFor } from "./project/components-json"
import { colorTokensFor, themeFileFor } from "./project/theme"
import { variantDefinitionsOf, variantNamesFor } from "./project/variants"

export { lintFiles } from "./api"
export type {
  ShadcnLintConfig,
  ShadcnLintDiagnostic,
  ShadcnLintSuggestion,
  ShadcnRuleId,
  ShadcnRuleSetting,
} from "./api"
export { plugin } from "./plugin"

// What the linter knows about a project, for tooling that wants the same
// answers. Experimental: the shapes may change before 1.0.
export const project = {
  projectFor,
  themeFileFor,
  colorTokensFor,
  componentsFor,
  variantDefinitionsOf,
  variantNamesFor,
}

export default plugin
