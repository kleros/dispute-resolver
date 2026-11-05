/**
 * The only place in web that evaluates code, and it runs inside the opaque-origin runner page only. Indirect eval runs
 * in the global scope, so a top-level `function` or `var` becomes a global, as in a classic `<script>` element.
 */
export function evaluateInGlobalScope(source: string): void {
  (0, eval)(source);
}

/**
 * A `const` or `let` declaration stays local to its evaluation, and the default script `QmZZHw…` declares
 * `const getMetaEvidence`, so the call must be part of the same source. The line break ends a trailing line comment
 * and the semicolon ends a statement the script left open.
 */
export function runScriptInGlobalScope(scriptText: string): void {
  evaluateInGlobalScope(`${scriptText}\n;getMetaEvidence();`);
}
