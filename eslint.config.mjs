import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import tseslint from "typescript-eslint";

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

// Zod compiles its object parsers with the Function constructor unless it is configured jitless before the first schema
// exists; packages/core/src/zod.ts does that, so every schema module takes z from there (web through the core package).
const zodBan = {
  regex: "^zod(?:/.*)?$",
  message: "Import z from packages/core/src/zod.ts, which turns zod's compiled parsers off before any schema exists (the CSP has no unsafe-eval).",
};

const coreBannedImportsExceptZod = [
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
const coreBannedImports = [...coreBannedImportsExceptZod, zodBan];

const coreTestFiles = ["packages/core/**/*.test.ts", "packages/core/src/test/**", "packages/core/src/**/__fixtures__/**"];
const coreTestOnlyImports = [
  {
    regex: String.raw`^(?:\.{1,2}/)+(?:src/)?test(?:/.*)?$`,
    message: "packages/core/src/test/ is for tests only. A production file must not import it.",
  },
  {
    regex: "(?:^|/)__fixtures__(?:/|$)",
    message: "__fixtures__/ holds recorded test data. A production file must not import it.",
  },
  {
    regex: String.raw`\?raw$`,
    message: "The ?raw import is declared for tests only. A production file of core takes its inputs as parameters.",
  },
];

const coreBannedGlobals = ["window", "document", "localStorage", "sessionStorage", "navigator"].map((name) => ({
  name,
  message: "core must not touch the DOM or browser storage. Take what you need as an injected parameter.",
}));

const webSrc = "packages/web/src";
const webTestFiles = [`${webSrc}/**/*.test.{ts,tsx}`, `${webSrc}/test/**`];

const importMetaEnvSyntax = {
  selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
  message: "import.meta.env is read only in packages/web/src/env/env.ts. Import ENV or APP_CONFIG from env/.",
};

const anchorSyntax = {
  selector: "JSXOpeningElement[name.name='a']:has(JSXAttribute[name.name='href'])",
  message: "A JSX <a href> is allowed only under packages/web/src/safe-content/. Use ExternalLink, or react-router's Link for in-app navigation.",
};
const iframeSyntax = {
  selector: "JSXOpeningElement[name.name='iframe']",
  message: "A JSX <iframe> is allowed only under packages/web/src/safe-content/.",
};

// Test files are exempt from the address syntax rules (their fixtures are addresses); viem's isAddressEqual is banned in
// every web file.
const addressLiteral = "/(^|[^0-9a-fA-F])0x[0-9a-fA-F]{40}([^0-9a-fA-F]|$)/";
const contractName = "/^(arbitrable|arbitrated|arbitrator|proxy)(address)?$/i";
const contractOperand = (side) =>
  [`${side}.name`, `${side}.property.name`, `${side}.callee.object.name`, `${side}.callee.object.property.name`].map((path) => `[${path}=${contractName}]`);
const addressMessage = "UI code never inspects a contract address. Ask the registry in @dispute-resolver/core for the family and the overrides.";
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

const webSyntax = ({ env = true, links = true, addresses = true } = {}) => [
  "error",
  ...restrictedSyntax,
  ...(env ? [importMetaEnvSyntax] : []),
  ...(links ? [anchorSyntax, iframeSyntax] : []),
  ...(addresses ? addressSyntax : []),
];

// Rendered inline, an attachment would execute untrusted documents in the app's origin.
const fileViewerPath = {
  name: "@kleros/ui-components-library",
  importNames: ["FileViewer"],
  message: "FileViewer is banned: attachments are never rendered inline. Use Attachment from safe-content.",
};

const wagmiReadHooksPath = {
  name: "wagmi",
  importNames: ["usePublicClient", "useReadContract", "useReadContracts", "useBalance", "useBlockNumber", "useClient"],
  message: "wagmi read hooks are banned. Reads go through core and the data layer; wagmi only signs.",
};

const dirs = "env|ui|shell|routing|wallet|data|runner|atlas|safe-content";
const pageDirs = "ongoing|create|case|case-summary|case-appeal|case-evidence";
const deepImportPattern = {
  regex: String.raw`^(?:\.{1,2}/)+(?:(?:${dirs}|pages/(?:${pageDirs}))|(?:${pageDirs}))/(?!index(?:\.[jt]sx?)?$).+`,
  message: "Import another directory through its index (../<dir>), not through its files.",
};

const testImportPattern = {
  regex: String.raw`^(?:\.{1,2}/)+test(?:/.*)?$`,
  message: "src/test/ is for tests only. A production file must not import it.",
};

// Tests under src/ are banned too: their doubles live in src/test/, never in the Playwright harness.
const e2eImportPattern = {
  regex: String.raw`^(?:\.{1,2}/)+e2e(?:/.*)?$`,
  message: "packages/web/e2e/ is the Playwright harness. No file under src/ may import it.",
};

const webImports = ({ reown = true, markdown = true, app = true, testImports = true } = {}) => [
  "error",
  {
    paths: [fileViewerPath, wagmiReadHooksPath, addressEqualPath],
    patterns: [
      rehypeRawBan,
      deepImportPattern,
      ...(reown ? [{ group: ["@reown/*"], message: "@reown/* is used only under packages/web/src/wallet/." }] : []),
      ...(markdown ? [{ group: ["react-markdown", "react-markdown/*"], message: "react-markdown is used only under packages/web/src/safe-content/ (SafeMarkdown)." }] : []),
      ...(app ? [{ group: ["@kleros/kleros-app", "@kleros/kleros-app/*"], message: "@kleros/kleros-app is used only under packages/web/src/atlas/." }] : []),
      ...(testImports ? [testImportPattern] : []),
      e2eImportPattern,
      zodBan,
    ],
  },
];

export default defineConfig([
  globalIgnores([
    ".yarn/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/test-results/**",
    "**/playwright-report/**",
    "**/.vite/**",
    "**/.stryker-tmp/**",
    "packages/core/reports/**",
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
      "no-restricted-imports": ["error", { patterns: [...coreBannedImports, ...coreTestOnlyImports] }],
    },
  },
  { files: coreTestFiles, rules: { "no-restricted-imports": ["error", { patterns: coreBannedImports }] } },
  // zod.ts is the one module of core that imports zod itself; the operator scripts run in Node, where no policy applies.
  {
    files: ["packages/core/src/zod.ts", "packages/core/scripts/**/*.ts"],
    ignores: coreTestFiles,
    rules: { "no-restricted-imports": ["error", { patterns: [...coreBannedImportsExceptZod, ...coreTestOnlyImports] }] },
  },
  // A later block replaces a rule wholesale, so each block below carries the full list minus its own exceptions.
  { files: [`${webSrc}/**/*.{ts,tsx}`], rules: { "no-restricted-syntax": webSyntax() } },
  { files: webTestFiles, rules: { "no-restricted-syntax": webSyntax({ addresses: false }) } },
  {
    files: [`${webSrc}/env/env.ts`],
    rules: { "no-restricted-syntax": webSyntax({ env: false }) },
  },
  {
    files: [`${webSrc}/safe-content/**/*.{ts,tsx}`],
    ignores: webTestFiles,
    rules: { "no-restricted-syntax": webSyntax({ links: false }) },
  },
  { files: [`${webSrc}/safe-content/**/*.test.{ts,tsx}`], rules: { "no-restricted-syntax": webSyntax({ links: false, addresses: false }) } },

  { files: [`${webSrc}/**/*.{ts,tsx}`], rules: { "no-restricted-imports": webImports() } },
  { files: webTestFiles, rules: { "no-restricted-imports": webImports({ testImports: false }) } },
  ...[
    { dir: "wallet", lift: { reown: false } },
    { dir: "safe-content", lift: { markdown: false } },
    { dir: "atlas", lift: { app: false } },
  ].flatMap(({ dir, lift }) => [
    { files: [`${webSrc}/${dir}/**/*.{ts,tsx}`], ignores: webTestFiles, rules: { "no-restricted-imports": webImports(lift) } },
    { files: [`${webSrc}/${dir}/**/*.test.{ts,tsx}`], rules: { "no-restricted-imports": webImports({ ...lift, testImports: false }) } },
  ]),

  {
    // Primitive aliases such as `ChainId` name what a number means; a branded type would make every literal unassignable.
    // SonarCloud's matching rule (S6564) needs the same exemption on this file in the project's quality settings.
    files: ["packages/core/src/types.ts"],
    rules: { "sonarjs/redundant-type-aliases": "off" },
  },

  {
    // The runner page evaluates the fetched dynamic script, and this is the only file in web allowed to. The script is
    // untrusted but runs in an opaque-origin sandboxed iframe whose header CSP and message-port-only channel are the
    // containment; evaluating it is the runner's purpose.
    files: [`${webSrc}/runner/page/evaluate.ts`],
    rules: { "no-eval": "off", "no-implied-eval": "off", "no-new-func": "off", "sonarjs/code-eval": "off" },
  },
]);
