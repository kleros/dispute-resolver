import { formatRuling, isSelfLink, normalizeIpfsPath, REGISTRY, type RulingOptions } from "@dispute-resolver/core";
import type { Mismatch } from "./compare/caseFields";
import { ipfsPath, sameAddress, sameJson, sameWei, weiAtLeast, withoutWhitespace } from "./compare/values";
import { recordedCourt } from "./courts";
import type { StableCase } from "./stableTier";
import type { AppealCardSnapshot, CaseSnapshot, CreateSnapshot, OngoingSnapshot, TimelineColumn, TimelineState } from "./types";

// The expected-difference table: every deviations-ledger entry (docs/parity/05-deviations-ledger.md, D-01 to D-56) and
// every proposal of docs/ledger-proposals.md (a test checks the table against its headings), with the snapshot fields
// it changes. 04 §1: "A field listed in the ledger as a deviation is compared against the ledger's expected new value,
// not against production."
//
// A rule is applied per field, in one of two ways:
// - `replace`: when it applies, the field is checked against the entry's expected new value instead of production;
// - `accept`: a mismatch with production under the rule key is accepted when it is exactly the change the entry describes.
// An entry that changes no snapshot field has no rules and says where its behavior is tested instead.

export interface CaseContext {
  readonly production: CaseSnapshot;
  readonly next: CaseSnapshot;
  readonly testCase: StableCase | null;
  /** The new app's origin, for the self-link rule (D-28). */
  readonly newOrigin: string;
}

export interface OngoingContext {
  readonly production: OngoingSnapshot;
  readonly next: OngoingSnapshot;
}

export interface CreateContext {
  readonly production: CreateSnapshot;
  readonly next: CreateSnapshot;
}

export interface Verdict {
  readonly ok: boolean;
  readonly expected: unknown;
}

interface ReplaceRule<C> {
  readonly kind: "replace";
  readonly field: string;
  /** The ledger's expected new value, in words, for the report. */
  readonly expected: string;
  readonly applies: (context: C) => boolean;
  readonly check: (context: C) => Verdict;
}

interface AcceptRule<C> {
  readonly kind: "accept";
  readonly key: string;
  readonly expected: string;
  readonly accepts: (mismatch: Mismatch, context: C) => boolean;
}

export type CaseRule = ({ readonly screen: "case" } & ReplaceRule<CaseContext>) | ({ readonly screen: "case" } & AcceptRule<CaseContext>);
export type OngoingRule = { readonly screen: "ongoing" } & AcceptRule<OngoingContext>;
export type CreateRule = { readonly screen: "create" } & AcceptRule<CreateContext>;
export type LedgerRule = CaseRule | OngoingRule | CreateRule;

export interface LedgerEntry {
  readonly id: string;
  readonly title: string;
  /** The snapshot fields the entry changes; empty when it changes none. */
  readonly fields: readonly string[];
  /** Where the entry is tested when it changes no snapshot field, or how it is applied. */
  readonly note: string;
  readonly rules: readonly LedgerRule[];
}

function replaceCase(field: string, expected: string, applies: (context: CaseContext) => boolean, check: (context: CaseContext) => Verdict): CaseRule {
  return { screen: "case", kind: "replace", field, expected, applies, check };
}

function acceptCase(key: string, expected: string, accepts: (mismatch: Mismatch, context: CaseContext) => boolean): CaseRule {
  return { screen: "case", kind: "accept", key, expected, accepts };
}

function acceptOngoing(key: string, expected: string, accepts: (mismatch: Mismatch, context: OngoingContext) => boolean): OngoingRule {
  return { screen: "ongoing", kind: "accept", key, expected, accepts };
}

function noField(id: string, title: string, note: string): LedgerEntry {
  return { id, title, fields: [], note, rules: [] };
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isCaseOf(context: CaseContext, entry: string): boolean {
  return context.testCase?.deviations?.includes(entry) === true;
}

/**
 * The family 04 §2 names for the case (its `family` highlight), or for a live pick the family `yarn golden-gate live`
 * recorded (liveTier.ts), never the family the new app reports: a misdetected family must not switch on the rule that
 * hides its own symptoms. The highlight check holds the new app to it.
 */
function expectedFamily(context: CaseContext): string | null {
  return context.testCase?.highlights?.family ?? null;
}

/**
 * A pick with no recorded family (a `golden/live.json` written before picks recorded one) in the appeal period, on which
 * production itself shows the view-only family: its view-only banner, so the arbitrable answers no `externalIDtoLocalID`
 * (no resolver family), together with the "Appeal fees could not be calculated" notice, so neither stake-multiplier
 * getter answers (spec 10.9 step 3), which the governors' `winnerMultiplier` and `loserMultiplier` do; an Escrow V1
 * dispute shows production's escrow appeal instead. The banner alone is the governors' too (mainnet 1672, 535). Execution
 * is left out: production's withdraw body does not tell a view-only arbitrable from a governor.
 */
function productionShowsViewOnlyAppeal(context: CaseContext): boolean {
  const { production } = context;
  return expectedFamily(context) === null && production.period === 3 && production.compatibility === "view-only" && production.appealPanel.kind === "fees-unavailable";
}

/**
 * D-47 applies to the cases 04 §2 names view-only, to the live picks whose recorded family is view-only, to the cases
 * tagged with it, whose view-only family stableTier.ts justifies from recorded bytecode, and to a pick with no recorded
 * family on which production shows the view-only family in the appeal period (`productionShowsViewOnlyAppeal`); never by
 * the family the new app reports, nor by the compatibility production reports alone, which is view-only for the
 * governors too.
 */
function hasNoFundingInterface(context: CaseContext): boolean {
  return expectedFamily(context) === "view-only" || isCaseOf(context, "D-47") || productionShowsViewOnlyAppeal(context);
}

const VARIABLE_TYPES: ReadonlySet<string> = new Set(["uint", "int", "string", "datetime", "hash"]);
const ZERO_ADDRESS = /^0x0{40}$/;
const UNAVAILABLE_TITLE = /^Dispute \d+: title unavailable$/;

function questionType(context: CaseContext): string | null {
  return context.next.rulingOptions?.type ?? context.production.rulingOptions?.type ?? null;
}

/** The card the mismatch path points at (`appealPanel.cards[3].remainingWei`) in production's list. */
function productionCard(mismatch: Mismatch, context: CaseContext): AppealCardSnapshot | undefined {
  const index = /^appealPanel\.cards\[(\d+)\]/.exec(mismatch.path)?.[1];
  return index === undefined ? undefined : context.production.appealPanel.cards[Number(index)];
}

function codesOf(value: unknown): string[] {
  return Array.isArray(value) ? value.map((code) => String(code)) : [];
}

/** Every new-app card code is one production also shows (the new app shows a subset of production's cards). */
function cardsSubset(mismatch: Mismatch): boolean {
  const productionCodes = codesOf(mismatch.production);
  return codesOf(mismatch.next).every((code) => productionCodes.includes(code));
}

/**
 * D-28 "Today" (master src/components/disputeSummary.js): production hid the link when its URL contained the canonical
 * host anywhere, case-sensitively. It only explains why production hid a link; it never decides that a link may be
 * shown, which is `isNewAppSelfLink`'s parsed host-name comparison.
 */
function productionHidAsSelfLink(url: string): boolean {
  return REGISTRY.canonicalHosts.some((host) => url.includes(host));
}

/** D-28 "New": core's self-link rule on the hosts the new app runs with, its origin's host and the registry's canonical hosts. */
function isNewAppSelfLink(url: string, context: CaseContext): boolean {
  return isSelfLink(url, { appHost: new URL(context.newOrigin).host, canonicalHosts: REGISTRY.canonicalHosts });
}

function isHttpsUrl(value: unknown): boolean {
  const text = asString(value);
  return text?.startsWith("https://") === true;
}

/** D-26: the same `/ipfs/<CID>/…` path, now served from the configured https gateway. */
function sameIpfsContent(mismatch: Mismatch): boolean {
  const before = ipfsPath(asString(mismatch.production));
  return before !== null && before === ipfsPath(asString(mismatch.next)) && isHttpsUrl(mismatch.next);
}

/** P-07: a value production served from the gateway that is not content-addressed is no longer linked. */
function notContentAddressed(mismatch: Mismatch): boolean {
  const before = asString(mismatch.production);
  return before !== null && normalizeIpfsPath(before) === null && !before.startsWith("https://") && mismatch.next === null;
}

/**
 * The path of an absolute URL as the app wrote it. Parsing would percent-encode the control characters core rejects
 * (U+0081 becomes `%C2%81`), so the path is cut from the text instead.
 */
const URL_PATH = /^[a-z][a-z\d+.-]*:\/\/[^/?#]*(\/.*)$/is;

/**
 * P-07 for an absolute gateway URL whose path core's one content-addressing rule rejects (`/ipns/…`, `/ipfs/report.pdf`,
 * a control character in a later segment).
 */
function gatewayPathNotContentAddressed(mismatch: Mismatch): boolean {
  const before = asString(mismatch.production);
  if (before === null || mismatch.next !== null) return false;
  const path = URL_PATH.exec(before)?.[1];
  return path !== undefined && /^\/ip[fn]s\//.test(path) && normalizeIpfsPath(path) === null;
}

/**
 * The ruling options of the question, for formatting a recorded ruling as spec §5.9 does. Production does not render the
 * precision, so the new app's options are read; production's own text, which must equal the recorded current ruling
 * formatted with them, holds those options to production's.
 */
function rulingOptionsOf(context: CaseContext): RulingOptions | null {
  const options = context.next.rulingOptions;
  if (options === null) return null;
  return { type: options.type, titles: options.titles, ...(options.precision === null ? {} : { precision: options.precision }) };
}

/**
 * D-02 on a case whose round has one RulingFunded event production's window missed (`fundedRuling` in stableTier.ts):
 * the winner flips from the jury's current ruling to that funded ruling, won by default. Production's text must be the
 * §5.9 text of the recorded current ruling and the new text that of the recorded funded ruling.
 */
function fundedWinnerText(mismatch: Mismatch, context: CaseContext): boolean {
  const record = context.testCase?.fundedRuling;
  const options = rulingOptionsOf(context);
  if (!isCaseOf(context, "D-02") || record === undefined || options === null) return false;
  const flipped = context.production.decision?.wonBy === "jury" && context.next.decision?.wonBy === "default";
  return flipped && mismatch.production === formatRuling(BigInt(record.currentRuling), options, null) && mismatch.next === formatRuling(BigInt(record.ruling), options, null);
}

/** D-36: production rendered no dispute details because its meta-evidence failed to load. */
function productionMetaEvidenceFailed(context: CaseContext): boolean {
  return context.production.exists && !context.production.metaEvidenceLoaded && context.production.timeline === null;
}

function stateFor(column: number, period: number): TimelineState {
  if (period > column) return "concluded";
  return period === column ? "current" : "upcoming";
}

/** D-39: every period the dispute passes through, Commit included when `withCommit`. */
export function expectedTimeline(period: number, withCommit: boolean): TimelineColumn[] {
  const columns: [string, number][] = [
    ["evidence", 0],
    ["commit", 1],
    ["vote", 2],
    ["appeal", 3],
    ["execution", 4],
  ];
  return columns.filter(([name]) => withCommit || name !== "commit").map(([name, index]) => ({ name, state: stateFor(index, period) }));
}

/**
 * D-39: whether the timeline must have a Commit column, from production's period. In the commit period it must
 * (KlerosLiquid enters it only for a hidden-vote court, and core keeps the column there); otherwise as the case's
 * recorded court says (courts.ts). `null` for a live-tier pick outside commit, whose court is not recorded.
 */
function commitColumnRequired(context: CaseContext): boolean | null {
  if (context.production.period === 1) return true;
  const { testCase } = context;
  return testCase === null ? null : (recordedCourt(testCase.chainId, testCase.disputeId)?.hiddenVotes ?? null);
}

/** P-01: on a testnet the new app lists evidence that production's look-back missed, so its list is the longer one. */
function listsEvidenceBeyondLookback(context: CaseContext): boolean {
  return ![1, 100].includes(chainOf(context)) && (context.next.evidence?.length ?? 0) > (context.production.evidence?.length ?? 0);
}

/** The appeal panel the entry expects in a period: `[period 3 kind, period 4 kind]`, hidden before. */
function panelForPeriod(period: number | null, appeal: string, execution: string): string {
  if (period === 3) return appeal;
  return period === 4 ? execution : "hidden";
}

/** Whether the field is absent from the new snapshot (D-36's meta-evidence fields). */
function fieldIsAbsent(snapshot: CaseSnapshot, field: string): boolean {
  if (field === "links.arbitrableApp") return snapshot.links.arbitrableApp === null;
  if (field === "links.metaEvidenceFile") return snapshot.links.metaEvidenceFile === null;
  const value = (snapshot as unknown as Record<string, unknown>)[field];
  return value === null || value === undefined;
}

/** Whether the new app's meta-evidence section shows its failed state with a reason (D-36: "unavailable" with the reason). */
export function showsMetaEvidenceFailure(snapshot: CaseSnapshot): boolean {
  return (snapshot.metaEvidenceFailure ?? "").trim() !== "";
}

/**
 * The withdrawable amount under the account context of 04 §1, against the on-chain sum recorded for the case
 * (`accountContext` in stableTier.ts) rather than production's amount: production shows zero whenever its scan or its
 * read fails, so "never less than production's" would accept any amount.
 */
function recordedWithdrawable(applies: (context: CaseContext) => boolean): CaseRule {
  return replaceCase(
    "appealPanel.withdrawableWei",
    "the on-chain withdrawable sum recorded for the case, for the recorded account",
    (c) => applies(c) && c.testCase?.accountContext !== undefined,
    (c) => {
      const record = c.testCase?.accountContext ?? null;
      const ok = record !== null && sameAddress(c.next.account, record.account) && sameWei(c.next.appealPanel.withdrawableWei, record.withdrawableWei);
      return { ok, expected: record };
    },
  );
}

const TIE_RULING_TEXT = "invalid / refused to arbitrate / tied";

/** P-05 applies to a governor (as 04 §2 names the case) whose current ruling is 0. */
function governorTie(context: CaseContext): boolean {
  return expectedFamily(context) === "governor" && context.production.decision?.rulingText === TIE_RULING_TEXT;
}

function weiOf(value: string | null): bigint | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

/** Production's card the mismatch path points at, with the new app's card of the same ruling code. */
function cardPair(mismatch: Mismatch, context: CaseContext): [AppealCardSnapshot, AppealCardSnapshot] | null {
  const before = productionCard(mismatch, context);
  const after = before === undefined ? undefined : context.next.appealPanel.cards.find((card) => card.code === before.code);
  return before === undefined || after === undefined ? null : [before, after];
}

/**
 * P-05 charges every list the shared amount instead of the loser amount and leaves the contributions as they are, so
 * every card's remaining amount moves by one common difference. It is read on the cards with an amount left in both apps
 * (a fully funded card shows none); `null` when those cards disagree, show no change, or there are none.
 */
function sharedShift(context: CaseContext): bigint | null {
  const shifts = new Set<bigint>();
  for (const before of context.production.appealPanel.cards) {
    const after = context.next.appealPanel.cards.find((card) => card.code === before.code);
    const remainingBefore = weiOf(before.remainingWei);
    const remainingAfter = weiOf(after?.remainingWei ?? null);
    if (remainingBefore !== null && remainingAfter !== null && remainingBefore > 0n && remainingAfter > 0n) shifts.add(remainingAfter - remainingBefore);
  }
  const [shift] = shifts;
  return shifts.size === 1 && shift !== undefined && shift !== 0n ? shift : null;
}

/** P-05: the card's remaining amount is production's moved by the common difference, never below zero. */
function sharedRemaining(mismatch: Mismatch, context: CaseContext): boolean {
  const shift = sharedShift(context);
  const pair = cardPair(mismatch, context);
  const before = weiOf(pair?.[0].remainingWei ?? null);
  const after = weiOf(pair?.[1].remainingWei ?? null);
  if (shift === null || before === null || after === null) return false;
  const floor = (value: bigint) => (value > 0n ? value : 0n);
  // A list production showed fully funded has at most the increase left, if the shared amount is the larger one.
  return before === 0n ? after <= floor(shift) : after === floor(before + shift);
}

/** P-05: a funded share moves against the list total: up where the shared amount is lower, down where it is higher. */
function sharedFunding(mismatch: Mismatch, context: CaseContext): boolean {
  const shift = sharedShift(context);
  const before = typeof mismatch.production === "number" ? mismatch.production : null;
  const after = typeof mismatch.next === "number" ? mismatch.next : null;
  if (shift === null || before === null || after === null) return false;
  return shift < 0n ? after > before : after < before;
}

/** The dispute id of an Ongoing mismatch path (`disputes[1454].title`). */
function ongoingId(mismatch: Mismatch): string | null {
  return /^disputes\[([^\]]+)\]\./.exec(mismatch.path)?.[1] ?? null;
}

/**
 * D-05: production's concurrent script runs cross-resolved, so a dispute showed the title of another open dispute and
 * production's list holds that title twice. The new title is accepted when production showed this dispute with a title
 * another dispute also had, the new app keeps that title on such a dispute (its owner), and the new title is this
 * dispute's alone: no other dispute shows it in either app. A swap of two titles has no such duplicate and fails.
 */
function crossResolvedTitle(mismatch: Mismatch, context: OngoingContext): boolean {
  const id = ongoingId(mismatch);
  const before = asString(mismatch.production);
  const after = asString(mismatch.next);
  if (id === null || before === null || after === null) return false;
  const productionOthers = context.production.disputes.filter((dispute) => dispute.id !== id);
  const nextOthers = context.next.disputes.filter((dispute) => dispute.id !== id);
  const ownerKeepsIt = productionOthers.some((dispute) => dispute.title === before && nextOthers.some((other) => other.id === dispute.id && other.title === before));
  const ownTitle = !productionOthers.some((dispute) => dispute.title === after) && !nextOthers.some((dispute) => dispute.title === after);
  return ownerKeepsIt && ownTitle;
}

/** The reserved Reality ruling 2²⁵⁶ − 1 (P-14). */
const MAX_UINT256 = 2n ** 256n - 1n;
/** Production's text for that ruling: rounded to 2²⁵⁶, its `ruling − 1` is reality-eth-lib's invalid answer. */
const ROUNDED_RULING_TEXT = "Invalid";
/** The new app's text for it: reality-eth-lib's label for the answer 2²⁵⁶ − 2 (spec §5.9). */
const ANSWERED_TOO_SOON_TEXT = "Answered too soon";

/** P-14: the case's on-chain current ruling, as recorded in stableTier.ts, is 2²⁵⁶ − 1, and only the rounding differs. */
function answeredTooSoon(mismatch: Mismatch, context: CaseContext): boolean {
  const recorded = context.testCase?.currentRuling?.ruling;
  return recorded !== undefined && BigInt(recorded) === MAX_UINT256 && mismatch.production === ROUNDED_RULING_TEXT && mismatch.next === ANSWERED_TOO_SOON_TEXT;
}

const DEVIATIONS: readonly LedgerEntry[] = [
  noField("D-01", "Redirect targets", "Routes, not a snapshot field: Playwright route table."),
  {
    id: "D-02",
    title: "Contribution and RulingFunded scan windows",
    fields: ["appealPanel.withdrawableWei", "appealPanel.cards", "decision.wonBy", "decision.rulingText"],
    note: "Gnosis 121, 120, 118 and 132 (04 §2): the withdrawable amount is the on-chain sum recorded for the case's account, not production's windowed total; on those cases a jury decision may become 'won by default' and a card's funding can only rise. Mainnet 1658: never appealed, so production scans RulingFunded from head − 1,000,000 blocks only, about 3.2 million blocks after the round's one funded ruling (block 21,984,352); the new app shows that recorded ruling, won by default, where production shows the current ruling. Gnosis 220: never appealed, so production scans Contribution from head − 1,000,000 blocks only, about 15.4 million blocks after the round's one 1.0 xDAI contribution (block 32,327,712); that refund never reaches getTotalWithdrawableAmount, so production shows 0 where the new app shows the recorded 1.0 xDAI.",
    rules: [
      recordedWithdrawable((c) => isCaseOf(c, "D-02")),
      acceptCase(
        "decision.wonBy",
        "won by default when the only RulingFunded event lies outside production's window",
        (m, c) => isCaseOf(c, "D-02") && m.production === "jury" && m.next === "default",
      ),
      acceptCase("decision.rulingText", "the recorded funded ruling, where production shows the current ruling", fundedWinnerText),
      acceptCase(
        "appealPanel.cards[].fundedPercent",
        "funded share from the round's start block, never lower",
        (m, c) => isCaseOf(c, "D-02") && Number(m.next) >= Number(m.production),
      ),
      acceptCase(
        "appealPanel.cards[].remainingWei",
        "remaining amount after every contribution, never higher",
        (m, c) => isCaseOf(c, "D-02") && weiAtLeast(asString(m.production), asString(m.next)),
      ),
    ],
  },
  noField(
    "D-03",
    "Appealed markers",
    "The markers are evidence-timeline events, not evidence items of the snapshot: mainnet 328 and Gnosis 121 by the D-03 tests of src/pages/case-evidence/EvidenceSection.test.tsx, on recorded blocks.",
  ),
  {
    id: "D-04",
    title: "Variable-type appeal cards",
    fields: ["appealPanel.cards"],
    note: "Variable questions show only the contributed values, the current ruling and the free input; the current-ruling card uses the winner amount and deadline.",
    rules: [
      acceptCase("appealPanel.cards[].membership", "production's cards without the Yes/No fallback cards", (m, c) => VARIABLE_TYPES.has(questionType(c) ?? "") && cardsSubset(m)),
      acceptCase(
        "appealPanel.cards[].remainingWei",
        "the winner amount on the current-ruling card",
        (m, c) => VARIABLE_TYPES.has(questionType(c) ?? "") && productionCard(m, c)?.title === c.production.decision?.rulingText,
      ),
      acceptCase(
        "appealPanel.cards[].deadline",
        "the winner deadline on the current-ruling card",
        (m, c) => VARIABLE_TYPES.has(questionType(c) ?? "") && productionCard(m, c)?.title === c.production.decision?.rulingText,
      ),
    ],
  },
  {
    id: "D-05",
    title: "Script result channel",
    fields: ["disputes"],
    note: "Concurrent runs cross-resolved in production, so an Ongoing title may be another dispute's; unit test with two concurrent runs.",
    rules: [acceptOngoing("disputes[].title", "the dispute's own title where production showed another open dispute's", crossResolvedTitle)],
  },
  noField("D-06", "Wallet connection at load", "The header's wallet state, not a snapshot field: Playwright read-only load."),
  noField("D-07", "Silent transaction failures", "Write paths: Playwright with a rejected signature on Sepolia S1."),
  noField("D-08", "Create form behavior", "Input handling after load; no field of the Create snapshot changes: component tests."),
  {
    id: "D-09",
    title: "Case page without an ID",
    fields: ["exists"],
    note: "Only the ID-less case URL; no stable case.",
    rules: [
      replaceCase(
        "exists",
        "no dispute loaded (the search box only)",
        (c) => c.testCase === null && c.next.state === "no-id",
        (c) => ({ ok: !c.next.exists, expected: false }),
      ),
    ],
  },
  noField("D-10", "Currency labels", "Amounts are compared in wei; the symbol is copy: Gnosis 121 withdraw panel."),
  noField("D-11", "Dead code and dead fetches", "Absence only."),
  {
    id: "D-12",
    title: "Escrow V1 detection",
    fields: ["compatibility", "appealPanel.kind", "appealPanel.cards", "appealPanel.withdrawableWei"],
    note: "Mainnet 168 and 92 are the Escrow family: full compatibility and the Escrow appeal panel, where production probed them as IDisputeResolver, found no local ID and showed them view-only.",
    rules: [
      replaceCase(
        "compatibility",
        "full (the Escrow V1 family submits evidence and appeals)",
        (c) => isCaseOf(c, "D-12"),
        (c) => ({ ok: c.next.compatibility === "full", expected: "full" }),
      ),
      replaceCase(
        "appealPanel.kind",
        "escrow-appeal in the appeal period, escrow-ended in execution",
        (c) => isCaseOf(c, "D-12"),
        (c) => {
          const expected = panelForPeriod(c.next.period, "escrow-appeal", "escrow-ended");
          return { ok: c.next.appealPanel.kind === expected, expected };
        },
      ),
      replaceCase(
        "appealPanel.cards",
        "no crowdfunding cards",
        (c) => isCaseOf(c, "D-12"),
        (c) => ({ ok: c.next.appealPanel.cards.length === 0, expected: [] }),
      ),
      replaceCase(
        "appealPanel.withdrawableWei",
        "no withdraw panel",
        (c) => isCaseOf(c, "D-12"),
        (c) => ({ ok: c.next.appealPanel.withdrawableWei === null, expected: null }),
      ),
    ],
  },
  noField("D-13", "Meta-evidence cache", "Persistence: unit test that a version bump invalidates."),
  noField("D-14", "Error alert crash", "Component test."),
  noField("D-15", "Zero decimals ignored", "Encoding of a write: unit test."),
  noField("D-16", "Negative integers", "Encoding of a write: unit test."),
  noField("D-17", "Datetime precision", "Encoding of a write: Sepolia S3."),
  noField("D-18", "Unknown chain IDs", "No stable case names an unknown chain: component test with arbitrableChainID 10."),
  {
    id: "D-19",
    title: "Courts never finish loading",
    fields: ["courtName"],
    note: "A court whose policy fails shows its ID with 'name unavailable' where production showed nothing.",
    rules: [
      acceptCase("courtName", "the court ID with 'name unavailable'", (m) => (m.production === null || m.production === "") && (asString(m.next) ?? "").includes("unavailable")),
    ],
  },
  noField(
    "D-20",
    "Atlas sessions per tab",
    "Uploads: unit tests in src/atlas (reload, account switch); the Playwright sign-in, reload and account switch needs a build with a wallet.",
  ),
  noField("D-21", "Missing Atlas configuration", "Boot: unit test."),
  {
    id: "D-22",
    title: "Evidence URIs must be content-addressed",
    fields: ["evidence", "hiddenEvidenceCount"],
    note: "Production hides failing items silently and also hides some the new app hides, so the count is checked for consistency, not equality.",
    rules: [
      replaceCase(
        "hiddenEvidenceCount",
        "production's items minus the new list, at most the hidden count",
        (c) => c.production.evidence !== null && c.next.evidence !== null && !listsEvidenceBeyondLookback(c),
        (c) => {
          const shown = c.next.evidence?.length ?? 0;
          const before = c.production.evidence?.length ?? 0;
          const hidden = c.next.hiddenEvidenceCount ?? 0;
          return { ok: c.next.hiddenEvidenceCount !== null && shown <= before && shown + hidden >= before, expected: `>= ${(before - shown).toString()}` };
        },
      ),
      acceptCase("evidence[].membership", "production's list without the hidden items, in order", (m, c) => {
        const before = Array.isArray(m.production) ? m.production.map(String) : [];
        const after = Array.isArray(m.next) ? m.next.map(String) : [];
        let cursor = 0;
        const subsequence = after.every((title) => {
          cursor = before.indexOf(title, cursor) + 1;
          return cursor > 0;
        });
        return subsequence && (c.next.hiddenEvidenceCount ?? 0) >= before.length - after.length;
      }),
    ],
  },
  noField("D-23", "Chains dropped", "Configuration: invariant tests."),
  noField("D-24", "Content-addressing check hardened", "URI rule: unit tests with the bypass URLs."),
  {
    id: "D-25",
    title: "Dispute 1621 override removed",
    fields: ["rulingOptions"],
    note: "The original script yields production's options ('List 7', 'List 8'), so the field is compared as is (no rule).",
    rules: [],
  },
  {
    id: "D-26",
    title: "T2CR display override replaced by a gateway rule",
    fields: ["evidenceDisplay", "evidence", "links.metaEvidenceFile"],
    note: "Display and attachment URLs whose path begins with /ipfs/<CID> are served from the configured gateway; compared on that path.",
    rules: [
      acceptCase(
        "evidenceDisplay.srcOrigin",
        "the configured https gateway for an /ipfs/<CID> display",
        (m, c) => ipfsPath(`${asString(m.next) ?? ""}${c.next.evidenceDisplay?.srcPath ?? ""}`) !== null && isHttpsUrl(m.next),
      ),
      acceptCase("evidence[].attachmentHref", "the same /ipfs/<CID> path on the configured gateway", sameIpfsContent),
      acceptCase("links.metaEvidenceFile", "the same /ipfs/<CID> path on the configured gateway", sameIpfsContent),
    ],
  },
  noField("D-27", "Second Unslashed address removed", "Registry snapshot test."),
  {
    id: "D-28",
    title: "Self-link rule",
    fields: ["links.arbitrableApp"],
    note: "Hidden when the URL's host is the app's host or resolve.kleros.io, not when the URL merely contains the substring.",
    rules: [
      acceptCase("links.arbitrableApp", "hidden only for the app's own host or resolve.kleros.io", (m, c) => {
        const after = asString(m.next);
        if (after === null) {
          const before = asString(m.production);
          return before !== null && isNewAppSelfLink(before, c);
        }
        return m.production === null && productionHidAsSelfLink(after) && !isNewAppSelfLink(after, c);
      }),
    ],
  },
  {
    id: "D-29",
    title: "Script sandbox",
    fields: ["rulingOptions"],
    note: "Reality renderer scripts for unregistered proxies now return their options where production's charset fallback returned {}.",
    rules: [
      acceptCase("rulingOptions", "the options the script returns", (m, c) => c.production.timeline !== null && m.production === null && m.next !== null),
      acceptCase(
        "rulingOptions.titles",
        "the options the script returns",
        (m) => Array.isArray(m.production) && m.production.length === 0 && Array.isArray(m.next) && m.next.length > 0,
      ),
    ],
  },
  {
    id: "D-30",
    title: "Unslashed round offset applied uniformly",
    fields: ["appealPanel.withdrawableWei"],
    note: "Mainnet 1678 and 1226 under the account context: the withdrawable amount is the on-chain sum recorded for the case's account, round 1 included; decisions are unchanged ('won by default' in both).",
    rules: [recordedWithdrawable((c) => isCaseOf(c, "D-30"))],
  },
  noField("D-31", "Markdown links and images", "Link targets and image hosts; the rendered text is unchanged: component test."),
  {
    id: "D-32",
    title: "Plain http:// links",
    fields: ["links.arbitrableApp", "links.metaEvidenceFile", "evidence"],
    note: "An http:// value is shown as text, so the link is absent.",
    rules: (["links.arbitrableApp", "links.metaEvidenceFile", "evidence[].attachmentHref"] as const).map((key) =>
      acceptCase(key, "no link for an http:// value", (m) => asString(m.production)?.startsWith("http://") === true && m.next === null),
    ),
  },
  {
    id: "D-33",
    title: "Multiple-select appeal cards above four options",
    fields: ["appealPanel.cards"],
    note: "Above four options only the current ruling and funded combinations are cards, plus a composer.",
    rules: [
      acceptCase(
        "appealPanel.cards[].membership",
        "the current ruling and the funded combinations",
        (m, c) => questionType(c) === "multiple-select" && (c.next.rulingOptions?.titles.length ?? 0) > 4 && cardsSubset(m),
      ),
    ],
  },
  {
    id: "D-34",
    title: "Display allowlist lookup key validated",
    fields: ["evidenceDisplay"],
    note: "Same flags for every existing dispute: the sandbox is compared as is (no rule).",
    rules: [],
  },
  {
    id: "D-35",
    title: "RPC URLs given to third-party frames",
    fields: ["evidenceDisplay"],
    note: "The frame gets the public RPC setting instead of the read RPC: RPC parameters are compared on presence (and are stored as host and fingerprint).",
    rules: [acceptCase("evidenceDisplay.params.rpc", "a public RPC URL in the same parameter", (m) => m.production !== null && m.next !== null)],
  },
  {
    id: "D-36",
    title: "Section-level degradation",
    fields: [
      "title",
      "question",
      "descriptionText",
      "rulingOptions",
      "period",
      "lastPeriodChange",
      "timeline",
      "numberOfVotes",
      "courtName",
      "decision",
      "realityNotice",
      "appealPanel",
      "evidence",
      "links",
      "evidenceDisplay",
    ],
    note: "When production's meta-evidence fails it renders no details; the new app renders the dispute info and timeline and degrades the meta-evidence section.",
    rules: [
      ...(["title", "question", "descriptionText", "rulingOptions", "links.arbitrableApp", "links.metaEvidenceFile", "evidenceDisplay"] as const).map((field) =>
        replaceCase(field, "absent: the meta-evidence section shows its failed state with a reason", productionMetaEvidenceFailed, (c) => ({
          ok: fieldIsAbsent(c.next, field) && showsMetaEvidenceFailure(c.next),
          expected: null,
        })),
      ),
      ...(["period", "lastPeriodChange", "timeline", "numberOfVotes", "courtName"] as const).map((field) =>
        replaceCase(field, "present: the dispute info and timeline render", productionMetaEvidenceFailed, (c) => ({ ok: c.next[field] !== null, expected: "present" })),
      ),
      ...(["decision.kind", "decision.rulingText", "decision.wonBy", "realityNotice", "appealPanel.kind", "appealPanel.cards", "evidence", "hiddenEvidenceCount"] as const).map(
        (field) => replaceCase(field, "rendered, or degraded behind the section's boundary", productionMetaEvidenceFailed, () => ({ ok: true, expected: "any" })),
      ),
    ],
  },
  {
    id: "D-37",
    title: "Ongoing page loading",
    fields: ["disputes"],
    note: "A dispute whose meta-evidence fails shows its ID with 'title unavailable'; production dropped its card or titled it 'Meta Evidence Missing'. Timing: e2e/app/ongoing.spec.ts.",
    rules: [
      acceptOngoing("disputes[].membership", "the dispute's card with 'title unavailable'", (m) => {
        const card = m.next as { readonly title?: unknown } | null;
        return m.production === null && UNAVAILABLE_TITLE.test(asString(card?.title) ?? "");
      }),
      acceptOngoing(
        "disputes[].title",
        "'title unavailable' for a failed meta-evidence",
        (m) => m.production === "Meta Evidence Missing" && UNAVAILABLE_TITLE.test(asString(m.next) ?? ""),
      ),
    ],
  },
  noField("D-38", "Meta-evidence fetch budget", "Timing: unit test."),
  {
    id: "D-39",
    title: "Timeline columns",
    fields: ["timeline"],
    note: "Every period the dispute passes through, Execution included, with states from production's period. Commit is required in the commit period and for a case whose recorded court hides votes (courts.ts), forbidden for one whose court does not, either way for a live pick outside commit.",
    rules: [
      replaceCase(
        "timeline",
        "evidence, commit when the court hides votes, vote, appeal, execution with states from the period",
        (c) => c.production.timeline !== null && c.production.period !== null,
        (c) => {
          const period = c.production.period ?? 0;
          const required = commitColumnRequired(c);
          const options = required === null ? [expectedTimeline(period, false), expectedTimeline(period, true)] : [expectedTimeline(period, required)];
          return { ok: options.some((option) => sameJson(option, c.next.timeline)), expected: options.length === 1 ? options[0] : options };
        },
      ),
    ],
  },
  noField("D-40", "Explorer links", "Address and transaction links are not snapshot fields: component test per chain."),
  noField("D-41", "Response headers", "Deploy tests (C1 to C3): e2e/deploy/headers.spec.ts with DR_E2E_DEPLOY_URL."),
  {
    id: "D-42",
    title: "Dependencies and stack",
    fields: ["descriptionText", "evidence"],
    note: "react-markdown 9 writes newline text nodes between blocks; the whitespace-free text comparison of 04 §1 absorbs it (no rule).",
    rules: [],
  },
  noField("D-43", "Period-3 appeal text", "Copy of the panel: component test on a period-3 fixture."),
  noField("D-44", "Evidence modal state", "Write path: component test."),
  noField("D-45", "Header links on error screens", "Header: Playwright on an unsupported chain and a 404, e2e/app/error-screens.spec.ts."),
  {
    id: "D-46",
    title: "Contracts with IDisputeResolver IDs but no withdraw functions",
    fields: ["appealPanel.kind", "appealPanel.withdrawableWei"],
    note: "Mainnet 505 and 328, the cases 04 §2 names idr-legacy: the execution panel says withdrawals are not supported instead of showing zero.",
    rules: [
      replaceCase(
        "appealPanel.kind",
        "crowdfunding in the appeal period, withdraw-unsupported in execution",
        (c) => expectedFamily(c) === "idr-legacy",
        (c) => {
          const expected = panelForPeriod(c.next.period, "crowdfunding", "withdraw-unsupported");
          return { ok: c.next.appealPanel.kind === expected, expected };
        },
      ),
      replaceCase(
        "appealPanel.withdrawableWei",
        "no withdrawable amount",
        (c) => expectedFamily(c) === "idr-legacy",
        (c) => ({ ok: c.next.appealPanel.withdrawableWei === null, expected: null }),
      ),
    ],
  },
  {
    id: "D-47",
    title: "Appeal funding for governors is fixed; families with no funding interface show a note",
    fields: ["appealPanel.kind", "appealPanel.cards", "appealPanel.withdrawableWei"],
    note: "The cases 04 §2 names view-only, the cases tagged D-47 on recorded bytecode (Gnosis 41, 42, 44, 140, 863), the live picks whose family `yarn golden-gate live` recorded as view-only (for instance a Curate list in the appeal period, where production still shows crowdfunding cards), and, in the appeal period, a pick with no recorded family on which production shows its view-only banner with the 'Appeal fees could not be calculated' notice (mainnet 1684), show 'appeals happen in the arbitrable application' in the appeal period and no panel in execution; the governors crowdfund and withdraw through their own interface, compared with a recorded on-chain amount under the account context.",
    rules: [
      replaceCase("appealPanel.kind", "handled-by-arbitrable in the appeal period, no panel in execution", hasNoFundingInterface, (c) => {
        const expected = panelForPeriod(c.next.period, "handled-by-arbitrable", "hidden");
        return { ok: c.next.appealPanel.kind === expected, expected };
      }),
      replaceCase("appealPanel.cards", "no crowdfunding cards", hasNoFundingInterface, (c) => ({ ok: c.next.appealPanel.cards.length === 0, expected: [] })),
      replaceCase("appealPanel.withdrawableWei", "no withdraw panel", hasNoFundingInterface, (c) => ({ ok: c.next.appealPanel.withdrawableWei === null, expected: null })),
      recordedWithdrawable((c) => expectedFamily(c) === "governor"),
    ],
  },
  noField("D-48", "Wallet chain must match the page chain", "Write guard: unit test; Playwright with the wallet on another chain, e2e/app/wallet-chain.spec.ts (B3)."),
  {
    id: "D-49",
    title: "IDisputeResolver v1 contracts other than Unslashed",
    fields: ["appealPanel.withdrawableWei"],
    note: "Withdrawals use the v1 signatures where production's v2 call reverted to zero, compared with a recorded on-chain amount under the account context. No stable D-49 case has one (Gnosis 0 has no recorded contributor, MC-11), so the rule applies to none today; core's bytecode-fixture and withdraw tests prove D-49.",
    rules: [recordedWithdrawable((c) => isCaseOf(c, "D-49"))],
  },
  noField("D-50", "Families detected beyond today's lists", "No stable case is an unlisted deployment: bytecode fixtures; the live tier."),
  {
    id: "D-51",
    title: "Withdrawals across several rulings",
    fields: ["appealPanel.withdrawableWei"],
    note: "The sum across rulings is part of the recorded on-chain sum the account-context cases are compared with (D-02, D-30); the contributions on both sides are Sepolia S4 (04 §4). No rule: no amount is accepted for being above production's.",
    rules: [],
  },
  noField("D-52", "Atlas sign-in trigger", "Uploads: component test; Playwright on Sepolia S1."),
  noField("D-53", "Search for a nonexistent dispute", "Search flow: Playwright, e2e/app/search.spec.ts."),
  noField("D-54", "Contribution input follows the suggested amount", "Card input: component test."),
  noField("D-55", "Chain changes without a full reload", "Wallet chain change: Playwright, e2e/app/wallet-chain.spec.ts."),
  noField("D-56", "Chain without an RPC variable", "No stable case on a chain without an RPC: unit test."),
];

const PROPOSALS: readonly LedgerEntry[] = [
  {
    id: "P-01",
    title: "Evidence and Dispute-event scans on testnets",
    fields: ["evidence", "hiddenEvidenceCount"],
    note: "Testnets only: Sepolia 365 (LEDGER_CASES in stableTier.ts), whose evidence is older than the 50,000-block look-back, so production lists none. The stable tier is mainnet and Gnosis, where the scans are unchanged.",
    rules: [
      acceptCase("evidence[].membership", "evidence older than the lookback is listed", (m, c) => ![1, 100].includes(chainOf(c)) && listLength(m.next) > listLength(m.production)),
      // D-22's count assumes the new list is a part of production's; here production's is the shorter one.
      replaceCase("hiddenEvidenceCount", "the new app's hidden count, production's list being the shorter one", listsEvidenceBeyondLookback, (c) => ({
        ok: c.next.hiddenEvidenceCount !== null,
        expected: "present",
      })),
    ],
  },
  noField("P-02", "What a mined write refreshes", "After a write: component tests."),
  noField(
    "P-03",
    "Network switching from the unsupported-network screen and the header",
    "Switching: component tests, and the add-chain fallback through wagmi's injected connector; Playwright needs a build with a wallet.",
  ),
  {
    id: "P-04",
    title: "No 'refuse to arbitrate' card for governors",
    fields: ["appealPanel.cards"],
    note: "Governor panels have no ruling-0 card.",
    rules: [
      acceptCase("appealPanel.cards[].membership", "production's cards without ruling 0", (m, c) => {
        if (expectedFamily(c) !== "governor") return false;
        return sameJson(
          codesOf(m.production)
            .filter((code) => code !== "0")
            .sort((a, b) => a.localeCompare(b)),
          codesOf(m.next).sort((a, b) => a.localeCompare(b)),
        );
      }),
    ],
  },
  {
    id: "P-05",
    title: "Shared multiplier for governor ties",
    fields: ["appealPanel.cards"],
    note: "A governor tie (current ruling 0) charges every list the shared amount instead of the loser amount, until the end of the appeal period instead of its half-way point.",
    rules: [
      acceptCase(
        "appealPanel.cards[].remainingWei",
        "production's remaining amount moved by the one difference every list shares",
        (m, c) => governorTie(c) && sharedRemaining(m, c),
      ),
      acceptCase("appealPanel.cards[].fundedPercent", "the funded share moved against that difference", (m, c) => governorTie(c) && sharedFunding(m, c)),
      acceptCase(
        "appealPanel.cards[].deadline",
        "open until the end of the appeal period where production closed at its half-way point",
        (m, c) => governorTie(c) && m.production === "past" && m.next === "future",
      ),
    ],
  },
  {
    id: "P-06",
    title: "Decision text when no title matches the ruling",
    fields: ["decision.rulingText"],
    note: "'undefined' becomes the ruling's decimal value.",
    rules: [acceptCase("decision.rulingText", "the ruling's decimal value", (m) => m.production === "undefined" && /^\d+$/.test(asString(m.next) ?? ""))],
  },
  {
    id: "P-07",
    title: "Relative display and attachment URIs must be content-addressed",
    fields: ["evidenceDisplay", "evidence", "links.metaEvidenceFile"],
    note: "A value that is not /ipfs/<CID> is no longer served from the gateway: no frame, the attachment shown as text.",
    rules: [
      acceptCase("evidenceDisplay", "no frame for a display path that is not content-addressed", (m) => {
        const before = m.production as { readonly srcPath?: unknown } | null;
        const path = asString(before?.srcPath);
        return path !== null && /^\/ip[fn]s\//.test(path) && ipfsPath(`https://gateway.invalid${path}`) === null && m.next === null;
      }),
      acceptCase("evidence[].attachmentHref", "the attachment shown as text", (m) => notContentAddressed(m) || gatewayPathNotContentAddressed(m)),
      acceptCase("links.metaEvidenceFile", "the file shown as text", (m) => notContentAddressed(m) || gatewayPathNotContentAddressed(m)),
    ],
  },
  {
    id: "P-08",
    title: "Zeroed dispute struct means 'does not exist'",
    fields: ["exists"],
    note: "A Gnosis or Chiado ID never created is the not-found state; production rendered a case for the zero arbitrable. Search: e2e/app/search.spec.ts.",
    rules: [
      replaceCase(
        "exists",
        "false",
        (c) => ZERO_ADDRESS.test(c.production.arbitrable ?? ""),
        (c) => ({ ok: !c.next.exists, expected: false }),
      ),
    ],
  },
  noField("P-09", "Descriptions paired with option titles", "Create output (meta-evidence written): unit test."),
  {
    id: "P-10",
    title: "Bracketed text, footnotes and backslashes in descriptions",
    fields: ["descriptionText", "evidence"],
    note: "CommonMark escapes: '\\<' renders '<' and a trailing backslash is a line break; compared with backslashes removed.",
    rules: (["descriptionText", "evidence[].descriptionText"] as const).map((key) =>
      acceptCase(key, "the same text, with CommonMark backslash escapes applied", (m) => withoutBackslashes(asString(m.production)) === withoutBackslashes(asString(m.next))),
    ),
  },
  noField("P-11", "Legacy interact link with an ID that does not parse", "Routing: unit test."),
  noField(
    "P-12",
    "Drop allow-same-origin from the Proof of Humanity v2 evidence display",
    "Recorded, not implemented: the display sandbox is compared as is (mainnet 1674 keeps production's flags); unit test of the flag selection and the branch-deploy A/B once approved.",
  ),
  noField("P-13", "Drop Redstone (chain 690)", "Chain table: the D-23 membership test; no stable case is on chain 690."),
  {
    id: "P-14",
    title: "The current ruling is read exactly",
    fields: ["decision.rulingText"],
    note: "Mainnet 1650 and 1657, whose current ruling is 2²⁵⁶ − 1 on-chain (recorded in stableTier.ts): production rounds it and reads 'Invalid', the new app reads reality-eth-lib's 'Answered too soon'.",
    rules: [acceptCase("decision.rulingText", "'Answered too soon' where production reads 'Invalid', for an on-chain ruling of 2²⁵⁶ − 1", answeredTooSoon)],
  },
  noField(
    "P-15",
    "Script-equivalence improvements recorded for review",
    "Gate rows of 04 §5 (C6), not a snapshot field: scripts/golden-gate's gate log lists them as improvement-for-review.",
  ),
  noField(
    "P-16",
    "Fail fast when the script runner frame never starts",
    "Recorded, not implemented: the runner protocol, not a snapshot field; an end-to-end test that blocks the runner page once approved.",
  ),
  noField(
    "P-17",
    "Court policy URIs must be https or content-addressed",
    "Every policy URI recorded on mainnet and Gnosis resolves under the new rule (uri/gateway.test.ts), so no stable case's courtName differs: unit tests.",
  ),
  noField("P-18", "Datetime answers are typed in UTC", "Free-input funding, not a snapshot field: component test."),
  noField("P-19", "The URL's dispute loads at mount", "Load timing, not a snapshot field: component test."),
  noField("P-20", "What the case page shows while the dispute loads", "Snapshots are taken once the page settles: component tests."),
  noField("P-21", "Funding totals and the int answer on crowdfunding cards", "The snapshot's cards carry no total and no funded-answer line: component tests."),
  noField(
    "P-22",
    "The withdraw panel without a connected account",
    "Without an account the withdrawable amount is not compared (04 §1), so cases with no account context skip the field: unit and component tests.",
  ),
  noField(
    "P-23",
    "Bound the parse cost of hostile descriptions",
    "Recorded, not implemented: no snapshot field changes; the descriptions are compared as today. Hostile-input timing tests once approved.",
  ),
  noField(
    "P-24",
    "Decision text for options without titles",
    "Recorded, not implemented: decision.rulingText is compared as today (the poh.eth governor's blank decision is production's); decision.test.ts pins today's behavior.",
  ),
  noField(
    "P-25",
    "Check the meta-evidence locator's answer against the chain",
    "Recorded, not implemented: both apps read the same locator, so the meta-evidence fields are compared as today; a flake on Gnosis 460 is the locator answering differently between the two extractions.",
  ),
];

function listLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function chainOf(context: CaseContext): number {
  return context.testCase?.chainId ?? 0;
}

function withoutBackslashes(text: string | null): string | null {
  return withoutWhitespace(text)?.replace(/\\/g, "") ?? null;
}

/** The whole table, in ledger order. */
export const LEDGER: readonly LedgerEntry[] = [...DEVIATIONS, ...PROPOSALS];
