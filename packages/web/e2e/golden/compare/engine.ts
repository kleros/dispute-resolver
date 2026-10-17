import { LEDGER, showsMetaEvidenceFailure, type CaseContext, type CaseRule, type CreateContext, type CreateRule, type OngoingContext, type OngoingRule } from "../ledger";
import type { CaseHighlights, ProductionMayFail, StableCase } from "../stableTier";
import { CASE_FIELDS, CREATE_FIELDS, ONGOING_FIELDS, type CaseField, type CaseSnapshot, type Snapshot } from "../types";
import { CASE_COMPARATORS, caseFieldValue, type Mismatch } from "./caseFields";
import { CREATE_COMPARATORS, ONGOING_COMPARATORS, createFieldValue, ongoingFieldValue } from "./screenFields";
import { sameJson } from "./values";

// Applies the comparison rules and the ledger, per field (04 §1).

export type FieldStatus = "match" | "expected-difference" | "difference" | "unobservable" | "skipped";

export interface FieldResult {
  readonly field: string;
  readonly status: FieldStatus;
  readonly production: unknown;
  readonly next: unknown;
  /** The ledger entries that decided the field. */
  readonly entries: readonly string[];
  /** The ledger's expected new value, when an entry replaced the comparison with production. */
  readonly expected?: unknown;
  readonly detail: string;
  /** The differences no ledger entry accounts for. */
  readonly unexplained: readonly Mismatch[];
}

export interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  /** A failed blocking check fails the screen; a non-blocking one is reported as a note. */
  readonly blocking: boolean;
  readonly expected: unknown;
  readonly actual: unknown;
}

interface AcceptLike<C> {
  readonly kind: "accept";
  readonly key: string;
  readonly accepts: (mismatch: Mismatch, context: C) => boolean;
}

interface Located<R> {
  readonly entry: string;
  readonly rule: R;
}

const CASE_RULES: readonly Located<CaseRule>[] = LEDGER.flatMap((entry) => entry.rules.flatMap((rule) => (rule.screen === "case" ? [{ entry: entry.id, rule }] : [])));
const ONGOING_RULES: readonly Located<OngoingRule>[] = LEDGER.flatMap((entry) => entry.rules.flatMap((rule) => (rule.screen === "ongoing" ? [{ entry: entry.id, rule }] : [])));
const CREATE_RULES: readonly Located<CreateRule>[] = LEDGER.flatMap((entry) => entry.rules.flatMap((rule) => (rule.screen === "create" ? [{ entry: entry.id, rule }] : [])));

/** Accepts each mismatch through the ledger; the field is an expected difference only when every mismatch is accepted. */
function resolveMismatches<C>(
  field: string,
  production: unknown,
  next: unknown,
  mismatches: readonly Mismatch[],
  rules: readonly Located<AcceptLike<C>>[],
  context: C,
): FieldResult {
  if (mismatches.length === 0) return { field, status: "match", production, next, entries: [], detail: "equal under the 04 §1 rules", unexplained: [] };
  const entries = new Set<string>();
  const unexplained = mismatches.filter((mismatch) => {
    const accepting = rules.filter(({ rule }) => rule.key === mismatch.key && rule.accepts(mismatch, context));
    accepting.forEach(({ entry }) => entries.add(entry));
    return accepting.length === 0;
  });
  if (unexplained.length === 0) {
    return { field, status: "expected-difference", production, next, entries: [...entries], detail: `differs as ${[...entries].join(", ")} expects`, unexplained: [] };
  }
  const where = unexplained.map((mismatch) => mismatch.path).join(", ");
  return { field, status: "difference", production, next, entries: [...entries], detail: `differs from production with no ledger entry: ${where}`, unexplained };
}

function acceptRules<C>(rules: readonly Located<{ readonly kind: string }>[]): Located<AcceptLike<C>>[] {
  return rules.filter((located): located is Located<AcceptLike<C>> => located.rule.kind === "accept");
}

/**
 * Why a Case field cannot be compared, or `null`. Withdrawable amounts are compared only under the account context; a
 * case whose ledger test needs that context is not skipped here, its recorded amount replaces the comparison and
 * `checkAccountContext` fails it when an app did not use the account.
 */
function skipReason(field: CaseField, context: CaseContext, accountReason: string | null): { status: FieldStatus; detail: string } | null {
  const unobservable = context.production.unobservable[field] ?? context.next.unobservable[field];
  if (field === "appealPanel.withdrawableWei") {
    if (unobservable !== undefined) return { status: "skipped", detail: `the account context was not applied: ${unobservable}` };
    if (context.production.account === null) return { status: "skipped", detail: `no account context: ${accountReason ?? "the case has no contributor"}` };
  }
  return unobservable === undefined ? null : { status: "unobservable", detail: unobservable };
}

/**
 * Why production's snapshot of a case is not compared, or `null`: the case is one production may fail to settle
 * (`productionMayFail` in stableTier.ts) and it did. A dispute production does not load (04 §2) fails when its page
 * never settles. An environment failure also covers a page that settled without its meta-evidence: the third-party
 * service failing leaves production's script without a result either way.
 */
function productionFailed(testCase: StableCase | null, production: CaseSnapshot): string | null {
  const mayFail = testCase?.productionMayFail;
  if (mayFail === undefined) return null;
  if (mayFail.cause === "does-not-load") return production.settled ? null : "production does not load this dispute (04 §2)";
  return production.settled && production.metaEvidenceLoaded ? null : `environment result, not compared: ${mayFail.reason}`;
}

function evaluateCaseField(field: CaseField, context: CaseContext, accountReason: string | null): FieldResult {
  const production = caseFieldValue(context.production, field);
  const next = caseFieldValue(context.next, field);
  const productionFailure = productionFailed(context.testCase, context.production);
  if (productionFailure !== null) {
    return { field, status: "skipped", production, next, entries: [], detail: productionFailure, unexplained: [] };
  }
  const replacements = CASE_RULES.flatMap(({ entry, rule }) => (rule.kind === "replace" && rule.field === field && rule.applies(context) ? [{ entry, rule }] : []));
  if (replacements.length > 0) {
    const verdicts = replacements.map(({ entry, rule }) => ({ entry, verdict: rule.check(context), expected: rule.expected }));
    const entries = verdicts.map(({ entry }) => entry);
    const ok = verdicts.every(({ verdict }) => verdict.ok);
    const expected = verdicts.length === 1 ? verdicts[0]?.verdict.expected : verdicts.map(({ verdict }) => verdict.expected);
    let status: FieldStatus = "difference";
    if (ok) status = sameJson(production, next) ? "match" : "expected-difference";
    const detail = `${entries.join(", ")}: ${verdicts.map((verdict) => verdict.expected).join("; ")}`;
    return { field, status, production, next, entries, expected, detail, unexplained: [] };
  }
  const skip = skipReason(field, context, accountReason);
  if (skip !== null) return { field, status: skip.status, production, next, entries: [], detail: skip.detail, unexplained: [] };
  const mismatches = CASE_COMPARATORS[field](context.production, context.next);
  return resolveMismatches(field, production, next, mismatches, acceptRules<CaseContext>(CASE_RULES), context);
}

export function evaluateCase(context: CaseContext, accountReason: string | null): FieldResult[] {
  return CASE_FIELDS.map((field) => evaluateCaseField(field, context, accountReason));
}

export function evaluateOngoing(context: OngoingContext): FieldResult[] {
  return ONGOING_FIELDS.map((field) =>
    resolveMismatches(
      field,
      ongoingFieldValue(context.production, field),
      ongoingFieldValue(context.next, field),
      ONGOING_COMPARATORS[field](context.production, context.next),
      acceptRules<OngoingContext>(ONGOING_RULES),
      context,
    ),
  );
}

export function evaluateCreate(context: CreateContext): FieldResult[] {
  return CREATE_FIELDS.map((field) =>
    resolveMismatches(
      field,
      createFieldValue(context.production, field),
      createFieldValue(context.next, field),
      CREATE_COMPARATORS[field](context.production, context.next),
      acceptRules<CreateContext>(CREATE_RULES),
      context,
    ),
  );
}

function check(name: string, expected: unknown, actual: unknown, blocking = true): CheckResult {
  return { name, ok: sameJson(expected, actual), blocking, expected, actual };
}

type HighlightReader = (snapshot: CaseSnapshot) => unknown;

/** The highlights compared as a value; `evidenceDisplayText` is checked with the rendered display (`evidenceDisplayChecks`). */
type ValueHighlight = Exclude<keyof CaseHighlights, "evidenceDisplayText">;

/** How each 04 §2 highlight is read from the new app's snapshot. */
const HIGHLIGHT_READERS: Readonly<Record<ValueHighlight, HighlightReader>> = {
  compatibility: (s) => s.compatibility,
  family: (s) => s.family,
  titles: (s) => s.rulingOptions?.titles ?? null,
  reservedTitles: (s) => (s.rulingOptions === null ? null : Object.values(s.rulingOptions.reserved)),
  // 04 §2 counts evidence events; the new app shows the valid ones and counts the hidden ones (D-22).
  evidenceCount: (s) => (s.evidence === null ? null : s.evidence.length + (s.hiddenEvidenceCount ?? 0)),
  appealPanelKind: (s) => s.appealPanel.kind,
  decisionWonBy: (s) => s.decision?.wonBy ?? null,
  realityNotice: (s) => s.realityNotice,
  arbitrableAppHidden: (s) => s.links.arbitrableApp === null,
  evidenceDisplay: (s) => s.evidenceDisplay !== null,
};

function isValueHighlight(name: keyof CaseHighlights): name is ValueHighlight {
  return name !== "evidenceDisplayText";
}

/**
 * 06 §5 item 2: an evidence display the case shows must render, not only be pointed at. The frame holds the document
 * of its `src` (not the browser's error page) and, when the case names it, shows the item's text.
 */
function evidenceDisplayChecks(highlights: CaseHighlights, next: CaseSnapshot): CheckResult[] {
  const display = next.evidenceDisplay;
  if (highlights.evidenceDisplay !== true || display === null) return [];
  const checks = [check("06 §5 item 2: the evidence display holds the document of its src", `${display.srcOrigin}${display.srcPath}`, display.rendered.documentUrl)];
  const text = highlights.evidenceDisplayText;
  if (text !== undefined) checks.push(check(`06 §5 item 2: the evidence display renders "${text}"`, true, display.rendered.text.includes(text)));
  return checks;
}

/** The concrete values 04 §2 states for the case, checked on the new app, plus the arbitrable from the arbitrator. */
export function checkHighlights(testCase: StableCase, next: CaseSnapshot): CheckResult[] {
  const checks = [check("arbitrable (04 §2 prefix)", testCase.arbitrable.toLowerCase(), next.arbitrable?.toLowerCase().slice(0, testCase.arbitrable.length) ?? null)];
  const highlights = testCase.highlights ?? {};
  for (const name of (Object.keys(highlights) as (keyof CaseHighlights)[]).filter(isValueHighlight)) {
    checks.push(check(name, highlights[name], HIGHLIGHT_READERS[name](next)));
  }
  return [...checks, ...evidenceDisplayChecks(highlights, next)];
}

function lowercase(address: string | null): string | null {
  return address === null ? null : address.toLowerCase();
}

/**
 * The account context of 04 §1 ("the snapshot records which account was used"). A case whose ledger test reads the
 * withdrawable amount (a recorded `accountContext`: D-02, D-30) fails unless both apps used the recorded account, so a
 * run without `golden/accounts.json` or without a wallet in the new app's build cannot pass it. For any other case with
 * an account, the new app not applying it is a note: its withdrawable amount is reported as skipped.
 */
export function checkAccountContext(testCase: StableCase, production: CaseSnapshot, next: CaseSnapshot, intended: string | null): CheckResult[] {
  const record = testCase.accountContext;
  if (record !== undefined) {
    return [
      check("account context (04 §1): production used the recorded account", record.account, lowercase(production.account)),
      check("account context (04 §1): the new app connected the recorded account", record.account, lowercase(next.account)),
    ];
  }
  if (intended === null) return [];
  return [check("account context (04 §1): the new app connected the case's account", intended, lowercase(next.account), false)];
}

/** Production's settle check on a case it may fail to settle: a note with the reason, never a failure. */
function productionMayFailCheck(mayFail: ProductionMayFail, production: CaseSnapshot): CheckResult {
  if (mayFail.cause === "does-not-load") return check("production settled (04 §2: it does not load this dispute)", true, production.settled, false);
  return check(`production settled with its meta-evidence (an environment result otherwise: ${mayFail.reason})`, true, production.settled && production.metaEvidenceLoaded, false);
}

/**
 * Both pages settled within their budget; an unsettled page is compared as it was, and the case fails. On a case
 * production may fail to settle (`productionMayFail`), production's check is a note; the new app's always blocks.
 */
export function checkSettled(production: Snapshot, next: Snapshot, testCase: StableCase | null = null): CheckResult[] {
  const mayFail = testCase?.productionMayFail;
  return [
    mayFail === undefined || production.screen !== "case" ? check("production settled within its budget", true, production.settled) : productionMayFailCheck(mayFail, production),
    check("the new app settled within its budget", true, next.settled),
  ];
}

const TAMPERED_TITLE = "Invalid or tampered case data, refuse to arbitrate.";

/**
 * The degradation 04 §2 expects of a bad dispute (D-36): never a blank page, the dispute info and timeline render, and
 * the meta-evidence section either loaded or shows "unavailable" with the reason, never nothing. Whether the
 * meta-evidence still fails (or still yields the placeholder) is the precondition 04 §2 recorded on 2026-10-12; it is
 * reported, not enforced, because the parity comparison already covers what both apps show.
 */
export function checkDegradation(testCase: StableCase, production: CaseSnapshot, next: CaseSnapshot): CheckResult[] {
  if (testCase.degradation === undefined) return [];
  const checks = [
    check("the case page renders", true, next.exists),
    check("the dispute info and timeline render", true, next.period !== null && next.timeline !== null && next.numberOfVotes !== null && next.courtName !== null),
  ];
  if (testCase.degradation === "meta-evidence-failed") {
    checks.push(
      check("the meta-evidence section loaded, or shows its failed state with a reason (D-36)", true, next.metaEvidenceLoaded || showsMetaEvidenceFailure(next)),
      check("precondition: the meta-evidence still fails to load in the new app", false, next.metaEvidenceLoaded, false),
    );
  } else {
    checks.push(
      check("precondition: the 'invalid or tampered' placeholder on the new app", TAMPERED_TITLE, next.title, false),
      check("precondition: the 'invalid or tampered' placeholder on production", TAMPERED_TITLE, production.title, false),
    );
  }
  return checks;
}
