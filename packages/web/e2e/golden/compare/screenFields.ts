import type { CreateField, CreateSnapshot, OngoingDisputeSnapshot, OngoingField, OngoingSnapshot } from "../types";
import type { Mismatch } from "./caseFields";
import { sameJson, sameWei } from "./values";

// Field comparators of the Ongoing and Create snapshots (04 §1).

function mismatch(key: string, production: unknown, next: unknown, path: string = key): Mismatch {
  return { path, key, production, next };
}

function exact(key: string, production: unknown, next: unknown): Mismatch[] {
  return sameJson(production, next) ? [] : [mismatch(key, production, next)];
}

/**
 * Whether the dispute changed period between the two runs (04 §1), established from production rather than inferred
 * from the difference itself: the new app's period is a later one, and production's own countdown says its period could
 * have ended before the new app's snapshot was taken.
 */
function changedPeriodBetweenRuns(production: OngoingDisputeSnapshot, next: OngoingDisputeSnapshot, nextTakenAt: number): boolean {
  if (production.period === null || next.period === null || next.period <= production.period) return false;
  return production.periodEndsAt !== null && production.periodEndsAt <= nextTakenAt;
}

/** One dispute present in both lists; one that changed period between the two runs is compared on id and title only. */
function compareDispute(production: OngoingDisputeSnapshot, next: OngoingDisputeSnapshot, nextTakenAt: number): Mismatch[] {
  const path = (field: string) => `disputes[${production.id}].${field}`;
  const found: Mismatch[] = [];
  if (production.title !== next.title) found.push(mismatch("disputes[].title", production.title, next.title, path("title")));
  if (production.period !== next.period) {
    if (changedPeriodBetweenRuns(production, next, nextTakenAt)) return found;
    found.push(mismatch("disputes[].period", production.period, next.period, path("period")));
  }
  if (production.courtName !== next.courtName) found.push(mismatch("disputes[].courtName", production.courtName, next.courtName, path("courtName")));
  if (production.countdownPresent !== next.countdownPresent)
    found.push(mismatch("disputes[].countdownPresent", production.countdownPresent, next.countdownPresent, path("countdownPresent")));
  return found;
}

/** The list compared as a set keyed by id (04 §1). */
function compareDisputes(production: OngoingSnapshot, next: OngoingSnapshot): Mismatch[] {
  const nextById = new Map(next.disputes.map((dispute) => [dispute.id, dispute]));
  const productionIds = new Set(production.disputes.map((dispute) => dispute.id));
  const found: Mismatch[] = [];
  for (const dispute of production.disputes) {
    const counterpart = nextById.get(dispute.id);
    if (counterpart === undefined) found.push(mismatch("disputes[].membership", dispute, null, `disputes[${dispute.id}]`));
    else found.push(...compareDispute(dispute, counterpart, next.takenAt));
  }
  for (const dispute of next.disputes) {
    if (!productionIds.has(dispute.id)) found.push(mismatch("disputes[].membership", null, dispute, `disputes[${dispute.id}]`));
  }
  return found;
}

export const ONGOING_COMPARATORS: Readonly<Record<OngoingField, (production: OngoingSnapshot, next: OngoingSnapshot) => Mismatch[]>> = {
  state: (p, n) => exact("state", p.state, n.state),
  disputes: compareDisputes,
};

export const CREATE_COMPARATORS: Readonly<Record<CreateField, (production: CreateSnapshot, next: CreateSnapshot) => Mismatch[]>> = {
  available: (p, n) => exact("available", p.available, n.available),
  courts: (p, n) => exact("courts", p.courts, n.courts),
  defaultCost: (p, n) => (sameWei(p.defaultCost, n.defaultCost) ? [] : [mismatch("defaultCost", p.defaultCost, n.defaultCost)]),
  questionTypes: (p, n) => exact("questionTypes", p.questionTypes, n.questionTypes),
  optionRange: (p, n) => exact("optionRange", p.optionRange, n.optionRange),
  "validation.requiredFields": (p, n) =>
    exact(
      "validation.requiredFields",
      [...p.validation.requiredFields].sort((a, b) => a.localeCompare(b)),
      [...n.validation.requiredFields].sort((a, b) => a.localeCompare(b)),
    ),
};

export function ongoingFieldValue(snapshot: OngoingSnapshot, field: OngoingField): unknown {
  return snapshot[field];
}

export function createFieldValue(snapshot: CreateSnapshot, field: CreateField): unknown {
  return field === "validation.requiredFields" ? snapshot.validation.requiredFields : snapshot[field];
}
