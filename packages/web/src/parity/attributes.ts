import type { DataAttributeName, TestId } from "./ids";
import type {
  AppealCardHook,
  AppealPanelHook,
  CasePageHook,
  CreatePageHook,
  DecisionHook,
  EvidenceItemHook,
  FieldHook,
  OngoingCardHook,
  OngoingPageHook,
  OptionRangeHook,
  RulingOptionsHook,
  TimelineColumnHook,
} from "./types";

/** What a hook may carry before it is written as an attribute. `null` and `undefined` mean "absent from the element". */
type AttributeValue = string | number | bigint | boolean | null | undefined;

/** The written form of the `data-*` attributes: strings, each possibly absent. */
export type DataAttributeStrings = Readonly<Partial<Record<DataAttributeName, string>>>;

/** The props a parity hook spreads onto an element: `data-testid` plus the string-valued `data-*` attributes of §12. */
export type ParityAttributes = { readonly "data-testid": TestId } & DataAttributeStrings;

/** Spread onto an element that carries only its `data-testid`: `<h1 {...testId("case-title")} />`. */
export function testId(id: TestId): { readonly "data-testid": TestId } {
  return { "data-testid": id };
}

/**
 * Writes the present values as strings: a bigint as its decimal digits, a boolean as `"true"` or `"false"`, a number with
 * `String`. A `null` or `undefined` value leaves the attribute off the element, because absence is part of the snapshot
 * (`data-withdrawable-wei` only for `withdraw`, `case-question` only when the question exists).
 */
export function dataAttributes(values: Readonly<Partial<Record<DataAttributeName, AttributeValue>>>): DataAttributeStrings {
  const attributes: Partial<Record<DataAttributeName, string>> = {};
  for (const name of Object.keys(values) as DataAttributeName[]) {
    const value = values[name];
    if (value !== null && value !== undefined) attributes[name] = String(value);
  }
  return attributes;
}

function hook(id: TestId, values: Readonly<Partial<Record<DataAttributeName, AttributeValue>>>): ParityAttributes {
  return { ...testId(id), ...dataAttributes(values) };
}

/** `[data-testid="case-page"]` (§12.1): the state and everything the snapshot reads from the page itself. */
export function casePageAttributes(page: CasePageHook): ParityAttributes {
  return hook("case-page", {
    "data-state": page.state,
    "data-arbitrable": page.arbitrable?.toLowerCase(),
    "data-family": page.family,
    "data-compatibility": page.compatibility,
    "data-period": page.period,
    "data-last-period-change": page.lastPeriodChange,
    "data-reality-notice": page.realityNotice,
  });
}

/** `[data-testid="case-ruling-options"]` (§12.1): `data-ruling-options` is JSON `{type, titles, reserved, precision}`. */
export function rulingOptionsAttributes(options: RulingOptionsHook): ParityAttributes {
  const snapshot = { type: options.type, titles: options.titles ?? [], reserved: options.reserved ?? {}, precision: options.precision };
  return hook("case-ruling-options", { "data-ruling-options": JSON.stringify(snapshot) });
}

/** `[data-testid="timeline-column"]` (§12.1). */
export function timelineColumnAttributes(column: TimelineColumnHook): ParityAttributes {
  return hook("timeline-column", { "data-name": column.name, "data-state": column.state });
}

/** `[data-testid="case-votes"]` (§12.1). */
export function votesAttributes(numberOfVotes: number | bigint): ParityAttributes {
  return hook("case-votes", { "data-value": numberOfVotes });
}

/** `[data-testid="case-decision"]` (§12.1); `data-won-by` is written only for a `winner`. */
export function decisionAttributes(decision: DecisionHook): ParityAttributes {
  return hook("case-decision", { "data-kind": decision.kind, "data-won-by": decision.kind === "winner" ? decision.wonBy : null });
}

/** `[data-testid="appeal-panel"]` (§12.1); the withdrawable amount belongs to the `withdraw` kind only. */
export function appealPanelAttributes(panel: AppealPanelHook): ParityAttributes {
  return hook("appeal-panel", { "data-kind": panel.kind, "data-withdrawable-wei": panel.kind === "withdraw" ? panel.withdrawableWei : null });
}

/** `[data-testid="appeal-card"]` (§12.1): the code and the amounts as decimal strings, the deadline in Unix seconds. */
export function appealCardAttributes(card: AppealCardHook): ParityAttributes {
  return hook("appeal-card", {
    "data-code": card.code,
    "data-funded-percent": card.fundedPercent,
    "data-remaining-wei": card.remainingWei,
    "data-deadline": card.deadline,
  });
}

/** `[data-testid="evidence-item"]` (§12.1). */
export function evidenceItemAttributes(item: EvidenceItemHook): ParityAttributes {
  return hook("evidence-item", { "data-submitter": item.submitter, "data-timestamp": item.timestamp });
}

/** `[data-testid="evidence-hidden-count"]` (§12.1). */
export function hiddenEvidenceCountAttributes(count: number): ParityAttributes {
  return hook("evidence-hidden-count", { "data-count": count });
}

/** `[data-testid="ongoing-page"]` (§12.2). */
export function ongoingPageAttributes(page: OngoingPageHook): ParityAttributes {
  return hook("ongoing-page", { "data-chain": page.chain, "data-state": page.state });
}

/** `[data-testid="ongoing-card"]` (§12.2). */
export function ongoingCardAttributes(card: OngoingCardHook): ParityAttributes {
  return hook("ongoing-card", { "data-dispute-id": card.disputeId, "data-period": card.period });
}

/** `[data-testid="create-page"]` (§12.2). */
export function createPageAttributes(page: CreatePageHook): ParityAttributes {
  return hook("create-page", { "data-chain": page.chain, "data-available": page.available });
}

/** `[data-testid="create-court"]` (§12.2): `data-options` is a JSON array of the court names. */
export function createCourtAttributes(courtNames: readonly string[]): ParityAttributes {
  return hook("create-court", { "data-options": JSON.stringify(courtNames) });
}

/** `[data-testid="create-cost"]` (§12.2): the default arbitration cost in wei. */
export function createCostAttributes(wei: bigint): ParityAttributes {
  return hook("create-cost", { "data-wei": wei });
}

/** `[data-testid="create-question-type"]` (§12.2): `data-options` is a JSON array of the labels. */
export function createQuestionTypeAttributes(labels: readonly string[]): ParityAttributes {
  return hook("create-question-type", { "data-options": JSON.stringify(labels) });
}

/** `[data-testid="create-option-count"]` (§12.2). */
export function createOptionCountAttributes(range: OptionRangeHook): ParityAttributes {
  return hook("create-option-count", { "data-min": range.min, "data-max": range.max });
}

/**
 * A Create form field wrapper (§12.2, no `data-testid`): `data-field` names the field and `data-required="true"` marks the
 * required ones; an optional field carries no `data-required`.
 */
export function fieldAttributes(field: FieldHook): DataAttributeStrings {
  return dataAttributes({ "data-field": field.field, "data-required": field.required ? true : null });
}
