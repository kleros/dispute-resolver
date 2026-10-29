import type * as Core from "@dispute-resolver/core";
import { vi } from "vitest";

/**
 * Not exported from the data index: that index imports core, and a `vi.mock` factory must not load the module it mocks.
 * Import this file inside the factory:
 *   vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));
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
