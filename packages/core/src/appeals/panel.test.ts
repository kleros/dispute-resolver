import { describe, expect, it } from "vitest";
import type { AppealInfo } from "../disputes/types";
import type { FamilyDetection } from "../families/types";
import type { Address, Outcome, Period } from "../types";
import { idrV2Abi, multiplierGetterAbi } from "../abi";
import { buildAppealPanel, buildCrowdfundingCards, computeAppealAmounts, hasAppealPanel, needsRulingOptions, readMultipliers } from "./index";
import type { AppealPanelInput, Multipliers, RoundFunding, WithdrawState } from "./types";
import { FAMILY_SIGNATURES, answer, detectionFor, fakeNode, recordedDetection, reverting } from "../test/appeals/testHelpers";

const ADDRESS: Address = "0x00000000000000000000000000000000000000dd";
const APPEAL_INFO: AppealInfo = { appealCost: 1_000n, appealPeriodStart: 100, appealPeriodEnd: 300 };
const MULTIPLIERS: Multipliers = { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n };
const FUNDING: RoundFunding = { round: 0n, contributions: [{ ruling: 1n, amount: 500n }], fundedRulings: [] };
const WITHDRAW: WithdrawState = {
  status: "available",
  beneficiary: "0x00000000000000000000000000000000000000a1",
  total: 5n,
  items: [{ dialect: "idr-v2", ruling: 1n, amount: 5n }],
};
const RPC_DOWN = { code: "rpc-error", message: "Could not read: down" } as const;

function ok<T>(value: T): Outcome<T> {
  return { ok: true, value };
}

function input(family: FamilyDetection, period: Period, overrides: Partial<AppealPanelInput> = {}): AppealPanelInput {
  return {
    family,
    period,
    override: undefined,
    rulingOptions: { type: "single-select", titles: ["Yes", "No"] },
    fallbackOutcomes: null,
    currentRuling: ok(1n),
    appealInfo: ok(APPEAL_INFO),
    multipliers: ok(MULTIPLIERS),
    funding: ok(FUNDING),
    withdraw: period === 4 ? WITHDRAW : null,
    ...overrides,
  };
}

const family = (signatures: keyof typeof FAMILY_SIGNATURES) => detectionFor(ADDRESS, FAMILY_SIGNATURES[signatures]);
const realityProxy = (writeFamily: FamilyDetection): FamilyDetection => ({ ...writeFamily, family: "reality-proxy" });

const EXPECTED_CARDS = buildCrowdfundingCards({
  rulingOptions: { type: "single-select", titles: ["Yes", "No"] },
  fallbackOutcomes: null,
  currentRuling: 1n,
  amounts: computeAppealAmounts(APPEAL_INFO, MULTIPLIERS),
  funding: FUNDING,
  override: undefined,
});

/** A governor funds list `ruling − 1`, so it has the same cards without the ruling-0 refuse card. */
const EXPECTED_GOVERNOR_CARDS = { ...EXPECTED_CARDS, cards: EXPECTED_CARDS.cards.filter((card) => card.code !== 0n) };

describe("hasAppealPanel", () => {
  it("has an appeal panel from the appeal period for every family except a view-only arbitrable in execution", () => {
    const periodsWithPanel: Readonly<Record<keyof typeof FAMILY_SIGNATURES, readonly Period[]>> = {
      "idr-v2": [3, 4],
      "idr-v1": [3, 4],
      "idr-legacy": [3, 4],
      "escrow-v1": [3, 4],
      governor: [3, 4],
      "view-only": [3],
    };
    for (const [name, withPanel] of Object.entries(periodsWithPanel) as [keyof typeof FAMILY_SIGNATURES, readonly Period[]][]) {
      for (const detection of [family(name), realityProxy(family(name))]) {
        for (const period of [0, 1, 2, 3, 4] as const) {
          const expected = withPanel.includes(period);
          expect(hasAppealPanel(period, detection), `${detection.family} as ${name} in period ${String(period)}`).toBe(expected);
          expect(buildAppealPanel(input(detection, period)).kind === "hidden", `${detection.family} as ${name} in period ${String(period)}`).toBe(!expected);
        }
      }
    }
  });
});

describe("needsRulingOptions", () => {
  it("needs the ruling options only for a crowdfunded appeal in the appeal period", () => {
    const crowdfunded: readonly (keyof typeof FAMILY_SIGNATURES)[] = ["idr-v2", "idr-v1", "idr-legacy", "governor"];
    for (const name of Object.keys(FAMILY_SIGNATURES) as (keyof typeof FAMILY_SIGNATURES)[]) {
      for (const detection of [family(name), realityProxy(family(name))]) {
        for (const period of [0, 1, 2, 3, 4] as const) {
          const expected = period === 3 && crowdfunded.includes(name);
          expect(needsRulingOptions(period, detection), `${detection.family} as ${name} in period ${String(period)}`).toBe(expected);
        }
      }
    }
  });

  it("builds the same panel whatever the ruling options when they are not needed", () => {
    for (const name of Object.keys(FAMILY_SIGNATURES) as (keyof typeof FAMILY_SIGNATURES)[]) {
      for (const period of [0, 1, 2, 3, 4] as const) {
        if (needsRulingOptions(period, family(name))) continue;
        const withOptions = buildAppealPanel(input(family(name), period));
        const withoutOptions = buildAppealPanel(input(family(name), period, { rulingOptions: { type: "single-select" }, fallbackOutcomes: null }));
        expect(withoutOptions, `${name} in period ${String(period)}`).toEqual(withOptions);
      }
    }
  });
});

describe("buildAppealPanel", () => {
  it("crowdfunds idr-v2 and idr-v1 in the appeal period and withdraws in execution", () => {
    for (const name of ["idr-v2", "idr-v1"] as const) {
      expect(buildAppealPanel(input(family(name), 3))).toEqual({ kind: "crowdfunding", dialect: "idr", ...EXPECTED_CARDS });
      expect(buildAppealPanel(input(family(name), 4))).toEqual({ kind: "withdraw", state: WITHDRAW });
    }
  });

  it("follows a registered Reality proxy's write family, never its display family", async () => {
    expect(buildAppealPanel(input(realityProxy(family("idr-v2")), 3))).toEqual({ kind: "crowdfunding", dialect: "idr", ...EXPECTED_CARDS });
    expect(buildAppealPanel(input(realityProxy(family("idr-v2")), 4))).toEqual({ kind: "withdraw", state: WITHDRAW });
    const golden150 = await recordedDetection(1, "0x594ec762b59978c97c82bc36ab493ed8b1f1f368");
    expect([golden150.family, golden150.writeFamily]).toEqual(["reality-proxy", "view-only"]);
    expect(buildAppealPanel(input(golden150, 3))).toEqual({ kind: "handled-by-arbitrable" });
    expect(buildAppealPanel(input(golden150, 4))).toEqual({ kind: "hidden" });
  });

  it("crowdfunds idr-legacy in the appeal period and says withdrawals are unsupported in execution", () => {
    expect(buildAppealPanel(input(family("idr-legacy"), 3))).toEqual({ kind: "crowdfunding", dialect: "idr", ...EXPECTED_CARDS });
    expect(buildAppealPanel(input(family("idr-legacy"), 4, { withdraw: null }))).toEqual({ kind: "withdraw-unsupported" });
  });

  it("appeals Escrow V1 by paying the appeal cost, due at the end of the appeal period, and shows it ended in execution", () => {
    expect(buildAppealPanel(input(family("escrow-v1"), 3, { multipliers: null, funding: null }))).toEqual({ kind: "escrow-appeal", appealCost: 1_000n, deadline: 300 });
    expect(buildAppealPanel(input(family("escrow-v1"), 4, { withdraw: null }))).toEqual({ kind: "escrow-ended" });
  });

  it("shows the fees as unavailable for Escrow V1 without the appeal cost", () => {
    expect(buildAppealPanel(input(family("escrow-v1"), 3, { appealInfo: { ok: false, error: RPC_DOWN } }))).toEqual({ kind: "fees-unavailable", error: RPC_DOWN });
  });

  it("crowdfunds and withdraws governors through their own dialect, kleros.eth included", async () => {
    for (const address of ["0x327a29fce0a6490e4236240be176daa282eccfdf", "0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4"]) {
      const governor = await recordedDetection(1, address);
      expect(governor.writeFamily).toBe("governor");
      expect(buildAppealPanel(input(governor, 3))).toEqual({ kind: "crowdfunding", dialect: "governor", ...EXPECTED_GOVERNOR_CARDS });
      expect(buildAppealPanel(input(governor, 4))).toEqual({ kind: "withdraw", state: WITHDRAW });
    }
  });

  it("offers no ruling-0 card on a governor panel; every card funds one of the governor's lists", async () => {
    const governor = await recordedDetection(1, "0x327a29fce0a6490e4236240be176daa282eccfdf");
    const titles = ["List 7", "List 8"];
    for (const currentRuling of [2n, 0n]) {
      const panel = buildAppealPanel(input(governor, 3, { rulingOptions: { type: "single-select", titles }, currentRuling: ok(currentRuling) }));
      if (panel.kind !== "crowdfunding") throw new Error(`expected crowdfunding, got ${panel.kind}`);
      expect(panel.cards.map((card) => card.code)).toEqual([1n, 2n]);
      for (const card of panel.cards) {
        const listIndex = card.code - 1n;
        expect(listIndex >= 0n && listIndex < BigInt(titles.length)).toBe(true);
      }
    }
  });

  it("costs every list of a governor tie with the shared multiplier until the end of the appeal period", async () => {
    // Cost 1,000 over [100, 300]: the loser rule would ask 3,000 by 200 and show 2,000 as 66.66%.
    const governor = await recordedDetection(1, "0x327a29fce0a6490e4236240be176daa282eccfdf");
    const panel = buildAppealPanel(
      input(governor, 3, {
        rulingOptions: { type: "single-select", titles: ["List 1", "List 2"] },
        currentRuling: ok(0n),
        multipliers: ok({ ...MULTIPLIERS, sharedMultiplier: 10_000n }),
        funding: ok({ round: 0n, contributions: [{ ruling: 1n, amount: 2_000n }], fundedRulings: [1n] }),
      }),
    );
    if (panel.kind !== "crowdfunding") throw new Error(`expected crowdfunding, got ${panel.kind}`);
    expect(panel.cards.map(({ code, required, remaining, fundedPercent, deadline }) => ({ code, required, remaining, fundedPercent, deadline }))).toEqual([
      { code: 1n, required: 2_000n, remaining: 0n, fundedPercent: 100, deadline: 300 },
      { code: 2n, required: 2_000n, remaining: 2_000n, fundedPercent: 0, deadline: 300 },
    ]);
  });

  it("applies the shared multiplier only to a governor tie: a governor ruling and an idr tie keep the winner and loser sides", async () => {
    const governor = await recordedDetection(1, "0x327a29fce0a6490e4236240be176daa282eccfdf");
    const shared = { multipliers: ok({ ...MULTIPLIERS, sharedMultiplier: 10_000n }) };
    const required = (panel: ReturnType<typeof buildAppealPanel>) => (panel.kind === "crowdfunding" ? panel.cards.map((card) => [card.code, card.required, card.deadline]) : []);
    expect(required(buildAppealPanel(input(governor, 3, { ...shared, currentRuling: ok(2n) })))).toEqual([
      [1n, 3_000n, 200],
      [2n, 2_000n, 300],
    ]);
    expect(required(buildAppealPanel(input(family("idr-v2"), 3, { ...shared, currentRuling: ok(0n) })))).toEqual([
      [0n, 2_000n, 300],
      [1n, 3_000n, 200],
      [2n, 3_000n, 200],
    ]);
  });

  it("shows view-only disputes the arbitrable-application note in the appeal period and no panel in execution", () => {
    expect(buildAppealPanel(input(family("view-only"), 3))).toEqual({ kind: "handled-by-arbitrable" });
    expect(buildAppealPanel(input(family("view-only"), 4))).toEqual({ kind: "hidden" });
  });

  it("crowdfunds only with the appeal info, multipliers, funding and current ruling, otherwise shows the first error", () => {
    const failed = (code: "rpc-error" | "unsupported" | "reverted" | "not-found", message: string) => ({ ok: false as const, error: { code, message } });
    const idr = family("idr-v2");
    expect(buildAppealPanel(input(idr, 3, { multipliers: failed("unsupported", "no multipliers") }))).toEqual({
      kind: "fees-unavailable",
      error: { code: "unsupported", message: "no multipliers" },
    });
    expect(buildAppealPanel(input(idr, 3, { funding: failed("rpc-error", "scan failed") }))).toEqual({
      kind: "fees-unavailable",
      error: { code: "rpc-error", message: "scan failed" },
    });
    expect(buildAppealPanel(input(idr, 3, { currentRuling: failed("reverted", "no ruling") }))).toEqual({
      kind: "fees-unavailable",
      error: { code: "reverted", message: "no ruling" },
    });
    expect(
      buildAppealPanel(
        input(idr, 3, {
          appealInfo: failed("rpc-error", "first"),
          multipliers: failed("unsupported", "second"),
          funding: failed("rpc-error", "third"),
          currentRuling: failed("reverted", "fourth"),
        }),
      ),
    ).toEqual({ kind: "fees-unavailable", error: { code: "rpc-error", message: "first" } });
  });

  it("an arbitrable missing a multiplier getter shows that its appeal fees could not be calculated, with the reason and no cards", async () => {
    const getter = (functionName: (typeof multiplierGetterAbi)[number]["name"]) => ({ to: ADDRESS, abi: multiplierGetterAbi, functionName });
    const { client } = fakeNode({
      head: 1n,
      calls: [
        reverting({ to: ADDRESS, abi: idrV2Abi, functionName: "getMultipliers" }),
        answer({ ...getter("winnerStakeMultiplier"), result: 10_000n }),
        answer({ ...getter("loserStakeMultiplier"), result: 20_000n }),
        answer({ ...getter("denominator"), result: 10_000n }),
        reverting(getter("loserAppealPeriodMultiplier")),
      ],
    });
    const idr = family("idr-v2");
    const panel = buildAppealPanel(input(idr, 3, { multipliers: await readMultipliers(client, idr) }));
    expect(panel).toEqual({
      kind: "fees-unavailable",
      error: { code: "unsupported", message: "This arbitrable does not expose all of its appeal multipliers." },
    });
  });

  it("shows the fees as unavailable, never as zero, for a read not made in the appeal period", () => {
    for (const missing of ["appealInfo", "multipliers", "funding"] as const) {
      const panel = buildAppealPanel(input(family("idr-v2"), 3, { [missing]: null }));
      expect(panel).toMatchObject({ kind: "fees-unavailable", error: { code: "not-found" } });
    }
  });

  it("reports an execution-period withdraw state that was not read as unavailable", () => {
    expect(buildAppealPanel(input(family("idr-v2"), 4, { withdraw: null }))).toMatchObject({ kind: "withdraw", state: { status: "unavailable", error: { code: "not-found" } } });
  });

  it("never carries the withdraw state or its text in the appeal period", () => {
    for (const name of Object.keys(FAMILY_SIGNATURES) as (keyof typeof FAMILY_SIGNATURES)[]) {
      const panel = buildAppealPanel(input(family(name), 3, { withdraw: WITHDRAW }));
      expect(["withdraw", "withdraw-unsupported"]).not.toContain(panel.kind);
    }
  });

  it("carries the multiple-select composer inside the crowdfunding panel", () => {
    const panel = buildAppealPanel(input(family("idr-v2"), 3, { rulingOptions: { type: "multiple-select", titles: ["A", "B", "C", "D", "E"] } }));
    expect(panel).toMatchObject({ kind: "crowdfunding", composer: { titles: ["A", "B", "C", "D", "E"], required: 3_000n, deadline: 200 } });
  });

  it("carries the variable-type free input inside the crowdfunding panel", () => {
    const panel = buildAppealPanel(input(family("idr-v2"), 3, { rulingOptions: { type: "uint" } }));
    expect(panel).toMatchObject({ kind: "crowdfunding", freeInput: { type: "uint", required: 3_000n, deadline: 200 } });
  });
});
