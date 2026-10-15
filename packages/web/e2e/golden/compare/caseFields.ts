import type { AppealCardSnapshot, CaseField, CaseSnapshot, EvidenceDisplaySnapshot, EvidenceSnapshot, RulingOptionsSnapshot } from "../types";
import { renderedText, sameAddress, sameJson, sameReservedCode, sameUrl, sameWei, timeSign, withoutWhitespace } from "./values";

// Field comparators of the Case snapshot. Each returns the mismatches between production and the new app; a mismatch's
// `key` names the rule that produced it (a field, or a sub-field such as `evidence[].attachmentHref`), which is what the
// deviation table's acceptances are registered under.

export interface Mismatch {
  /** Where in the snapshot, with indexes: `evidence[2].attachmentHref`. */
  readonly path: string;
  /** The rule key, without indexes: `evidence[].attachmentHref`. */
  readonly key: string;
  readonly production: unknown;
  readonly next: unknown;
}

type Comparator = (production: CaseSnapshot, next: CaseSnapshot) => Mismatch[];

function mismatch(key: string, production: unknown, next: unknown, path: string = key): Mismatch {
  return { path, key, production, next };
}

function exact(key: string, production: unknown, next: unknown): Mismatch[] {
  return sameJson(production, next) ? [] : [mismatch(key, production, next)];
}

function url(key: string, production: string | null, next: string | null): Mismatch[] {
  return sameUrl(production, next) ? [] : [mismatch(key, production, next)];
}

/** The types production renders a voting-options list for; for the others it shows the type label only. */
const LISTED_TYPES: ReadonlySet<string> = new Set(["single-select", "multiple-select"]);

function compareRulingOptions(production: RulingOptionsSnapshot | null, next: RulingOptionsSnapshot | null): Mismatch[] {
  if (production === null || next === null) return exact("rulingOptions", production, next);
  const found: Mismatch[] = [];
  if (production.type !== next.type) found.push(mismatch("rulingOptions.type", production.type, next.type));
  if (!LISTED_TYPES.has(production.type)) return found;
  if (!sameJson(production.titles.map(renderedText), next.titles.map(renderedText))) found.push(mismatch("rulingOptions.titles", production.titles, next.titles));
  const productionReserved = Object.entries(production.reserved);
  const nextReserved = Object.entries(next.reserved);
  const reservedMatch =
    productionReserved.length === nextReserved.length &&
    productionReserved.every(([code, title]) => nextReserved.some(([nextCode, nextTitle]) => sameReservedCode(code, nextCode) && renderedText(title) === renderedText(nextTitle)));
  if (!reservedMatch) found.push(mismatch("rulingOptions.reserved", production.reserved, next.reserved));
  return found;
}

const FUNDED_PERCENT_TOLERANCE = 0.01;

function compareCard(production: AppealCardSnapshot, next: AppealCardSnapshot, productionTakenAt: number, nextTakenAt: number, index: number): Mismatch[] {
  const path = (field: string) => `appealPanel.cards[${index.toString()}].${field}`;
  const found: Mismatch[] = [];
  if (production.title !== next.title) found.push(mismatch("appealPanel.cards[].title", production.title, next.title, path("title")));
  const funded = production.fundedPercent !== null && next.fundedPercent !== null && Math.abs(production.fundedPercent - next.fundedPercent) <= FUNDED_PERCENT_TOLERANCE;
  if (!funded && production.fundedPercent !== next.fundedPercent)
    found.push(mismatch("appealPanel.cards[].fundedPercent", production.fundedPercent, next.fundedPercent, path("fundedPercent")));
  if (!sameWei(production.remainingWei, next.remainingWei))
    found.push(mismatch("appealPanel.cards[].remainingWei", production.remainingWei, next.remainingWei, path("remainingWei")));
  const productionSign = timeSign(production.deadline, productionTakenAt);
  const nextSign = timeSign(next.deadline, nextTakenAt);
  if (productionSign !== nextSign) found.push(mismatch("appealPanel.cards[].deadline", productionSign, nextSign, path("deadline")));
  return found;
}

/** Cards are matched by ruling code (the free-input card has none and is matched by position among the code-less). */
function compareCards(production: CaseSnapshot, next: CaseSnapshot): Mismatch[] {
  const found: Mismatch[] = [];
  const productionCodes = production.appealPanel.cards.map((card) => card.code);
  const nextCodes = next.appealPanel.cards.map((card) => card.code);
  const byCode = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "");
  if (!sameJson([...productionCodes].sort(byCode), [...nextCodes].sort(byCode)))
    found.push(mismatch("appealPanel.cards[].membership", productionCodes, nextCodes, "appealPanel.cards"));
  production.appealPanel.cards.forEach((card, index) => {
    const counterpart = next.appealPanel.cards.find((candidate) => candidate.code === card.code);
    if (counterpart !== undefined) found.push(...compareCard(card, counterpart, production.takenAt, next.takenAt, index));
  });
  return found;
}

function compareEvidenceItem(production: EvidenceSnapshot, next: EvidenceSnapshot, index: number): Mismatch[] {
  const path = (field: string) => `evidence[${index.toString()}].${field}`;
  const found: Mismatch[] = [];
  if (production.title !== next.title) found.push(mismatch("evidence[].title", production.title, next.title, path("title")));
  if (withoutWhitespace(production.descriptionText) !== withoutWhitespace(next.descriptionText)) {
    found.push(mismatch("evidence[].descriptionText", production.descriptionText, next.descriptionText, path("descriptionText")));
  }
  if (!sameAddress(production.submitter, next.submitter)) found.push(mismatch("evidence[].submitter", production.submitter, next.submitter, path("submitter")));
  if (production.timestamp !== next.timestamp) found.push(mismatch("evidence[].timestamp", production.timestamp, next.timestamp, path("timestamp")));
  if (!sameUrl(production.attachmentHref, next.attachmentHref))
    found.push(mismatch("evidence[].attachmentHref", production.attachmentHref, next.attachmentHref, path("attachmentHref")));
  return found;
}

/** The index of the first item at or after `from` that satisfies `matches`, or -1. */
function indexFrom(items: readonly EvidenceSnapshot[], from: number, matches: (item: EvidenceSnapshot) => boolean): number {
  const found = items.slice(from).findIndex(matches);
  return found < 0 ? -1 : from + found;
}

interface EvidencePair {
  /** The index in production's list, which mismatch paths carry. */
  readonly index: number;
  readonly production: EvidenceSnapshot;
  readonly next: EvidenceSnapshot;
}

/**
 * Each item the new app shows with its production counterpart. The new list is production's in the same order with
 * items left out (D-22), so the pairing walks production once: the next item with the same title and timestamp, else
 * the next with the same title. A new item with no counterpart is left to the membership mismatch.
 */
function pairEvidence(production: readonly EvidenceSnapshot[], next: readonly EvidenceSnapshot[]): EvidencePair[] {
  const pairs: EvidencePair[] = [];
  let cursor = 0;
  for (const item of next) {
    const same = indexFrom(production, cursor, (candidate) => candidate.title === item.title && candidate.timestamp === item.timestamp);
    const index = same < 0 ? indexFrom(production, cursor, (candidate) => candidate.title === item.title) : same;
    const counterpart = production[index];
    if (counterpart === undefined) continue;
    pairs.push({ index, production: counterpart, next: item });
    cursor = index + 1;
  }
  return pairs;
}

/**
 * The evidence list in order (newest first, spec §5.14). A different length is one `evidence[].membership` mismatch,
 * and every item the new app still shows is compared with its production counterpart (04 §1: only the hidden items may
 * differ, D-22); paths carry production's index.
 */
function compareEvidence(production: readonly EvidenceSnapshot[] | null, next: readonly EvidenceSnapshot[] | null): Mismatch[] {
  if (production === null || next === null) return exact("evidence", production, next);
  if (production.length === next.length) {
    return production.flatMap((item, index) => {
      const counterpart = next[index];
      return counterpart === undefined ? [] : compareEvidenceItem(item, counterpart, index);
    });
  }
  const titles = (items: readonly EvidenceSnapshot[]) => items.map((item) => item.title);
  const items = pairEvidence(production, next).flatMap((pair) => compareEvidenceItem(pair.production, pair.next, pair.index));
  return [mismatch("evidence[].membership", titles(production), titles(next), "evidence"), ...items];
}

function compareParams(production: Readonly<Record<string, string>>, next: Readonly<Record<string, string>>): Mismatch[] {
  const keys = [...new Set([...Object.keys(production), ...Object.keys(next)])].sort((a, b) => a.localeCompare(b));
  return keys.flatMap((key) => {
    const a = production[key] ?? null;
    const b = next[key] ?? null;
    if (sameAddress(a, b)) return [];
    const ruleKey = /rpc/i.test(key) ? "evidenceDisplay.params.rpc" : "evidenceDisplay.params";
    return [mismatch(ruleKey, a, b, `evidenceDisplay.params.${key}`)];
  });
}

function compareEvidenceDisplay(production: EvidenceDisplaySnapshot | null, next: EvidenceDisplaySnapshot | null): Mismatch[] {
  if (production === null || next === null) return exact("evidenceDisplay", production, next);
  return [
    ...exact("evidenceDisplay.srcOrigin", production.srcOrigin, next.srcOrigin),
    ...exact("evidenceDisplay.srcPath", production.srcPath, next.srcPath),
    ...compareParams(production.params, next.params),
    ...exact("evidenceDisplay.sandbox", production.sandbox, next.sandbox),
  ];
}

export const CASE_COMPARATORS: Readonly<Record<CaseField, Comparator>> = {
  exists: (p, n) => exact("exists", p.exists, n.exists),
  arbitrable: (p, n) => (sameAddress(p.arbitrable, n.arbitrable) ? [] : [mismatch("arbitrable", p.arbitrable, n.arbitrable)]),
  family: () => [],
  compatibility: (p, n) => exact("compatibility", p.compatibility, n.compatibility),
  title: (p, n) => exact("title", p.title, n.title),
  question: (p, n) => exact("question", p.question, n.question),
  descriptionText: (p, n) =>
    withoutWhitespace(p.descriptionText) === withoutWhitespace(n.descriptionText) ? [] : [mismatch("descriptionText", p.descriptionText, n.descriptionText)],
  rulingOptions: (p, n) => compareRulingOptions(p.rulingOptions, n.rulingOptions),
  period: (p, n) => exact("period", p.period, n.period),
  lastPeriodChange: (p, n) => exact("lastPeriodChange", p.lastPeriodChange, n.lastPeriodChange),
  timeline: (p, n) => exact("timeline", p.timeline, n.timeline),
  numberOfVotes: (p, n) => exact("numberOfVotes", p.numberOfVotes, n.numberOfVotes),
  courtName: (p, n) => exact("courtName", p.courtName, n.courtName),
  "decision.kind": (p, n) => exact("decision.kind", p.decision?.kind ?? null, n.decision?.kind ?? null),
  "decision.rulingText": (p, n) => exact("decision.rulingText", p.decision?.rulingText ?? null, n.decision?.rulingText ?? null),
  "decision.wonBy": (p, n) => exact("decision.wonBy", p.decision?.wonBy ?? null, n.decision?.wonBy ?? null),
  realityNotice: (p, n) => exact("realityNotice", p.realityNotice, n.realityNotice),
  "appealPanel.kind": (p, n) => exact("appealPanel.kind", p.appealPanel.kind, n.appealPanel.kind),
  "appealPanel.cards": compareCards,
  "appealPanel.withdrawableWei": (p, n) =>
    sameWei(p.appealPanel.withdrawableWei, n.appealPanel.withdrawableWei)
      ? []
      : [mismatch("appealPanel.withdrawableWei", p.appealPanel.withdrawableWei, n.appealPanel.withdrawableWei)],
  evidence: (p, n) => compareEvidence(p.evidence, n.evidence),
  hiddenEvidenceCount: (p, n) => exact("hiddenEvidenceCount", p.hiddenEvidenceCount, n.hiddenEvidenceCount),
  "links.court": (p, n) => url("links.court", p.links.court, n.links.court),
  "links.arbitrableApp": (p, n) => url("links.arbitrableApp", p.links.arbitrableApp, n.links.arbitrableApp),
  "links.metaEvidenceFile": (p, n) => url("links.metaEvidenceFile", p.links.metaEvidenceFile, n.links.metaEvidenceFile),
  evidenceDisplay: (p, n) => compareEvidenceDisplay(p.evidenceDisplay, n.evidenceDisplay),
};

/** The value of a field as the report shows it. */
export function caseFieldValue(snapshot: CaseSnapshot, field: CaseField): unknown {
  switch (field) {
    case "decision.kind":
      return snapshot.decision?.kind ?? null;
    case "decision.rulingText":
      return snapshot.decision?.rulingText ?? null;
    case "decision.wonBy":
      return snapshot.decision?.wonBy ?? null;
    case "appealPanel.kind":
      return snapshot.appealPanel.kind;
    case "appealPanel.cards":
      return snapshot.appealPanel.cards;
    case "appealPanel.withdrawableWei":
      return snapshot.appealPanel.withdrawableWei;
    case "links.court":
      return snapshot.links.court;
    case "links.arbitrableApp":
      return snapshot.links.arbitrableApp;
    case "links.metaEvidenceFile":
      return snapshot.links.metaEvidenceFile;
    default:
      return snapshot[field];
  }
}
