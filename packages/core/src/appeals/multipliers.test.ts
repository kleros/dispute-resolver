import { toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { idrV2Abi, multiplierGetterAbi } from "../abi";
import type { Address } from "../types";
import { GOVERNOR_MULTIPLIERS, recordedValue, type RecordedGovernor } from "./__fixtures__/governorMultipliers";
import { MULTIPLIER_GETTERS, type RecordedGetters } from "./__fixtures__/recorded";
import { readMultipliers } from "./index";
import { FAMILY_SIGNATURES, answer, callKey, detectionFor, fakeNode, recordedDetection, reverting, type CallReply } from "../test/appeals/testHelpers";

const SYNTHETIC: Address = "0x00000000000000000000000000000000000000aa";

function byLabel<T extends RecordedGetters>(contracts: readonly T[], label: string): T {
  const contract = contracts.find((candidate) => candidate.label === label);
  if (contract === undefined) throw new Error(`${label} is not recorded`);
  return contract;
}

function recordedCalls(contract: RecordedGetters): [string, CallReply][] {
  return Object.entries(contract.replies).map(([getter, reply]) => [callKey(contract.address, toFunctionSelector(getter)), reply]);
}

function gettersCalled(address: Address, calls: readonly string[]): string[] {
  const signatures = ["getMultipliers()", ...multiplierGetterAbi.map(({ name }) => `${name}()`), "sharedMultiplier()"];
  const bySelector = new Map(signatures.map((getter) => [callKey(address, toFunctionSelector(getter)), getter]));
  return calls.map((key) => bySelector.get(key) ?? key);
}

async function readFrom(contract: RecordedGetters, chainId: number, head: bigint, overrides: readonly [string, CallReply][] = []) {
  const family = await recordedDetection(chainId, contract.address);
  const { client, requests } = fakeNode({ head, calls: [...recordedCalls(contract), ...overrides] });
  return { result: await readMultipliers(client, family), called: gettersCalled(contract.address, requests.calls), family };
}

/** A mainnet contract of `multipliers-1.json`, read at the recording's block. */
function readRecorded(label: string) {
  return readFrom(byLabel(MULTIPLIER_GETTERS, label), 1, 26_190_905n);
}

function readGovernor(governor: RecordedGovernor, overrides: readonly [string, CallReply][] = []) {
  return readFrom(governor, governor.chainId, governor.blockNumber, overrides);
}

function replacing(governor: RecordedGovernor, signature: string, reply: CallReply): [string, CallReply] {
  return [callKey(governor.address, toFunctionSelector(signature)), reply];
}

const UNSUPPORTED = "This arbitrable does not expose all of its appeal multipliers.";

const getter = (functionName: (typeof multiplierGetterAbi)[number]["name"]) => ({ to: SYNTHETIC, abi: multiplierGetterAbi, functionName });

const getMultipliers = { to: SYNTHETIC, abi: idrV2Abi, functionName: "getMultipliers" } as const;

async function readSynthetic(calls: readonly [string, CallReply][]) {
  const { client, requests } = fakeNode({ head: 1n, calls });
  return { result: await readMultipliers(client, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"])), requests };
}

describe("readMultipliers", () => {
  it.each([
    ["ArbitrableProxy (idr-v2)", { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n }],
    ["Unslashed (idr-v1)", { winnerStakeMultiplier: 5_000n, loserStakeMultiplier: 10_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n }],
    ["older resolver proxy (idr-legacy)", { winnerStakeMultiplier: 5_000n, loserStakeMultiplier: 10_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n }],
  ])("reads getMultipliers() alone on the mainnet %s", async (label, value) => {
    const { result, called } = await readRecorded(label);
    expect(result).toEqual({ ok: true, value });
    expect(called).toEqual(["getMultipliers()"]);
  });

  it("reads winnerMultiplier, loserMultiplier, MULTIPLIER_DIVISOR and sharedMultiplier on every deployed governor at its recorded block, with the loser window KlerosGovernor fixes at half the appeal period, past the winnerStakeMultiplier() every governor answers with no data", async () => {
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

  it("a governor whose MULTIPLIER_DIVISOR does not answer uses KlerosGovernor's fixed 10000", async () => {
    const governor = byLabel(GOVERNOR_MULTIPLIERS, "poh.eth governor");
    const { result } = await readGovernor(governor, [replacing(governor, "MULTIPLIER_DIVISOR()", { result: "0x" })]);
    expect(result).toMatchObject({ ok: true, value: { denominator: 10_000n, loserAppealPeriodMultiplier: 5_000n } });
  });

  it.each(["winnerMultiplier()", "loserMultiplier()"])("a governor that does not answer %s has appeal amounts that cannot be calculated", async (signature) => {
    const governor = byLabel(GOVERNOR_MULTIPLIERS, "poh.eth governor");
    const { result } = await readGovernor(governor, [replacing(governor, signature, { result: "0x" })]);
    expect(result).toEqual({ ok: false, error: { code: "unsupported", message: UNSUPPORTED } });
  });

  it("keeps a governor's other multipliers, without a shared one, when its contract fails sharedMultiplier()", async () => {
    const governor = byLabel(GOVERNOR_MULTIPLIERS, "poh.eth governor");
    const { result } = await readGovernor(governor, [replacing(governor, "sharedMultiplier()", { result: "0x" })]);
    expect(result).toEqual({ ok: true, value: { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n } });
  });

  it("reports a transport error on a governor's sharedMultiplier() as rpc-error, never as an absent getter", async () => {
    const governor = byLabel(GOVERNOR_MULTIPLIERS, "poh.eth governor");
    const { result } = await readGovernor(governor, [replacing(governor, "sharedMultiplier()", { error: { code: -32000, message: "header not found" } })]);
    expect(result).toMatchObject({ ok: false, error: { code: "rpc-error" } });
  });

  it("Proof of Humanity v2, which has no denominator getter, has appeal amounts that cannot be calculated", async () => {
    const { result } = await readRecorded("Proof of Humanity v2 (view-only)");
    expect(result).toEqual({ ok: false, error: { code: "unsupported", message: UNSUPPORTED } });
  });

  it("takes each field from the first getter that answers, in order", async () => {
    const { result, requests } = await readSynthetic([
      reverting(getMultipliers),
      reverting(getter("winnerStakeMultiplier")),
      answer({ ...getter("winnerMultiplier"), result: 7n }),
      answer({ ...getter("loserStakeMultiplier"), result: 9n }),
      answer({ ...getter("loserMultiplier"), result: 99n }),
      reverting(getter("denominator")),
      reverting(getter("MULTIPLIER_DIVISOR")),
      answer({ ...getter("MULTIPLIER_DENOMINATOR"), result: 1_000n }),
      answer({ ...getter("loserAppealPeriodMultiplier"), result: 300n }),
    ]);
    expect(result).toEqual({ ok: true, value: { winnerStakeMultiplier: 7n, loserStakeMultiplier: 9n, loserAppealPeriodMultiplier: 300n, denominator: 1_000n } });
    expect(gettersCalled(SYNTHETIC, requests.calls)).not.toContain("loserMultiplier()");
  });

  it.each([
    [
      "a resolver whose getters lack the loser appeal-period multiplier has appeal amounts that cannot be calculated",
      [
        answer({ ...getter("winnerStakeMultiplier"), result: 3n }),
        answer({ ...getter("loserStakeMultiplier"), result: 4n }),
        answer({ ...getter("denominator"), result: 1_000n }),
        reverting(getter("loserAppealPeriodMultiplier")),
      ],
    ],
    [
      "a resolver whose getters lack the denominator has appeal amounts that cannot be calculated",
      [
        answer({ ...getter("winnerStakeMultiplier"), result: 3n }),
        answer({ ...getter("loserStakeMultiplier"), result: 4n }),
        reverting(getter("denominator")),
        reverting(getter("MULTIPLIER_DIVISOR")),
        reverting(getter("MULTIPLIER_DENOMINATOR")),
        answer({ ...getter("loserAppealPeriodMultiplier"), result: 500n }),
      ],
    ],
    [
      "reports a missing stake multiplier as unsupported",
      [
        ...(["winnerStakeMultiplier", "winnerMultiplier", "denominator", "MULTIPLIER_DIVISOR", "MULTIPLIER_DENOMINATOR", "loserAppealPeriodMultiplier"] as const).map((name) =>
          reverting(getter(name)),
        ),
        answer({ ...getter("loserStakeMultiplier"), result: 4n }),
      ],
    ],
  ])("%s", async (_, calls) => {
    const { result } = await readSynthetic([reverting(getMultipliers), ...calls]);
    expect(result).toEqual({ ok: false, error: { code: "unsupported", message: UNSUPPORTED } });
  });

  it("reports a transport error on getMultipliers() as rpc-error and tries no getter", async () => {
    const { result, requests } = await readSynthetic([reverting({ ...getMultipliers, error: { code: -32000, message: "header not found" } })]);
    expect(result).toMatchObject({ ok: false, error: { code: "rpc-error" } });
    expect(requests.calls).toHaveLength(1);
  });

  it("reports a transport error on a single getter as rpc-error, never as an absent getter", async () => {
    const { result } = await readSynthetic([
      reverting(getMultipliers),
      reverting({ ...getter("winnerStakeMultiplier"), error: { code: -32000, message: "header not found" } }),
      answer({ ...getter("winnerMultiplier"), result: 7n }),
      answer({ ...getter("loserStakeMultiplier"), result: 9n }),
      answer({ ...getter("denominator"), result: 10_000n }),
      answer({ ...getter("loserAppealPeriodMultiplier"), result: 5_000n }),
    ]);
    expect(result).toMatchObject({ ok: false, error: { code: "rpc-error" } });
  });

  it("reports a zero denominator as invalid data, so the amounts never divide by zero", async () => {
    const fromStruct = await readSynthetic([answer({ ...getMultipliers, result: [10_000n, 20_000n, 5_000n, 0n] })]);
    expect(fromStruct.result).toMatchObject({ ok: false, error: { code: "invalid-data" } });

    const fromGetters = await readSynthetic([
      reverting(getMultipliers),
      answer({ ...getter("winnerStakeMultiplier"), result: 1n }),
      answer({ ...getter("loserStakeMultiplier"), result: 2n }),
      answer({ ...getter("denominator"), result: 0n }),
      answer({ ...getter("loserAppealPeriodMultiplier"), result: 0n }),
    ]);
    expect(fromGetters.result).toMatchObject({ ok: false, error: { code: "invalid-data" } });
  });
});
