import { describe, expect, it } from "vitest";
import type { ArbitratedBinding, DisputeLookup, LocalIdResolution } from "../../../packages/core/src/disputes/types";
import type { Family, FamilyDetection } from "../../../packages/core/src/families/types";
import type { Address } from "../../../packages/core/src/types";
import { firstContribution, readFirstContributor, type ContributionLog, type ContributorReads } from "./contributors";

const ARBITRABLE: Address = "0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38";
const ALICE: Address = "0x00000000000000000000000000000000000a11ce";
const BOB: Address = "0x0000000000000000000000000000000000000b0b";

function contribution(contributor: Address, blockNumber: bigint, logIndex: number): ContributionLog {
  return { contributor, round: 0n, ruling: 1n, amount: 10n, blockNumber, logIndex, transactionHash: `0x${blockNumber.toString(16).padStart(64, "0")}` };
}

function found(disputeId: bigint): DisputeLookup {
  // The binding is branded by core; a test double builds one directly.
  const binding = { chainId: 1, disputeId, arbitrator: "0x988b3a538b618c7a603e1c11ab82cd16dbe28069", arbitrated: ARBITRABLE } as unknown as ArbitratedBinding;
  return {
    status: "found",
    binding,
    dispute: { id: disputeId, subcourtId: 0n, arbitrated: ARBITRABLE, numberOfChoices: 2n, period: 4, lastPeriodChange: 0, ruled: true },
  };
}

function detection(family: Family): FamilyDetection {
  return {
    chainId: 1,
    arbitrable: ARBITRABLE,
    family,
    writeFamily: family === "reality-proxy" ? "idr-v2" : family,
    capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "none" }, withdraw: { kind: "none" } },
    realityProxy: null,
    implementation: null,
    selectors: [],
  };
}

function reads(options: { family: Family; localId: LocalIdResolution; logs?: ContributionLog[] }): ContributorReads & { scannedFrom: bigint[] } {
  const scannedFrom: bigint[] = [];
  return {
    scannedFrom,
    lookup: (disputeId) => Promise.resolve(found(disputeId)),
    detect: () => Promise.resolve(detection(options.family)),
    localId: () => Promise.resolve(options.localId),
    creationBlock: () => Promise.resolve(100n),
    contributions: (_arbitrable, _localId, fromBlock) => {
      scannedFrom.push(fromBlock);
      return Promise.resolve(options.logs ?? []);
    },
  };
}

describe("account context (04 §1)", () => {
  it("04 §1: the first contributor is the earliest by block, then by log index, across rounds", () => {
    const logs = [contribution(BOB, 12n, 0), contribution(ALICE, 11n, 7), contribution(BOB, 11n, 8)];
    expect(firstContribution(logs)?.contributor).toBe(ALICE);
  });

  it("04 §1: reads the Contribution events of the dispute's local ID from its creation block", async () => {
    const fake = reads({ family: "idr-v1", localId: { kind: "local-id", value: 116n }, logs: [contribution(BOB, 120n, 3), contribution(ALICE, 120n, 1)] });
    const record = await readFirstContributor(fake, 1678n);
    expect(record).toMatchObject({ status: "contributor", account: ALICE, family: "idr-v1", localId: 116n, contributions: 2 });
    expect(fake.scannedFrom).toEqual([100n]);
  });

  it("04 §1: a case without contributions runs with no account", async () => {
    const record = await readFirstContributor(reads({ family: "idr-legacy", localId: { kind: "local-id", value: 3n } }), 328n);
    expect(record).toEqual({ status: "no-contributions", account: null, family: "idr-legacy", localId: 3n });
  });

  it("MC-7: a governor has no local dispute ID and no Contribution events", async () => {
    const record = await readFirstContributor(reads({ family: "governor", localId: { kind: "not-applicable" } }), 1621n);
    expect(record).toMatchObject({ status: "no-local-id", account: null, family: "governor" });
  });

  it("a transport failure is an error record, never 'no account'", async () => {
    const record = await readFirstContributor(reads({ family: "idr-v2", localId: { kind: "unresolved", reason: "rpc-error" } }), 1n);
    expect(record.status).toBe("error");
  });

  it("a dispute that does not exist is an error record", async () => {
    const fake: ContributorReads = { ...reads({ family: "idr-v2", localId: { kind: "not-applicable" } }), lookup: () => Promise.resolve({ status: "not-found" }) };
    expect(await readFirstContributor(fake, 99_999n)).toMatchObject({ status: "error", account: null });
  });
});
