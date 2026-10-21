# AI Agent SonarCloud Workflow

## Overview

This document outlines the workflow for AI agents working with this codebase to stay within SonarCloud's quality standards. The rules of the tree itself (layout, security, tests, dependencies, git) are in [CLAUDE.md](../CLAUDE.md), which wins wherever the two differ.

SonarCloud analyses the project as organization `kleros`, project key `kleros_dispute-resolver`. Locally, the same family of rules is available in two ways:

- **`eslint-plugin-sonarjs`**, its `recommended` config wired into the root `eslint.config.mjs`, run by `yarn lint` locally and in CI.
- **SonarLint in connected mode** (`.sonarlint/connectedMode.json`, `.vscode/settings.json`), which shows the SonarCloud ruleset as IDE diagnostics in real time.

## Prerequisites

- Node 22 (`.nvmrc`; Volta pins 22.23.2) and yarn 4; `yarn install` at the repository root.
- Optional: the SonarLint extension (`sonarsource.sonarlint-vscode`) bound to the SonarCloud project, for real-time diagnostics.

## Workflow Steps

### 1. Before Making Any Changes

#### Check Current State

```bash
yarn lint        # ESLint with eslint-plugin-sonarjs over both packages and eslint.config.mjs
yarn typecheck   # strict TypeScript over both packages
```

To lint one package only: `yarn workspace @dispute-resolver/core lint` or `yarn workspace @dispute-resolver/web lint`.

#### Review IDE Diagnostics

- Open the file in your IDE, or call `mcp__ide__getDiagnostics(uri="file:///absolute/path/to/packages/web/src/file.tsx")`
- Check the Problems panel for SonarLint issues
- Note any existing issues that should be fixed (CLAUDE.md: fix existing issues in files you touch)

### 2. During Development

#### Follow SonarCloud Patterns

- **Code style**: match existing code patterns; Prettier formats with `tabWidth: 2`, `printWidth: 180`
- **Types**: TypeScript strict, no `any`; untrusted JSON is `unknown` until a Zod schema parses it
- **Security**: no `eval`, `new Function`, `innerHTML` or `dangerouslySetInnerHTML` (the single exception is the script runner of ADR 0004)
- **Complexity**: keep functions small and focused (`sonarjs/cognitive-complexity`)
- **Errors**: core returns failures as values (`Outcome`) instead of throwing; transaction failures are always shown to the user, never swallowed

### 3. After Making Changes

#### Verify Quality

```bash
yarn lint
yarn typecheck
yarn test        # Vitest; unit tests never touch the network
```

CI runs `yarn typecheck`, `yarn lint`, `yarn test`, `yarn build` and `yarn check:bundle`.

#### IDE Verification

- Check the Problems panel for new issues
- Ensure no new SonarCloud warnings appear
- Verify existing issues are fixed (if touched)

### 4. Quality Gates

#### Must Fix (Blocker/Critical)

- Security vulnerabilities
- Major bugs or logic errors
- Critical performance issues

#### Should Fix (Major)

- Code smells in modified files
- Maintainability issues

#### Can Fix (Minor)

- Style inconsistencies
- Documentation improvements
- Minor optimizations

## Common SonarCloud Issues and Solutions

### 1. Complexity

```ts
// Too complex: nested conditions and a loop doing several jobs
function activeTitles(items: readonly Item[] | undefined): string[] {
  const titles: string[] = [];
  if (items && items.length > 0) {
    for (const item of items) {
      if (item.status === "active") {
        // lots of nested logic...
      }
    }
  }
  return titles;
}

// Simplified
function activeTitles(items: readonly Item[] | undefined): string[] {
  return (items ?? []).filter((item) => item.status === "active").map(titleOf);
}
```

### 2. Async Error Handling

```ts
// No status check, untyped result
async function fetchJson(url: string) {
  const response = await fetch(url);
  return response.json();
}

// A failure is a value, and the body stays `unknown` until a schema parses it
async function fetchJson(fetcher: Fetcher, url: string): Promise<Outcome<unknown>> {
  try {
    const response = await fetcher(url);
    if (!response.ok) return fail("rpc-error", `HTTP ${String(response.status)}`);
    return succeed((await response.json()) as unknown);
  } catch (error) {
    return fail("rpc-error", describeError(error));
  }
}
```

### 3. React State

```tsx
// Direct state mutation
items.push(newItem);
setItems(items);

// New array
setItems((previous) => [...previous, newItem]);
```

### 4. Chain Values

```ts
// No validation
function target(address: string) {
  return { address };
}

// viem's validation, and the lowercase form the registry uses
import { isAddress } from "viem";

function target(address: string): Address | null {
  return isAddress(address) ? toRegistryAddress(address) : null;
}
```

Amounts are `bigint` (viem); never convert them through `Number`.

## AI Agent Best Practices

### 1. Proactive Quality Checking

- Check file quality before modifications
- Use `yarn lint` and the IDE diagnostics as the sources of truth

### 2. Incremental Improvements

- Fix existing issues when touching files
- Don't introduce new quality issues
- Maintain or improve the overall quality score

### 3. Documentation

- Update comments when changing logic
- Document complex business rules
- Explain blockchain-specific patterns

### 4. Testing

- Run the tests of the package you changed after changes
- Ensure no regressions
- Add tests for new functionality, named after the rule they prove (CLAUDE.md)

## Troubleshooting

### SonarLint Extension Issues

- Restart the IDE if analysis stops working
- Check the extension status
- Verify the connection to the SonarCloud project (`.sonarlint/connectedMode.json`)

### Common Problems

- **No diagnostics appearing**: check the extension configuration; `yarn lint` still applies the sonarjs rules
- **Too many false positives**: review the SonarCloud project settings
- **Performance issues**: consider excluding large generated files from analysis

## Resources

- [SonarCloud Documentation](https://docs.sonarcloud.io/)
- [SonarLint VS Code Extension](https://marketplace.visualstudio.com/items?itemName=SonarSource.sonarlint-vscode)
- [Project CLAUDE.md](../CLAUDE.md): AI agent guidelines
- [ESLint configuration](../eslint.config.mjs)

## Summary

Agents keep the code within SonarCloud's rules with `yarn lint` (which carries `eslint-plugin-sonarjs`) and, when available, SonarLint's real-time diagnostics, and follow the patterns already in the codebase.
