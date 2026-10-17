/**
 * The only place in web that evaluates code (ADR 0004, ARCHITECTURE.md §7.2, lint rule 2 of §1.4). It runs inside the
 * opaque-origin runner page only. Indirect eval runs in the global scope, so a top-level `function` or `var` becomes a
 * global, as it did when the code sat in a `<script>` element.
 */
export function evaluateInGlobalScope(source: string): void {
  (0, eval)(source);
}

/**
 * Runs a dynamic script and calls its entry point in one evaluation, as the old runner's single `<script>` element did
 * (spec §9.5). A `const` or `let` declaration stays local to its evaluation, and the default script `QmZZHw…` declares
 * `const getMetaEvidence`, so the call must be part of the same source. The line break ends a trailing line comment
 * and the semicolon ends a statement the script left open.
 */
export function runScriptInGlobalScope(scriptText: string): void {
  evaluateInGlobalScope(`${scriptText}\n;getMetaEvidence();`);
}
