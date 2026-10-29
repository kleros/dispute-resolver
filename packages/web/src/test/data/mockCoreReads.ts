import type * as Core from "@dispute-resolver/core";
import { vi } from "vitest";

/**
 * A `vi.mock` factory for `@dispute-resolver/core` that replaces every network read with a `vi.fn()` and keeps the pure
 * functions real, so a data-layer test drives the reads and checks the assembly core actually performs. It is not
 * exported from `src/test/data/index.ts`: that index imports core, and a `vi.mock` factory must not load the module it
 * mocks. Import this file directly inside the factory:
 *
 *   vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));
 *
 * and reach the mocks through `vi.mocked(core.lookupDispute)`.
 */
export async function mockCoreReads(importOriginal: () => Promise<unknown>): Promise<typeof Core> {
  const actual = (await importOriginal()) as typeof Core;
  return {
    ...actual,
    listCourts: vi.fn(),
    listOngoingDisputes: vi.fn(),
    lookupDispute: vi.fn(),
    detectFamily: vi.fn(),
    loadMetaEvidence: vi.fn(),
    readDisputeEvent: vi.fn(),
    readMetaEvidenceEvent: vi.fn(),
    loadEvidence: vi.fn(),
    readDisputeDetails: vi.fn(),
    readExecutedRuling: vi.fn(),
    readProductFunding: vi.fn(),
    readMultipliers: vi.fn(),
    readRoundFunding: vi.fn(),
    readWithdrawable: vi.fn(),
    readArbitrationCost: vi.fn(),
    readAppealCost: vi.fn(),
  };
}
