import {
  REGISTRY,
  describeAppealRules,
  type AppealInfo,
  type AppealPanel,
  type DisputeReads,
  type ExecutedRuling,
  type FamilyDetection,
  type MetaEvidenceResult,
  type Multipliers,
  type Period,
  type RoundFunding,
  type Unavailable,
  type WithdrawState,
} from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { sectionLoading, sectionReady, sectionUnavailable, testCourt, testDetails, testFamily, testFoundLookup, testOkMetaEvidence } from "../test/data";
import { assembleAppeal, assembleDecision, assembleView, type FoundCaseReads } from "./caseAssembly";
import type { SectionData } from "./types";

const APPEAL_INFO: AppealInfo = { appealCost: 1_000n, appealPeriodStart: 1_700_000_000, appealPeriodEnd: 4_000_000_000 };
const MULTIPLIERS: Multipliers = { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n };
const ESCROW_V1 = testFamily({
  family: "escrow-v1",
  writeFamily: "escrow-v1",
  capabilities: { localId: "disputeIDtoTransactionID", evidence: { kind: "local-id" }, appeal: { kind: "escrow-pay-cost" }, withdraw: { kind: "none" } },
});
const IDR_V1 = testFamily({
  family: "idr-v1",
  writeFamily: "idr-v1",
  capabilities: {
    localId: "externalIDtoLocalID",
    evidence: { kind: "local-id" },
    appeal: { kind: "idr" },
    withdraw: { kind: "idr-v1" },
  },
});
const VIEW_ONLY = testFamily({
  family: "view-only",
  writeFamily: "view-only",
  capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "none" }, withdraw: { kind: "none" } },
});
const WITHDRAW: WithdrawState = {
  status: "available",
  beneficiary: "0x00000000000000000000000000000000000000a1",
  total: 5n,
  items: [{ dialect: "idr-v1", ruling: 1n, amount: 5n }],
};
const IPFS_DOWN: Unavailable = { code: "rpc-error", message: "The meta-evidence file could not be fetched." };

interface ReadsOptions {
  readonly details?: Partial<DisputeReads>;
  readonly ruled?: boolean;
  readonly funding?: SectionData<RoundFunding> | null;
  readonly executed?: SectionData<ExecutedRuling> | null;
  readonly productFunding?: SectionData<readonly bigint[]> | null;
  readonly productRecognised?: SectionData<boolean> | null;
}

function notExecuted(period: Period): SectionData<ExecutedRuling> | null {
  return period === 4 ? sectionReady({ status: "not-executed" }) : null;
}

function readsWith(family: FamilyDetection, period: Period, metaEvidence: FoundCaseReads["metaEvidence"], options: ReadsOptions = {}): FoundCaseReads {
  const lookup = testFoundLookup({ period, ruled: options.ruled ?? false });
  const noFunding = period >= 3 ? sectionReady({ round: 0n, contributions: [], fundedRulings: [] }) : null;
  return {
    lookup,
    family: sectionReady(family),
    rules: describeAppealRules(REGISTRY, family),
    metaEvidence,
    courts: sectionReady([testCourt()]),
    details: sectionReady(testDetails(lookup, { appealInfo: { ok: true, value: APPEAL_INFO }, ...options.details })),
    appeal: {
      multipliers: period === 3 ? sectionReady(MULTIPLIERS) : null,
      funding: options.funding === undefined ? noFunding : options.funding,
      withdraw: period === 4 ? sectionReady(WITHDRAW) : null,
    },
    executed: options.executed === undefined ? notExecuted(period) : options.executed,
    productFunding: options.productFunding ?? null,
    productRecognised: options.productRecognised ?? null,
    override: undefined,
    readClient: undefined,
  };
}

const MISSING: MetaEvidenceResult = { status: "missing" };
const FAILED: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: IPFS_DOWN };

const ESCROW_APPEAL = { status: "ready", value: { kind: "escrow-appeal", appealCost: APPEAL_INFO.appealCost, deadline: APPEAL_INFO.appealPeriodEnd } };

describe("case assembly", () => {
  it("a period-3 dispute whose current-ruling read failed shows its decision as unavailable and its appeal fees as not calculable, with the read's reason", () => {
    const failed: Unavailable = { code: "rpc-error", message: "Could not read the current ruling: the RPC did not answer." };
    const reads = readsWith(testFamily(), 3, sectionReady(testOkMetaEvidence()), { details: { currentRuling: { ok: false, error: failed } } });
    expect(assembleDecision(reads)).toEqual({ status: "unavailable", error: failed });
    expect(assembleView(reads)).toMatchObject({ status: "ready", value: { exists: true, period: 3 } });
    expect(assembleAppeal(reads).appealPanel).toEqual({ status: "ready", value: { kind: "fees-unavailable", error: failed } });
  });

  it("the dispute view no longer waits for the funding scan", () => {
    const reads = readsWith(testFamily(), 4, sectionReady(testOkMetaEvidence()), { funding: sectionLoading, executed: sectionLoading });
    expect(assembleView(reads)).toMatchObject({ status: "ready", value: { exists: true, period: 4 } });
  });

  it("a dispute before the appeal period has no decision and waits for nothing", () => {
    const reads = readsWith(testFamily(), 2, sectionLoading, { details: {} });
    expect(assembleDecision({ ...reads, details: sectionLoading })).toEqual({ status: "ready", value: { kind: "none" } });
  });

  it("the appeal-period decision says how the dispute's own contract is appealed", () => {
    expect(assembleDecision(readsWith(VIEW_ONLY, 3, sectionReady(testOkMetaEvidence())))).toMatchObject({
      status: "ready",
      value: { kind: "jury-decision", note: "appealable-in-arbitrable", court: { ruling: 1n, rulingText: "Yes" } },
    });
  });

  const funded = (rulings: readonly bigint[]): SectionData<RoundFunding> => sectionReady({ round: 0n, contributions: [], fundedRulings: rulings });
  const applied = (ruling: bigint): SectionData<ExecutedRuling> => sectionReady({ status: "executed", ruling });
  const noReport: SectionData<ExecutedRuling> = sectionReady({ status: "none-reported" });
  it.each([
    ["the arbitrable applied the court's ruling", VIEW_ONLY, { executed: applied(1n), productFunding: sectionLoading }, { kind: "winner", wonBy: "jury", winner: { ruling: 1n } }],
    ["its own funding record is still read", VIEW_ONLY, { executed: applied(2n), productFunding: sectionLoading }, null],
    [
      "its own funding record shows the applied ruling alone",
      VIEW_ONLY,
      { executed: applied(2n), productFunding: sectionReady([2n]) },
      { kind: "winner", wonBy: "default", winner: { ruling: 2n, rulingText: "No" } },
    ],
    [
      "its own funding record could not be read",
      VIEW_ONLY,
      { executed: applied(2n), productFunding: sectionUnavailable("not-found", "No proof.") },
      { kind: "winner", wonBy: "applied", winner: { ruling: 2n } },
    ],
    ["the round's funding is still read", testFamily(), { executed: noReport, funding: sectionLoading }, null],
    ["the round's funding shows another ruling alone", testFamily(), { executed: noReport, funding: funded([2n]) }, { kind: "winner", wonBy: "default", winner: { ruling: 2n } }],
  ] as const)("an executed decision when %s", (_case, family, options: ReadsOptions, decision) => {
    const reads = readsWith(family, 4, sectionReady(testOkMetaEvidence()), { ruled: true, ...options });
    expect(assembleDecision(reads)).toMatchObject(decision === null ? { status: "loading" } : { status: "ready", value: decision });
  });

  it("in execution the decision waits for the executed ruling", () => {
    const reads = readsWith(VIEW_ONLY, 4, sectionReady(testOkMetaEvidence()), { ruled: true, funding: null, executed: sectionLoading });
    expect(assembleDecision(reads)).toEqual({ status: "loading" });
  });

  it("an executed ruling that could not be read, without funding that proves another ruling, leaves the court's ruling the winner", () => {
    const error: Unavailable = { code: "rpc-error", message: "Could not read the executed ruling: the RPC did not answer." };
    const reads = readsWith(VIEW_ONLY, 4, sectionReady(testOkMetaEvidence()), { ruled: true, funding: null, executed: sectionUnavailable(error.code, error.message) });
    expect(assembleDecision(reads)).toMatchObject({ status: "ready", value: { kind: "winner", wonBy: "jury", winner: { ruling: 1n } } });
  });

  it("a failed details read degrades the decision with its own reason", () => {
    const reads = readsWith(testFamily(), 3, sectionReady(testOkMetaEvidence()));
    expect(assembleDecision({ ...reads, details: sectionUnavailable("rpc-error", "The dispute could not be read.") })).toEqual({
      status: "unavailable",
      error: { code: "rpc-error", message: "The dispute could not be read." },
    });
  });

  it("an unknown family still shows the jury's decision, without the contract's appeal rules", () => {
    const reads = readsWith(testFamily(), 3, sectionReady(testOkMetaEvidence()));
    const decision = assembleDecision({ ...reads, family: sectionUnavailable("rpc-error", "eth_getCode failed"), rules: null });
    expect(decision).toMatchObject({ status: "ready", value: { kind: "jury-decision", note: "appealable-in-arbitrable" } });
  });

  it.each<[string, FamilyDetection, Period, FoundCaseReads["metaEvidence"], unknown]>([
    ["an Escrow V1 dispute in the appeal period offers its appeal even without meta-evidence", ESCROW_V1, 3, sectionReady(MISSING), ESCROW_APPEAL],
    ["an Escrow V1 dispute in the appeal period does not wait for its meta-evidence", ESCROW_V1, 3, sectionLoading, ESCROW_APPEAL],
    [
      "an IDisputeResolver v1 dispute in execution offers its withdrawal even when its meta-evidence failed to load",
      IDR_V1,
      4,
      sectionReady(FAILED),
      { status: "ready", value: { kind: "withdraw", state: WITHDRAW, noun: "answer" } },
    ],
    [
      "an arbitrable that handles its own appeals says so even when its meta-evidence failed to load",
      VIEW_ONLY,
      3,
      sectionReady(FAILED),
      { status: "ready", value: { kind: "handled-by-arbitrable" } },
    ],
    [
      "an IDisputeResolver v1 dispute in the appeal period without meta-evidence has no appeal cards, because its answers are unknown",
      IDR_V1,
      3,
      sectionReady(MISSING),
      { status: "unavailable", error: { code: "not-found", message: "This dispute has no meta-evidence, so its answers are unknown." } },
    ],
    ["an IDisputeResolver v1 dispute in the appeal period waits for its meta-evidence before showing appeal cards", IDR_V1, 3, sectionLoading, { status: "loading" }],
  ])("%s", (_name, family, period, metaEvidence, expected) => {
    expect(assembleAppeal(readsWith(family, period, metaEvidence)).appealPanel).toEqual(expected);
  });

  it("a governor dispute in the appeal period without meta-evidence says its lists are unknown", () => {
    const governor: FamilyDetection = { ...IDR_V1, family: "governor", writeFamily: "governor" };
    expect(assembleAppeal(readsWith(governor, 3, sectionReady(MISSING))).appealPanel).toEqual({
      status: "unavailable",
      error: { code: "not-found", message: "This dispute has no meta-evidence, so its lists are unknown." },
    });
  });

  it.each<[string, SectionData<boolean>, unknown]>([
    [
      "gives the appeal times of a product it recognised",
      sectionReady(true),
      { kind: "handled-by-arbitrable", terms: { noun: "answer", tie: null, appealPeriodEnd: 4_000_000_000, loserDeadline: 2_850_000_000 } },
    ],
    ["gives no times for an arbitrable it did not recognise", sectionReady(false), { kind: "handled-by-arbitrable" }],
    ["gives no times when the arbitrable could not be checked", sectionUnavailable("no-rpc", "No read RPC."), { kind: "handled-by-arbitrable" }],
  ])("a view-only dispute in the appeal period %s", (_name, productRecognised, panel) => {
    expect(assembleAppeal(readsWith(VIEW_ONLY, 3, sectionReady(testOkMetaEvidence()), { productRecognised })).appealPanel).toEqual({ status: "ready", value: panel });
  });

  it("gives no appeal card to a reserved answer above the dispute's number of choices, which jurors cannot vote", () => {
    const rulingOptions = { type: "single-select", titles: ["Yes", "No"], reserved: { "0x3": "Withdrawn" } } as const;
    const panel = assembleAppeal(readsWith(testFamily(), 3, sectionReady(testOkMetaEvidence({ rulingOptions })))).appealPanel;
    if (panel.status !== "ready" || panel.value.kind !== "crowdfunding") throw new Error("The dispute has no appeal cards.");
    expect(panel.value.cards.map((card) => card.code)).toEqual([0n, 1n, 2n]);
    expect(panel.value.cards.map((card) => card.title)).not.toContain("Withdrawn");
  });

  describe("a governor dispute whose dynamic script the gateway did not serve", () => {
    const GOVERNOR = testFamily({
      family: "governor",
      writeFamily: "governor",
      capabilities: { localId: "none", evidence: { kind: "uri-only" }, appeal: { kind: "governor" }, withdraw: { kind: "governor" } },
    });
    const IDR_V2 = testFamily();
    const UNTITLED = { type: "single-select" } as const;
    const LISTS = { type: "single-select", titles: ["List 17", "List 18"] } as const;
    const scriptNotServed = (overrides: Parameters<typeof testOkMetaEvidence>[0]): MetaEvidenceResult => ({
      ...testOkMetaEvidence(overrides),
      script: { ran: false, reason: "script-fetch-failed" },
    });
    const scriptRan = (overrides: Parameters<typeof testOkMetaEvidence>[0]): MetaEvidenceResult => ({
      ...testOkMetaEvidence(overrides),
      script: { ran: true, kind: "standard", jsonDuplicateKeys: false },
    });
    const withScript = (script: Extract<MetaEvidenceResult, { status: "ok" }>["script"]): MetaEvidenceResult => ({ ...testOkMetaEvidence({ rulingOptions: UNTITLED }), script });
    const PLACEHOLDER: MetaEvidenceResult = {
      status: "invalid",
      metaEvidence: testOkMetaEvidence({ rulingOptions: { type: "single-select", titles: [] } }).metaEvidence,
      reason: "script-not-allowlisted",
    };
    const GATEWAY_FAILED: Unavailable = { code: "rpc-error", message: "The meta-evidence or its dynamic script could not be fetched from the IPFS gateway." };
    const cardTitles = (panel: SectionData<AppealPanel>) => (panel.status === "ready" && panel.value.kind === "crowdfunding" ? panel.value.cards.map((card) => card.title) : panel);

    it.each([
      ["names no lists", UNTITLED],
      ["has no ruling options", null],
    ] as const)("holds the appeal cards in the appeal period when its meta-evidence %s, saying the gateway failed", (_name, rulingOptions) => {
      expect(assembleAppeal(readsWith(GOVERNOR, 3, sectionReady(scriptNotServed({ rulingOptions })))).appealPanel).toEqual({
        status: "unavailable",
        error: GATEWAY_FAILED,
      });
    });

    it.each<[string, FamilyDetection, MetaEvidenceResult, unknown]>([
      ["a governor whose script ran keeps the lists it titled", GOVERNOR, scriptRan({ rulingOptions: LISTS }), ["List 17", "List 18"]],
      ["a governor whose meta-evidence titles its own lists keeps them", GOVERNOR, scriptNotServed({ rulingOptions: LISTS }), ["List 17", "List 18"]],
      [
        "a governor whose meta-evidence has fallback outcomes keeps them",
        GOVERNOR,
        scriptNotServed({ rulingOptions: UNTITLED, fallbackOutcomes: ["First list", "Second list"] }),
        ["First list", "Second list"],
      ],
      ["a governor with the tampered-data placeholder keeps the card of its current ruling", GOVERNOR, PLACEHOLDER, ["1"]],
      ["a governor without a dynamic script keeps its Yes and No cards", GOVERNOR, withScript({ ran: false, reason: "no-script" }), ["Yes", "No"]],
      ["a governor whose script names a chain it cannot read keeps its Yes and No cards", GOVERNOR, withScript({ ran: false, reason: "script-chain-unavailable" }), ["Yes", "No"]],
      ["a governor whose script ran without titles keeps its Yes and No cards", GOVERNOR, withScript({ ran: true, kind: "standard", jsonDuplicateKeys: false }), ["Yes", "No"]],
      ["an IDisputeResolver v1 dispute keeps its Yes and No cards", IDR_V1, scriptNotServed({ rulingOptions: UNTITLED }), ["Invalid / Refused to Arbitrate / Tied", "Yes", "No"]],
      ["an IDisputeResolver v2 dispute keeps its Yes and No cards", IDR_V2, scriptNotServed({ rulingOptions: UNTITLED }), ["Invalid / Refused to Arbitrate / Tied", "Yes", "No"]],
    ])("%s", (_name, family, metaEvidence, titles) => {
      expect(cardTitles(assembleAppeal(readsWith(family, 3, sectionReady(metaEvidence))).appealPanel)).toEqual(titles);
    });

    it("holds the appeal cards with the gateway's failure while the funding scan is still running", () => {
      const { appealPanel, appealHold } = assembleAppeal(readsWith(GOVERNOR, 3, sectionReady(scriptNotServed({ rulingOptions: UNTITLED })), { funding: sectionLoading }));
      expect(appealPanel).toEqual({ status: "unavailable", error: GATEWAY_FAILED });
      expect(appealHold).toEqual({ losingSide: null });
    });

    it("keeps the losing side's funding time of the held cards", () => {
      const reads = readsWith(GOVERNOR, 3, sectionReady(scriptNotServed({ rulingOptions: UNTITLED })));
      expect(assembleAppeal(reads).appealHold).toEqual({ losingSide: { kind: "deadline", at: 2_850_000_000 } });
    });

    it("keeps no losing side's funding time for held cards after a tie, where every list has the full period", () => {
      const reads = readsWith(GOVERNOR, 3, sectionReady(scriptNotServed({ rulingOptions: UNTITLED })), { details: { currentRuling: { ok: true, value: 0n } } });
      const shared = { ...reads, appeal: { ...reads.appeal, multipliers: sectionReady({ ...MULTIPLIERS, sharedMultiplier: 10_000n }) } };
      const { appealPanel, appealHold } = assembleAppeal(shared);
      expect(appealPanel).toMatchObject({ status: "unavailable" });
      expect(appealHold).toEqual({ losingSide: null });
    });

    it("waits for a governor's details before holding its cards", () => {
      const reads = readsWith(GOVERNOR, 3, sectionReady(scriptNotServed({ rulingOptions: UNTITLED })));
      expect(assembleAppeal({ ...reads, details: sectionLoading }).appealPanel).toEqual({ status: "loading" });
    });

    it("keeps loading a governor's withdrawal in execution instead of holding it", () => {
      const reads = readsWith(GOVERNOR, 4, sectionReady(scriptNotServed({ rulingOptions: UNTITLED })));
      const pending = { ...reads, appeal: { ...reads.appeal, withdraw: sectionLoading } };
      const { appealPanel, appealHold } = assembleAppeal(pending);
      expect(appealPanel).toEqual({ status: "loading" });
      expect(appealHold).toBeNull();
    });

    it("keeps the fees notice of a governor whose multipliers could not be read", () => {
      const reads = readsWith(GOVERNOR, 3, sectionReady(scriptNotServed({ rulingOptions: UNTITLED })));
      const failed = { ...reads, appeal: { ...reads.appeal, multipliers: sectionUnavailable("rpc-error", "The multipliers could not be read.") } };
      expect(assembleAppeal(failed).appealPanel).toEqual({
        status: "ready",
        value: { kind: "fees-unavailable", error: { code: "rpc-error", message: "The multipliers could not be read." } },
      });
    });

    it("keeps the reason of a governor whose details could not be read", () => {
      const reads = readsWith(GOVERNOR, 3, sectionReady(scriptNotServed({ rulingOptions: UNTITLED })));
      expect(assembleAppeal({ ...reads, details: sectionUnavailable("rpc-error", "The dispute could not be read.") }).appealPanel).toEqual({
        status: "unavailable",
        error: { code: "rpc-error", message: "The dispute could not be read." },
      });
    });
  });

  it("holds a view-only dispute's appeal notice while its arbitrable is checked, so no line appears after it", () => {
    expect(assembleAppeal(readsWith(VIEW_ONLY, 3, sectionReady(testOkMetaEvidence()), { productRecognised: sectionLoading })).appealPanel).toEqual({ status: "loading" });
  });
});
