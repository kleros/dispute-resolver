import { readFileSync } from "node:fs";
import { createPublicClient, custom, hexToBigInt, numberToHex } from "viem";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getChain } from "../../../packages/core/src/chains";
import type { ArbitratedBinding, DisputeLookup, LocalIdResolution } from "../../../packages/core/src/disputes/types";
import type { Family, FamilyDetection } from "../../../packages/core/src/families/types";
import type { Address } from "../../../packages/core/src/types";
import type { ChainReader } from "./chains";
import { chainContributorReads, firstContribution, readFirstContributor, type ContributionLog, type ContributorReads, type GovernorFunding } from "./contributors";

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

function reads(options: {
  family: Family;
  localId: LocalIdResolution;
  logs?: ContributionLog[];
  governor?: () => Promise<GovernorFunding>;
}): ContributorReads & { scannedFrom: bigint[] } {
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
    governorFunding: options.governor ?? (() => Promise.reject(new Error("not a governor"))),
  };
}

const hexSchema = z.templateLiteral(["0x", z.string()]);

const recordedSchema = z.object({
  chainId: z.number().int(),
  blockNumber: z.number().int(),
  calls: z.array(z.object({ method: z.string(), params: z.unknown(), result: z.unknown() })),
  logFilters: z.array(
    z.object({
      address: z.string(),
      topics: z.array(z.unknown()),
      logs: z.array(z.looseObject({ blockNumber: hexSchema })),
    }),
  ),
});

const logFilterSchema = z.object({ address: z.string(), topics: z.array(z.unknown()), fromBlock: hexSchema, toBlock: hexSchema });

/**
 * A reader of the chain as `__fixtures__/<name>` recorded it: each call is answered with its recorded reply, a log
 * filter with the recorded logs of the same address and topics inside the requested range, and anything the recording
 * does not hold rejects, so a read the recording did not see fails the test instead of answering empty.
 */
function recordedReader(name: string): ChainReader {
  const recorded = recordedSchema.parse(JSON.parse(readFileSync(new URL(`__fixtures__/${name}`, import.meta.url), "utf8")));
  const replies = new Map(recorded.calls.map((call) => [JSON.stringify({ method: call.method, params: call.params }), call.result]));
  const request = ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
    if (method === "eth_blockNumber") return Promise.resolve(numberToHex(recorded.blockNumber));
    if (method === "eth_getLogs") {
      const filter = logFilterSchema.parse((params as readonly unknown[])[0]);
      const match = recorded.logFilters.find((item) => item.address === filter.address.toLowerCase() && JSON.stringify(item.topics) === JSON.stringify(filter.topics));
      if (match === undefined) return Promise.reject(new Error(`No recorded logs for ${JSON.stringify(filter)}`));
      const [from, to] = [hexToBigInt(filter.fromBlock), hexToBigInt(filter.toBlock)];
      return Promise.resolve(match.logs.filter((log) => hexToBigInt(log.blockNumber) >= from && hexToBigInt(log.blockNumber) <= to));
    }
    const key = JSON.stringify({ method, params });
    return replies.has(key) ? Promise.resolve(replies.get(key)) : Promise.reject(new Error(`No recorded reply for ${key}`));
  };
  const chain = getChain(recorded.chainId);
  const arbitrator = chain?.klerosLiquid;
  if (chain === undefined || arbitrator === undefined) throw new Error(`Chain ${String(recorded.chainId)} has no arbitrator.`);
  const client = createPublicClient({ transport: custom({ request }, { retryCount: 0 }) });
  return { chainId: recorded.chainId, chain, arbitrator, block: BigInt(recorded.blockNumber), client };
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

  it("D-47, MC-7: golden 1621, 1676, 1672 and 535 have no contributor: no list of their governor sessions was ever paid (recorded at block 26,203,380)", async () => {
    const recorded = chainContributorReads(recordedReader("governor-cases-1.json"));
    const sessions = new Map([
      [1621n, 18n],
      [1676n, 23n],
      [1672n, 88n],
      [535n, 6n],
    ]);
    for (const [disputeId, session] of sessions) {
      const record = await readFirstContributor(recorded, disputeId);
      expect(record, `golden ${disputeId.toString()}`).toMatchObject({ status: "no-contributions", account: null, family: "governor", governor: { session, paidFees: [[0n, 0n]] } });
    }
  });

  it("MC-7: a governor session with paid fees is recorded as funded and runs with no account, its funding kept", async () => {
    const governor: GovernorFunding = { session: 4n, paidFees: [[0n, 0n], [5n, 0n]] };
    const fake = reads({ family: "governor", localId: { kind: "not-applicable" }, governor: () => Promise.resolve(governor) });
    const record = await readFirstContributor(fake, 2000n);
    expect(record).toMatchObject({ status: "governor-funded", account: null, family: "governor", governor, reason: expect.stringContaining("MC-7") as unknown });
  });

  it("MC-7: a failed governor session read is an error record, never 'no account'", async () => {
    const fake = reads({ family: "governor", localId: { kind: "not-applicable" }, governor: () => Promise.reject(new Error("rpc down")) });
    expect(await readFirstContributor(fake, 1621n)).toMatchObject({ status: "error", account: null });
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
