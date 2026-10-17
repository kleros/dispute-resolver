import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import tseslint from "typescript-eslint";

// Security rules, each maps to a row of docs/parity/03-security-checklist.md.
const restrictedSyntax = [
  {
    selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
    message: "Assigning to innerHTML/outerHTML is forbidden. Render through React, or use textContent.",
  },
  {
    selector: "AssignmentExpression[left.property.value=/^(innerHTML|outerHTML)$/]",
    message: "Assigning to innerHTML/outerHTML is forbidden. Render through React, or use textContent.",
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: "insertAdjacentHTML is forbidden. Render through React.",
  },
  {
    selector: "CallExpression[callee.object.name='document'][callee.property.name=/^write(ln)?$/]",
    message: "document.write is forbidden.",
  },
];

const rehypeRawBan = { group: ["rehype-raw", "rehype-raw/*"], message: "rehype-raw lets untrusted markdown inject raw HTML and is forbidden." };

const coreBannedImports = [
  rehypeRawBan,
  {
    group: [
      "react",
      "react/*",
      "react-dom",
      "react-dom/*",
      "react-router",
      "react-router/*",
      "wagmi",
      "wagmi/*",
      "@reown/*",
      "@kleros/kleros-app",
      "@kleros/kleros-app/*",
      "@kleros/ui-components-library",
      "@kleros/ui-components-library/*",
      "@tanstack/react-query",
      "@tanstack/react-query-*",
    ],
    message: "core has no React, no wallet stack and no UI library. Keep it free of the DOM so it can run anywhere.",
  },
];

const coreBannedGlobals = ["window", "document", "localStorage", "sessionStorage", "navigator"].map((name) => ({
  name,
  message: "core must not touch the DOM or browser storage. Take what you need as an injected parameter.",
}));

// Rules requested in packages/web/ARCHITECTURE.md section 1.4. Each is explained where it is used.
const webSrc = "packages/web/src";
const webTestFiles = [`${webSrc}/**/*.test.{ts,tsx}`, `${webSrc}/test/**`];

// ARCHITECTURE.md 1.4 rule 1 (section 4): only env/env.ts reads import.meta.env.
const importMetaEnvSyntax = {
  selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
  message: "import.meta.env is read only in packages/web/src/env/env.ts. Import ENV or APP_CONFIG from env/.",
};

// ARCHITECTURE.md 1.4 rule 3 (A17, A20): anchors with an href and iframes are rendered only by safe-content/.
const anchorSyntax = {
  selector: "JSXOpeningElement[name.name='a']:has(JSXAttribute[name.name='href'])",
  message: "A JSX <a href> is allowed only under packages/web/src/safe-content/. Use ExternalLink, or react-router's Link for in-app navigation.",
};
const iframeSyntax = {
  selector: "JSXOpeningElement[name.name='iframe']",
  message: "A JSX <iframe> is allowed only under packages/web/src/safe-content/.",
};

// 06-intro (CLAUDE.md hard rule, ARCHITECTURE.md "Rules for every builder"): UI code never inspects a contract address; it
// asks core's registry for the family and the overrides. A production file holds no address literal and does not compare
// or switch on an arbitrable, arbitrator or proxy address. Test files are exempt from the syntax rules (their fixtures are
// addresses); viem's isAddressEqual is banned in every web file.
const addressLiteral = "/(^|[^0-9a-fA-F])0x[0-9a-fA-F]{40}([^0-9a-fA-F]|$)/";
const contractName = "/^(arbitrable|arbitrated|arbitrator|proxy)(address)?$/i";
const contractOperand = (side) =>
  [`${side}.name`, `${side}.property.name`, `${side}.callee.object.name`, `${side}.callee.object.property.name`].map((path) => `[${path}=${contractName}]`);
const addressMessage = "06-intro: UI code never inspects a contract address. Ask the registry in @dispute-resolver/core for the family and the overrides.";
const addressSyntax = [
  { selector: `Literal[value=${addressLiteral}]`, message: addressMessage },
  { selector: `TemplateElement[value.cooked=${addressLiteral}]`, message: addressMessage },
  {
    // An equality check against undefined, null or a boolean only asks whether the address is known yet. The type test
    // matters: esquery stringifies a missing attribute, so a bare [left.name='undefined'] matches every non-identifier.
    selector: `BinaryExpression[operator=/^[!=]==?$/]:matches(${[...contractOperand("left"), ...contractOperand("right")].join(", ")}):not([left.type='Identifier'][left.name='undefined'], [right.type='Identifier'][right.name='undefined'], [left.raw=/^(null|true|false)$/], [right.raw=/^(null|true|false)$/])`,
    message: addressMessage,
  },
  { selector: `SwitchStatement:matches(${contractOperand("discriminant").join(", ")})`, message: addressMessage },
];
const addressEqualPath = { name: "viem", importNames: ["isAddressEqual"], message: addressMessage };

// Builds the web no-restricted-syntax option. The flags lift the exceptions of rules 1 and 3 and exempt test files from 06-intro.
const webSyntax = ({ env = true, links = true, addresses = true } = {}) => [
  "error",
  ...restrictedSyntax,
  ...(env ? [importMetaEnvSyntax] : []),
  ...(links ? [anchorSyntax, iframeSyntax] : []),
  ...(addresses ? addressSyntax : []),
];

// ARCHITECTURE.md 1.4 rule 4 (A17): the library's FileViewer renders attachments inline.
const fileViewerPath = {
  name: "@kleros/ui-components-library",
  importNames: ["FileViewer"],
  message: "FileViewer is banned (A17): attachments are never rendered inline. Use Attachment from safe-content.",
};

// ARCHITECTURE.md 1.4 rule 4: reads go through core and the data layer (section 5), never through wagmi's read hooks.
const wagmiReadHooksPath = {
  name: "wagmi",
  importNames: ["usePublicClient", "useReadContract", "useReadContracts", "useBalance", "useBlockNumber", "useClient"],
  message: "wagmi read hooks are banned. Reads go through core and the data layer; wagmi only signs.",
};

// ARCHITECTURE.md 1.4 rule 4 (section 1.3): a directory is imported through its index only.
const dirs = "env|parity|ui|shell|routing|wallet|data|runner|atlas|safe-content";
const pageDirs = "ongoing|create|case|case-summary|case-appeal|case-evidence";
const deepImportPattern = {
  regex: `^(?:\\.{1,2}/)+(?:(?:${dirs}|pages/(?:${pageDirs}))|(?:${pageDirs}))/(?!index(?:\\.[jt]sx?)?$).+`,
  message: "Import another directory through its index (../<dir>), not through its files.",
};

// ARCHITECTURE.md 1.4 rule 5 (C9): nothing outside tests and src/test/ imports from src/test/.
const testImportPattern = {
  regex: "^(?:\\.{1,2}/)+test(?:/.*)?$",
  message: "src/test/ is for tests only (C9). A production file must not import it.",
};

// C9: the Playwright suites under packages/web/e2e/ (the golden harness provider among them) are test code; no file under
// src/ imports them, tests included (their doubles live in src/test/).
const e2eImportPattern = {
  regex: "^(?:\\.{1,2}/)+e2e(?:/.*)?$",
  message: "packages/web/e2e/ is the Playwright harness (C9). No file under src/ may import it.",
};

// Builds the web no-restricted-imports option. The flags lift the single-directory exceptions of rule 4.
const webImports = ({ reown = true, markdown = true, app = true, testImports = true } = {}) => [
  "error",
  {
    paths: [fileViewerPath, wagmiReadHooksPath, addressEqualPath],
    patterns: [
      rehypeRawBan,
      deepImportPattern,
      ...(reown ? [{ group: ["@reown/*"], message: "@reown/* is used only under packages/web/src/wallet/ (section 2.3)." }] : []),
      ...(markdown ? [{ group: ["react-markdown", "react-markdown/*"], message: "react-markdown is used only under packages/web/src/safe-content/ (SafeMarkdown)." }] : []),
      ...(app ? [{ group: ["@kleros/kleros-app", "@kleros/kleros-app/*"], message: "@kleros/kleros-app is used only under packages/web/src/atlas/ (section 8)." }] : []),
      ...(testImports ? [testImportPattern] : []),
      e2eImportPattern,
    ],
  },
];

export default defineConfig([
  globalIgnores([
    // The old app, kept as read-only reference until the hand-off phase.
    "src/**",
    "public/**",
    "scripts/generate-reality-known-questions.js",
    "scripts/check-quality.sh",
    "scripts/pre-change-check.sh",
    "build/**",
    // Documentation, dependencies and generated output.
    "docs/**",
    ".yarn/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/test-results/**",
    "**/playwright-report/**",
    "**/.vite/**",
  ]),

  js.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  {
    // Config files are plain JavaScript and sit outside every tsconfig.
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  sonarjs.configs.recommended,

  {
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-imports": ["error", { patterns: [rehypeRawBan] }],
      "no-restricted-syntax": ["error", ...restrictedSyntax],
    },
  },

  {
    files: ["packages/web/**/*.{ts,tsx}"],
    extends: [react.configs.flat.recommended, react.configs.flat["jsx-runtime"], reactHooks.configs.flat["recommended-latest"]],
    languageOptions: { globals: globals.browser },
    settings: { react: { version: "detect" } },
    rules: {
      "react/no-danger": "error",
    },
  },

  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", ...coreBannedGlobals],
      "no-restricted-imports": ["error", { patterns: coreBannedImports }],
    },
  },
  // ARCHITECTURE.md 1.4 rules 1 and 3: import.meta.env, JSX <a href> and JSX <iframe> are confined to one directory each.
  // 06-intro: no production file inspects a contract address. A later block replaces the rule wholesale, so each block
  // carries the full list minus its own exceptions.
  { files: [`${webSrc}/**/*.{ts,tsx}`], rules: { "no-restricted-syntax": webSyntax() } },
  { files: webTestFiles, rules: { "no-restricted-syntax": webSyntax({ addresses: false }) } },
  {
    // Rule 1 override: env.ts is the one reader of import.meta.env.
    files: [`${webSrc}/env/env.ts`],
    rules: { "no-restricted-syntax": webSyntax({ env: false }) },
  },
  {
    // Rule 3 override: safe-content renders the links and frames.
    files: [`${webSrc}/safe-content/**/*.{ts,tsx}`],
    ignores: webTestFiles,
    rules: { "no-restricted-syntax": webSyntax({ links: false }) },
  },
  { files: [`${webSrc}/safe-content/**/*.test.{ts,tsx}`], rules: { "no-restricted-syntax": webSyntax({ links: false, addresses: false }) } },

  // ARCHITECTURE.md 1.4 rules 4 and 5: restricted imports. A later block replaces an earlier one wholesale, so each
  // exception directory gets the full list minus its own entry, in a production variant and a test variant.
  { files: [`${webSrc}/**/*.{ts,tsx}`], rules: { "no-restricted-imports": webImports() } },
  { files: webTestFiles, rules: { "no-restricted-imports": webImports({ testImports: false }) } },
  ...[
    ["wallet", { reown: false }],
    ["safe-content", { markdown: false }],
    ["atlas", { app: false }],
  ].flatMap(([dir, lift]) => [
    { files: [`${webSrc}/${dir}/**/*.{ts,tsx}`], ignores: webTestFiles, rules: { "no-restricted-imports": webImports(lift) } },
    { files: [`${webSrc}/${dir}/**/*.test.{ts,tsx}`], rules: { "no-restricted-imports": webImports({ ...lift, testImports: false }) } },
  ]),

  {
    // 06 §2 declares `type ChainId = number`, and core adds `type UnixSeconds = number` beside it: named aliases of a
    // primitive that tell a chain ID or a time in seconds apart from the other numbers at every use. A branded type would
    // make every number literal unassignable, so the redundant-alias rule is off for the file that declares them, and only
    // there. The matching SonarCloud rule (S6564) needs the same exemption on this file in the project's quality settings.
    files: ["packages/core/src/types.ts"],
    rules: { "sonarjs/redundant-type-aliases": "off" },
  },

  {
    // ARCHITECTURE.md 1.4 rule 2 (ADR 0004, section 7): the runner page evaluates the fetched script, and this is the only
    // file in web allowed to. The script is untrusted but runs in an opaque-origin sandboxed iframe whose header CSP and
    // message-port-only channel are the containment (B1, C4, C7); evaluating it is the runner's purpose.
    files: [`${webSrc}/runner/page/evaluate.ts`],
    rules: { "no-eval": "off", "no-implied-eval": "off", "no-new-func": "off", "sonarjs/code-eval": "off" },
  },
]);
