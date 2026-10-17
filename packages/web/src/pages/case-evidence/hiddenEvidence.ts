import type { EvidenceList, HiddenEvidenceReason } from "@dispute-resolver/core";

/** Why core hid an evidence entry, in the user's terms (D-22). Exhaustive, so a new core reason fails the typecheck. */
export const HIDDEN_REASON_LABELS: Readonly<Record<HiddenEvidenceReason, string>> = {
  undecodable: "undecodable event log",
  "not-content-addressed": "not content-addressed",
  "fetch-failed": "could not be fetched",
  "not-json": "not valid JSON",
  "schema-invalid": "not a valid evidence document",
};

const REASONS = Object.keys(HIDDEN_REASON_LABELS) as readonly HiddenEvidenceReason[];

/**
 * The visible count of hidden entries (D-22), for example "2 evidence items hidden: not content-addressed"; with
 * several reasons each is counted ("3 evidence items hidden: 1 not valid JSON, 2 could not be fetched"). `null` when
 * nothing is hidden.
 */
export function hiddenEvidenceText(list: EvidenceList): string | null {
  const total = list.hiddenEvidenceCount;
  if (total === 0) return null;
  const present = REASONS.filter((reason) => list.hiddenByReason[reason] > 0);
  const noun = total === 1 ? "evidence item" : "evidence items";
  const [first] = present;
  if (first === undefined) return `${String(total)} ${noun} hidden`;
  const reasons = present.length === 1 ? HIDDEN_REASON_LABELS[first] : present.map((reason) => `${String(list.hiddenByReason[reason])} ${HIDDEN_REASON_LABELS[reason]}`).join(", ");
  return `${String(total)} ${noun} hidden: ${reasons}`;
}
