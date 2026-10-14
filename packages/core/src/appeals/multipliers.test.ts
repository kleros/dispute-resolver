import { toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { idrV2Abi, multiplierGetterAbi } from "../abi";
import type { Address } from "../types";
import { GOVERNOR_MULTIPLIERS, recordedValue, type RecordedGovernor } from "./__fixtures__/governorMultipliers";
import { MULTIPLIER_GETTERS, type RecordedGetters } from "./__fixtures__/recorded";
import { readMultipliers } from "./index";
import { FAMILY_SIGNATURES, answer, callKey, detectionFor, fakeNode, recordedDetection, reverting, rpcError, type CallReply } from "./testHelpers";

const SYNTHETIC: Address = "0x00000000000000000000000000000000000000aa";

function recordedGetters(label: string): RecordedGetters {
  const contract = MULTIPLIER_GETTERS.find((candidate) => candidate.label === label);
  if (contract === undefined) throw new Error(`${label} is not recorded`);
  return contract;
}

/** The recorded replies of one contract as fake-node call answers. */
function recordedCalls(contract: RecordedGetters): [string, CallReply][] {
  return Object.entries(contract.replies).map(([getter, reply]) => [callKey(contract.address, toFunctionSelector(getter)), reply]);
}

/** Calls the fake node received, as getter signatures. */
function gettersCalled(address: Address, calls: readonly string[]): string[] {
  const signatures = [...Object.keys(recordedGetters("Unslashed (idr-v1)").replies), "sharedMultiplier()"];
  const bySelector = new Map(signatures.map((getter) => [callKey(address, toFunctionSelector(getter)), getter]));
  return calls.map((key) => bySelector.get(key) ?? key);
}

async function readRecorded(chainId: number, label: string) {
  const contract = recordedGetters(label);
  const family = await recordedDetection(chainId, contract.address);
  const { client, requests } = fakeNode({ head: 26_190_905n, calls: recordedCalls(contract) });
  return { result: await readMultipliers(client, family), called: gettersCalled(contract.address, requests.calls), family };
}

/** A deployed governor read through its recorded replies, with `overrides` replacing single replies. */
async function readGovernor(governor: RecordedGovernor, overrides: readonly [string, CallReply][] = []) {
  const family = await recordedDetection(governor.chainId, governor.address);
  const { client, requests } = fakeNode({ head: governor.blockNumber, calls: [...recordedCalls(governor), ...overrides] });
  return { result: await readMultipliers(client, family), called: gettersCalled(governor.address, requests.calls), family };
}

function recordedGovernor(label: string): RecordedGovernor {
  const governor = GOVERNOR_MULTIPLIERS.find((candidate) => candidate.label === label);
  if (governor === undefined) throw new Error(`${label} is not recorded`);
  return governor;
}

/** One reply of a recorded governor replaced, by getter signature. */
function replacing(governor: RecordedGovernor, signature: string, reply: CallReply): [string, CallReply] {
  return [callKey(governor.address, toFunctionSelector(signature)), reply];
}

const getter = (functionName: (typeof multiplierGetterAbi)[number]["name"]) => ({ to: SYNTHETIC, abi: multiplierGetterAbi, functionName });

describe("readMultipliers", () => {
  it("§10.9: IDisputeResolver v2 answers getMultipliers() (mainnet ArbitrableProxy)", async () => {
    const { result, called } = await readRecorded(1, "ArbitrableProxy (idr-v2)");
    expect(result).toEqual({ ok: true, value: { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n } });
    expect(called).toEqual(["getMultipliers()"]);
  });

  it("§10.9: Unslashed and the older resolver proxy answer getMultipliers()", async () => {
    const expected = { ok: true, value: { winnerStakeMultiplier: 5_000n, loserStakeMultiplier: 10_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n } };
    expect((await readRecorded(1, "Unslashed (idr-v1)")).result).toEqual(expected);
    expect((await readRecorded(1, "older resolver proxy (idr-legacy)")).result).toEqual(expected);
  });

  it("§10.9, D-47, P-05: every deployed governor reads winnerMultiplier, loserMultiplier, MULTIPLIER_DIVISOR and sharedMultiplier at its recorded block; the loser window defaults to half", async () => {
    expect(GOVERNOR_MULTIPLIERS.map((governor) => `${String(governor.chainId)}:${governor.address}`)).toEqual([
      "1:0x327a29fce0a6490e4236240be176daa282eccfdf",
      "1:0x7510c77163683448b8dc8fe9e019d9482be1ed2b",
      "100:0xf7de5537ecd69a94695fcf4bcdbdee6329b63322",
      "1:0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4",
    ]);
    for (const governor of GOVERNOR_MULTIPLIERS) {
      const { result, called, family } = await readGovernor(governor);
      const denominator = recordedValue(governor, "MULTIPLIER_DIVISOR");
      expect(family.writeFamily, governor.label).toBe("governor");
      expect(result, governor.label).toEqual({
        ok: true,
        value: {
          winnerStakeMultiplier: recordedValue(governor, "winnerMultiplier"),
          loserStakeMultiplier: recordedValue(governor, "loserMultiplier"),
          loserAppealPeriodMultiplier: denominator / 2n,
          denominator,
          sharedMultiplier: recordedValue(governor, "sharedMultiplier"),
        },
      });
      expect(called, governor.label).not.toContain("getMultipliers()");
      expect(called, governor.label).toContain("sharedMultiplier()");
    }
  });

  it("P-05: a governor whose contract fails sharedMultiplier() keeps the other multipliers, without a shared one", async () => {
    const governor = recordedGovernor("poh.eth governor");
    const { result } = await readGovernor(governor, [replacing(governor, "sharedMultiplier()", { result: "0x" })]);
    expect(result).toEqual({ ok: true, value: { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n } });
  });

  it("P-05: a transport error on a governor's sharedMultiplier() is rpc-error, never read as an absent getter", async () => {
    const governor = recordedGovernor("poh.eth governor");
    const { result } = await readGovernor(governor, [replacing(governor, "sharedMultiplier()", { error: { code: -32000, message: "header not found" } })]);
    expect(result).toMatchObject({ ok: false, error: { code: "rpc-error" } });
  });

  it("§10.9: a getter answered with no data (a fallback function) is absent, and the next name is tried", async () => {
    const { called } = await readGovernor(recordedGovernor("poh.eth governor"));
    expect(called).toEqual(expect.arrayContaining(["winnerStakeMultiplier()", "winnerMultiplier()", "denominator()", "MULTIPLIER_DIVISOR()"]));
  });

  it("§10.9: getMultipliers() reverting falls back to the single getters; the denominator defaults to 10000 (Proof of Humanity v2)", async () => {
    const { result } = await readRecorded(1, "Proof of Humanity v2 (view-only)");
    expect(result).toEqual({ ok: true, value: { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n } });
  });

  it("§10.9: each field takes the first getter that answers, in the spec's order", async () => {
    const { client, requests } = fakeNode({
      head: 1n,
      calls: [
        reverting({ to: SYNTHETIC, abi: idrV2Abi, functionName: "getMultipliers" }),
        reverting(getter("winnerStakeMultiplier")),
        answer({ ...getter("winnerMultiplier"), result: 7n }),
        answer({ ...getter("loserStakeMultiplier"), result: 9n }),
        answer({ ...getter("loserMultiplier"), result: 99n }),
        reverting(getter("denominator")),
        reverting(getter("MULTIPLIER_DIVISOR")),
        answer({ ...getter("MULTIPLIER_DENOMINATOR"), result: 1_000n }),
        answer({ ...getter("loserAppealPeriodMultiplier"), result: 300n }),
      ],
    });
    const result = await readMultipliers(client, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]));
    expect(result).toEqual({ ok: true, value: { winnerStakeMultiplier: 7n, loserStakeMultiplier: 9n, loserAppealPeriodMultiplier: 300n, denominator: 1_000n } });
    expect(gettersCalled(SYNTHETIC, requests.calls)).not.toContain("loserMultiplier()");
  });

  it("§10.9: the loser appeal-period multiplier defaults to half of a read denominator", async () => {
    const { client } = fakeNode({
      head: 1n,
      calls: [
        reverting({ to: SYNTHETIC, abi: idrV2Abi, functionName: "getMultipliers" }),
        answer({ ...getter("winnerStakeMultiplier"), result: 3n }),
        answer({ ...getter("loserStakeMultiplier"), result: 4n }),
        answer({ ...getter("denominator"), result: 1_000n }),
        reverting(getter("loserAppealPeriodMultiplier")),
      ],
    });
    const result = await readMultipliers(client, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]));
    expect(result).toEqual({ ok: true, value: { winnerStakeMultiplier: 3n, loserStakeMultiplier: 4n, loserAppealPeriodMultiplier: 500n, denominator: 1_000n } });
  });

  it("§10.9: a missing stake multiplier is unsupported", async () => {
    const reverted = (["winnerStakeMultiplier", "winnerMultiplier", "denominator", "MULTIPLIER_DIVISOR", "MULTIPLIER_DENOMINATOR", "loserAppealPeriodMultiplier"] as const).map(
      (name) => reverting(getter(name)),
    );
    const { client } = fakeNode({
      head: 1n,
      calls: [reverting({ to: SYNTHETIC, abi: idrV2Abi, functionName: "getMultipliers" }), ...reverted, answer({ ...getter("loserStakeMultiplier"), result: 4n })],
    });
    const result = await readMultipliers(client, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]));
    expect(result).toMatchObject({ ok: false, error: { code: "unsupported" } });
  });

  it("§10.9: a transport error on getMultipliers() is rpc-error, and no getter is tried", async () => {
    const { client, requests } = fakeNode({
      head: 1n,
      calls: [reverting({ to: SYNTHETIC, abi: idrV2Abi, functionName: "getMultipliers", error: { code: -32000, message: "header not found" } })],
    });
    const result = await readMultipliers(client, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]));
    expect(result).toMatchObject({ ok: false, error: { code: "rpc-error" } });
    expect(requests.calls).toHaveLength(1);
  });

  it("§10.9: a transport error on a single getter is rpc-error, never read as an absent getter", async () => {
    const { client } = fakeNode({
      head: 1n,
      calls: [
        reverting({ to: SYNTHETIC, abi: idrV2Abi, functionName: "getMultipliers" }),
        reverting({ ...getter("winnerStakeMultiplier"), error: { code: -32000, message: "header not found" } }),
        answer({ ...getter("winnerMultiplier"), result: 7n }),
        answer({ ...getter("loserStakeMultiplier"), result: 9n }),
        answer({ ...getter("denominator"), result: 10_000n }),
        answer({ ...getter("loserAppealPeriodMultiplier"), result: 5_000n }),
      ],
    });
    const result = await readMultipliers(client, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]));
    expect(result).toMatchObject({ ok: false, error: { code: "rpc-error" } });
  });

  it("§10.9: a failing transport is rpc-error", async () => {
    const { client } = fakeNode({ head: 1n, failing: { eth_call: rpcError(-32603, "fetch failed") } });
    const result = await readMultipliers(client, detectionFor(SYNTHETIC, FAMILY_SIGNATURES.governor));
    expect(result).toMatchObject({ ok: false, error: { code: "rpc-error" } });
  });

  it("D-36: a zero denominator is invalid data, so the amounts never divide by zero", async () => {
    const fromStruct = fakeNode({
      head: 1n,
      calls: [answer({ to: SYNTHETIC, abi: idrV2Abi, functionName: "getMultipliers", result: [10_000n, 20_000n, 5_000n, 0n] })],
    });
    expect(await readMultipliers(fromStruct.client, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]))).toMatchObject({ ok: false, error: { code: "invalid-data" } });

    const fromGetters = fakeNode({
      head: 1n,
      calls: [
        reverting({ to: SYNTHETIC, abi: idrV2Abi, functionName: "getMultipliers" }),
        answer({ ...getter("winnerStakeMultiplier"), result: 1n }),
        answer({ ...getter("loserStakeMultiplier"), result: 2n }),
        answer({ ...getter("denominator"), result: 0n }),
        reverting(getter("loserAppealPeriodMultiplier")),
      ],
    });
    expect(await readMultipliers(fromGetters.client, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]))).toMatchObject({ ok: false, error: { code: "invalid-data" } });
  });

  it("A13: reads the detected arbitrable through the injected read client only", async () => {
    const { client, requests } = fakeNode({ head: 1n, calls: [answer({ to: SYNTHETIC, abi: idrV2Abi, functionName: "getMultipliers", result: [1n, 2n, 3n, 4n] })] });
    await readMultipliers(client, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v1"]));
    expect(requests.methods).toEqual(["eth_call"]);
    expect(requests.calls).toEqual([callKey(SYNTHETIC, toFunctionSelector("getMultipliers()"))]);
  });
});
