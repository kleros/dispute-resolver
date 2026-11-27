import * as core from "@dispute-resolver/core";
import type { Address, DisputeEventResult, EvidenceList, FetchResponse, Fetcher, MetaEvidenceEventResult, MetaEvidenceResult, Outcome, RoundFunding } from "@dispute-resolver/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCase } from "../../data";
import {
  TEST_META_EVIDENCE_URI,
  createTestDeps,
  deferred,
  testCourt,
  testDetails,
  testDisputeEvent,
  testEvidenceList,
  testFamily,
  testFoundLookup,
  testOkMetaEvidence,
} from "../../test/data";
import { testPageChain } from "../../test/routing";
import { renderWithProviders } from "../../test/shell";
import { TEST_SENT, TEST_WALLET_ADDRESS, createConnectedTestWallet, fakeWriteController, type FakeWriteController } from "../../test/wallet";
import { DisputeTimeline } from "../case-summary";
import { AppealSection } from "./AppealSection";
import { FEES_UNAVAILABLE_TITLE, withdrawNothing } from "./copy";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const actualCore = await vi.importActual<typeof core>("@dispute-resolver/core");

const writes = vi.hoisted((): { fake: FakeWriteController | null } => ({ fake: null }));

vi.mock("../../wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../wallet")>();
  return {
    ...actual,
    useWrite: () => (writes.fake ?? actual).useWrite(),
    useWriteSequence: () => (writes.fake ?? actual).useWriteSequence(),
  };
});

const ETH = 10n ** 18n;
/** The connected test wallet, as the case page reads the withdrawable amount for the wallet's account. */
const ACCOUNT: Address = TEST_WALLET_ADDRESS;
const EVIDENCE = testEvidenceList();
const FOUND_EVENT: Outcome<DisputeEventResult> = { ok: true, value: testDisputeEvent() };
const NO_FUNDING: Outcome<RoundFunding> = { ok: true, value: { round: 0n, contributions: [], fundedRulings: [] } };
const RPC_DOWN = { code: "rpc-error", message: "The RPC did not answer." } as const;
const GOVERNOR = testFamily({
  family: "governor",
  writeFamily: "governor",
  capabilities: { localId: "none", evidence: { kind: "uri-only" }, appeal: { kind: "governor" }, withdraw: { kind: "governor" } },
});

const ESCROW = testFamily({
  family: "escrow-v1",
  writeFamily: "escrow-v1",
  capabilities: { localId: "disputeIDtoTransactionID", evidence: { kind: "local-id" }, appeal: { kind: "escrow-pay-cost" }, withdraw: { kind: "none" } },
});
const FAILED_META_EVIDENCE: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "The meta-evidence file could not be fetched." } };

/** The reads of an IDisputeResolver v2 dispute in `period`: ruling 1 leads, winner side 2 ETH, loser side 3 ETH. */
function programReads(period: 3 | 4): void {
  vi.mocked(core.lookupDispute).mockResolvedValue(testFoundLookup({ period }));
  vi.mocked(core.detectFamily).mockResolvedValue(testFamily());
  vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence());
  vi.mocked(core.readDisputeEvent).mockResolvedValue(FOUND_EVENT);
  vi.mocked(core.loadEvidence).mockResolvedValue({ ok: true, value: EVIDENCE });
  vi.mocked(core.listCourts).mockResolvedValue({ ok: true, value: [testCourt()] });
  vi.mocked(core.readDisputeDetails).mockImplementation((_context, found) =>
    Promise.resolve(
      testDetails({ status: "found", ...found }, { appealInfo: { ok: true, value: { appealCost: ETH, appealPeriodStart: 1_700_000_000, appealPeriodEnd: 4_000_000_000 } } }),
    ),
  );
  vi.mocked(core.readMultipliers).mockResolvedValue({
    ok: true,
    value: { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n },
  });
  vi.mocked(core.readRoundFunding).mockResolvedValue(NO_FUNDING);
  vi.mocked(core.readWithdrawable).mockResolvedValue({ status: "available", beneficiary: ACCOUNT, total: ETH, items: [{ dialect: "idr-v2", ruling: 1n, amount: ETH }] });
}

const APPEAL_START = 1_700_000_000;
const APPEAL_INFO = { appealCost: ETH, appealPeriodStart: APPEAL_START, appealPeriodEnd: 4_000_000_000 };
const MULTIPLIERS = { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n };

function CaseTimelineAndAppeal() {
  const data = useCase(1, 1n, ACCOUNT);
  if (data.status !== "dispute") return null;
  const { chain } = testPageChain(1);
  return (
    <>
      <DisputeTimeline dispute={data} chain={chain} />
      <AppealSection dispute={data} chain={chain} />
    </>
  );
}

function CaseAppeal() {
  const data = useCase(1, 1n, ACCOUNT);
  return data.status === "dispute" ? <AppealSection dispute={data} chain={testPageChain(1).chain} /> : null;
}

async function renderCase(deps = createTestDeps()) {
  const wallet = await createConnectedTestWallet();
  return renderWithProviders(<CaseAppeal />, { path: "/1", deps, wallet });
}

function winnerCard(): HTMLElement {
  return screen.getByRole("listitem", { name: "Yes" });
}

function fundedPercent(card: HTMLElement): string | null {
  return within(card).getByRole("progressbar").getAttribute("aria-valuenow");
}

function toastRegion(): HTMLElement {
  return screen.getByRole("region", { name: "Notifications" });
}

function findRulingsToFund(): Promise<HTMLElement> {
  return screen.findByRole("list", { name: "Rulings to fund" });
}

beforeEach(() => {
  vi.clearAllMocks();
  writes.fake = fakeWriteController(TEST_SENT);
});

describe("AppealSection refresh after a mined write", () => {
  it("after a mined funding the panel shows the refreshed totals", async () => {
    const user = userEvent.setup();
    programReads(3);
    await renderCase();
    await waitFor(() => {
      expect(fundedPercent(winnerCard())).toBe("0");
    });
    vi.mocked(core.readRoundFunding).mockResolvedValue({ ok: true, value: { round: 0n, contributions: [{ ruling: 1n, amount: ETH }], fundedRulings: [] } });

    await user.click(within(winnerCard()).getByRole("button", { name: /^Fund/ }));

    await waitFor(() => {
      expect(fundedPercent(winnerCard())).toBe("50");
    });
    expect(core.readRoundFunding).toHaveBeenCalledTimes(2);
    expect(core.readDisputeDetails).toHaveBeenCalledTimes(2);
    expect(within(toastRegion()).getByText("Transaction confirmed")).toBeInTheDocument();
    expect(winnerCard()).not.toHaveTextContent("Transaction confirmed");
  });

  it("the toast confirms a funding whose refresh moved the dispute on and removed the card", async () => {
    const user = userEvent.setup();
    programReads(3);
    await renderCase();
    const fund = await waitFor(() => within(winnerCard()).getByRole("button", { name: /^Fund/ }));
    vi.mocked(core.lookupDispute).mockResolvedValue(testFoundLookup({ period: 4 }));
    // The refresh after the receipt waits on this read, so the panel moves on before the write reports it was mined.
    const funding = deferred<Outcome<RoundFunding>>();
    vi.mocked(core.readRoundFunding).mockReturnValueOnce(funding.promise);

    await user.click(fund);

    expect(await screen.findByRole("button", { name: "Withdraw 1 ETH" })).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "Yes" })).toBeNull();
    expect(within(toastRegion()).getByText("Transaction submitted")).toBeInTheDocument();
    funding.resolve(NO_FUNDING);
    expect(await within(toastRegion()).findByText("Transaction confirmed")).toBeInTheDocument();
    expect(within(toastRegion()).getByText("Sent 2 ETH to fund “Yes”.")).toBeInTheDocument();
  });

  it("once a funding is mined, an edited contribution follows the refreshed remaining amount again", async () => {
    const user = userEvent.setup();
    programReads(3);
    await renderCase();
    const field = await waitFor(() => within(winnerCard()).getByRole("textbox", { name: /Contribution/ }));
    await user.clear(field);
    await user.type(field, "0.5");
    vi.mocked(core.readRoundFunding).mockResolvedValue({ ok: true, value: { round: 0n, contributions: [{ ruling: 1n, amount: ETH / 2n }], fundedRulings: [] } });

    await user.click(within(winnerCard()).getByRole("button", { name: /^Fund/ }));

    await waitFor(() => {
      expect(within(winnerCard()).getByRole("textbox", { name: /Contribution/ })).toHaveValue("1.5");
    });
  });

  it("after the mined withdrawals that leave nothing, the panel says what was withdrawn, in a live region already on the page, and offers no button", async () => {
    const user = userEvent.setup();
    programReads(4);
    const { container } = await renderCase();
    const button = await screen.findByRole("button", { name: "Withdraw 1 ETH" });
    const region = container.querySelector('p[aria-live="polite"]');
    expect(region).toBeEmptyDOMElement();
    vi.mocked(core.readWithdrawable).mockResolvedValue({ status: "nothing" });

    await user.click(button);

    expect(await screen.findByText("You withdrew 1 ETH.")).toBe(region);
    expect(within(toastRegion()).getByText("Transaction confirmed")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(withdrawNothing("answer", false));
    expect(screen.queryByRole("button", { name: /^Withdraw/ })).toBeNull();
    expect(core.readWithdrawable).toHaveBeenCalledTimes(2);
  });

  it("after a withdrawal that stops part way, the panel shows the refreshed remaining amount and its button", async () => {
    const user = userEvent.setup();
    writes.fake = fakeWriteController(TEST_SENT, [TEST_SENT, [{ phase: "pending" }, { phase: "rejected" }]]);
    programReads(4);
    vi.mocked(core.readWithdrawable).mockResolvedValue({
      status: "available",
      beneficiary: ACCOUNT,
      total: ETH + ETH / 2n,
      items: [
        { dialect: "idr-v2", ruling: 1n, amount: ETH },
        { dialect: "idr-v2", ruling: 2n, amount: ETH / 2n },
      ],
    });
    const { container } = await renderCase();
    const button = await screen.findByRole("button", { name: "Withdraw 1.5 ETH" });
    vi.mocked(core.readWithdrawable).mockResolvedValue({
      status: "available",
      beneficiary: ACCOUNT,
      total: ETH / 2n,
      items: [{ dialect: "idr-v2", ruling: 2n, amount: ETH / 2n }],
    });

    await user.click(button);

    expect(await screen.findByRole("button", { name: "Withdraw 0.5 ETH" })).toBeInTheDocument();
    expect(core.readWithdrawable).toHaveBeenCalledTimes(2);
    expect(container).not.toHaveTextContent(/You withdrew/);
  });
});

describe("AppealSection retry", () => {
  it("'Retry the appeal fees' reads the multipliers again and shows the cards", async () => {
    const user = userEvent.setup();
    programReads(3);
    vi.mocked(core.readMultipliers).mockResolvedValueOnce({ ok: false, error: RPC_DOWN });
    await renderCase();
    const retry = await screen.findByRole("button", { name: "Retry the appeal fees" });
    expect(screen.getByText(FEES_UNAVAILABLE_TITLE)).toBeInTheDocument();

    await user.click(retry);

    expect(await findRulingsToFund()).toBeInTheDocument();
    expect(fundedPercent(winnerCard())).toBe("0");
    expect(core.readMultipliers).toHaveBeenCalledTimes(2);
    expect(core.detectFamily).toHaveBeenCalledTimes(1);
    expect(core.readDisputeEvent).toHaveBeenCalledTimes(1);
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(1);
  });

  it("'Retry the appeal fees' reads a governor's Dispute event again, which gives its session, and stays busy until it is read", async () => {
    const user = userEvent.setup();
    programReads(3);
    vi.mocked(core.detectFamily).mockResolvedValue(GOVERNOR);
    vi.mocked(core.readDisputeEvent).mockResolvedValueOnce({ ok: false, error: RPC_DOWN });
    vi.mocked(core.readRoundFunding).mockImplementation((context) =>
      Promise.resolve(
        context.evidenceGroupId === undefined
          ? { ok: false, error: { code: "not-found", message: "The governor session is unknown: the dispute's Dispute event was not read." } }
          : NO_FUNDING,
      ),
    );
    const { container } = await renderCase();
    const retry = await screen.findByRole("button", { name: "Retry the appeal fees" });
    expect(container).toHaveTextContent("The governor session is unknown");
    const event = deferred<Outcome<DisputeEventResult>>();
    vi.mocked(core.readDisputeEvent).mockReturnValueOnce(event.promise);

    await user.click(retry);

    await waitFor(() => {
      expect(core.readMultipliers).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(core.readDisputeDetails).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("button", { name: "Retry the appeal fees" })).toHaveAttribute("aria-disabled", "true");
    event.resolve(FOUND_EVENT);
    expect(await findRulingsToFund()).toBeInTheDocument();
    expect(core.readDisputeEvent).toHaveBeenCalledTimes(2);
    expect(winnerCard()).toBeInTheDocument();
  });

  it("'Retry the appeal fees' is idle again once the fees read fails again, while the evidence read the same press started still runs", async () => {
    const user = userEvent.setup();
    programReads(3);
    vi.mocked(core.readMultipliers).mockResolvedValue({ ok: false, error: RPC_DOWN });
    await renderCase();
    const retry = await screen.findByRole("button", { name: "Retry the appeal fees" });
    vi.mocked(core.loadEvidence).mockReturnValue(deferred<Outcome<EvidenceList>>().promise);

    await user.click(retry);

    await waitFor(() => {
      expect(core.loadEvidence).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry the appeal fees" })).not.toHaveAttribute("aria-disabled");
    });
    expect(core.readMultipliers).toHaveBeenCalledTimes(2);
  });

  it("on an Escrow V1 panel, 'Retry the appeal fees' is idle again once the appeal cost fails again, while the failed meta-evidence the same press reads again still loads", async () => {
    const user = userEvent.setup();
    programReads(3);
    vi.mocked(core.detectFamily).mockResolvedValue(ESCROW);
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(FAILED_META_EVIDENCE);
    vi.mocked(core.readDisputeDetails).mockImplementation((_context, found) =>
      Promise.resolve(testDetails({ status: "found", ...found }, { appealInfo: { ok: false, error: RPC_DOWN } })),
    );
    await renderCase();
    const retry = await screen.findByRole("button", { name: "Retry the appeal fees" });
    vi.mocked(core.loadMetaEvidence).mockReturnValue(deferred<MetaEvidenceResult>().promise);

    await user.click(retry);

    await waitFor(() => {
      expect(core.loadMetaEvidence).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry the appeal fees" })).not.toHaveAttribute("aria-disabled");
    });
    expect(core.readDisputeDetails).toHaveBeenCalledTimes(2);
  });

  it("'Retry the appeal fees' after a failed funding read stays busy until the funding is read again", async () => {
    const user = userEvent.setup();
    programReads(3);
    vi.mocked(core.readRoundFunding).mockResolvedValueOnce({ ok: false, error: RPC_DOWN });
    await renderCase();
    const retry = await screen.findByRole("button", { name: "Retry the appeal fees" });
    const funding = deferred<Outcome<RoundFunding>>();
    vi.mocked(core.readRoundFunding).mockReturnValueOnce(funding.promise);

    await user.click(retry);

    await waitFor(() => {
      expect(core.readMultipliers).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(core.readDisputeDetails).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("button", { name: "Retry the appeal fees" })).toHaveAttribute("aria-disabled", "true");
    funding.resolve(NO_FUNDING);
    expect(await findRulingsToFund()).toBeInTheDocument();
  });

  it("Retry on an unavailable panel reads the meta-evidence again and stays busy until it is read", async () => {
    const user = userEvent.setup();
    programReads(3);
    vi.mocked(core.loadMetaEvidence).mockResolvedValueOnce(FAILED_META_EVIDENCE);
    await renderCase();
    const retry = await screen.findByRole("button", { name: "Retry Appeal" });
    expect(screen.getByText("The meta-evidence file could not be fetched.")).toBeInTheDocument();
    const metaEvidence = deferred<MetaEvidenceResult>();
    vi.mocked(core.loadMetaEvidence).mockReturnValueOnce(metaEvidence.promise);

    await user.click(retry);

    await waitFor(() => {
      expect(core.readMultipliers).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(core.readRoundFunding).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("button", { name: "Retry Appeal" })).toHaveAttribute("aria-disabled", "true");
    metaEvidence.resolve(testOkMetaEvidence());
    expect(await findRulingsToFund()).toBeInTheDocument();
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(2);
  });

  it("Retry on an unavailable panel detects the family again", async () => {
    const user = userEvent.setup();
    programReads(3);
    vi.mocked(core.detectFamily).mockRejectedValueOnce(new Error("probe failed")).mockRejectedValueOnce(new Error("probe failed"));
    await renderCase();
    const retry = await screen.findByRole("button", { name: "Retry Appeal" });

    await user.click(retry);

    expect(await findRulingsToFund()).toBeInTheDocument();
    expect(core.detectFamily).toHaveBeenCalledTimes(3);
  });
});

describe("AppealSection on a governor whose dynamic script the gateway did not serve", () => {
  const GATEWAY_FAILED = "The meta-evidence or its dynamic script could not be fetched from the IPFS gateway.";
  const SCRIPT_NOT_SERVED: MetaEvidenceResult = { ...testOkMetaEvidence({ rulingOptions: { type: "single-select" } }), script: { ran: false, reason: "script-fetch-failed" } };

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function programGovernor(): void {
    programReads(3);
    vi.mocked(core.detectFamily).mockResolvedValue(GOVERNOR);
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(SCRIPT_NOT_SERVED);
  }

  it("holds the cards with the gateway's failure while the funding scan is still running", async () => {
    programGovernor();
    vi.mocked(core.readRoundFunding).mockReturnValue(deferred<Outcome<RoundFunding>>().promise);
    await renderCase();
    expect(await screen.findByRole("button", { name: "Retry Appeal" })).toBeInTheDocument();
    expect(screen.getByText(GATEWAY_FAILED)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Fund/ })).toBeNull();
  });

  it("the held cards' Retry stays busy until its re-read settles, then is idle again while the gateway still fails", async () => {
    const user = userEvent.setup();
    programGovernor();
    await renderCase();
    const retry = await screen.findByRole("button", { name: "Retry Appeal" });
    const metaEvidence = deferred<MetaEvidenceResult>();
    vi.mocked(core.loadMetaEvidence).mockReturnValueOnce(metaEvidence.promise);
    const detailsReads = vi.mocked(core.readDisputeDetails).mock.calls.length;

    await user.click(retry);

    await waitFor(() => {
      expect(core.loadMetaEvidence).toHaveBeenCalledTimes(2);
    });
    // The appeal reads the same press started answer at once; only the meta-evidence is held.
    await waitFor(() => {
      expect(vi.mocked(core.readDisputeDetails).mock.calls.length).toBeGreaterThan(detailsReads);
    });
    expect(screen.getByRole("button", { name: "Retry Appeal" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Retry Appeal" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Retry Appeal" }).querySelector(".button-loading")).not.toBeNull();
    metaEvidence.resolve(SCRIPT_NOT_SERVED);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry Appeal" })).not.toHaveAttribute("aria-disabled");
    });
    expect(screen.getByRole("button", { name: "Retry Appeal" }).querySelector(".button-loading")).toBeNull();
    expect(screen.getByText(GATEWAY_FAILED)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Fund/ })).toBeNull();
  });

  const APPEAL_READS = ["chainTime", "details", "evidence", "executedRuling", "funding", "lookup", "multipliers", "productFunding"];
  const WITH_META_EVIDENCE = ["chainTime", "details", "evidence", "executedRuling", "funding", "lookup", "metaEvidence", "multipliers", "productFunding"];

  it.each<[string, string, () => void, readonly string[]]>([
    ["the held cards' Retry also reads the meta-evidence again", "Retry Appeal", () => undefined, WITH_META_EVIDENCE],
    [
      "'Retry the appeal fees' reads the appeal again but not the meta-evidence",
      "Retry the appeal fees",
      () => vi.mocked(core.readMultipliers).mockResolvedValueOnce({ ok: false, error: RPC_DOWN }),
      APPEAL_READS,
    ],
    [
      "Retry after a failed details read reads the appeal again but not the meta-evidence",
      "Retry Appeal",
      () => vi.mocked(core.readDisputeDetails).mockRejectedValueOnce(new Error("socket hang up")),
      APPEAL_READS,
    ],
    [
      "Retry after a failed meta-evidence load reads the appeal and the meta-evidence again",
      "Retry Appeal",
      () => vi.mocked(core.loadMetaEvidence).mockResolvedValue({ status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: GATEWAY_FAILED } }),
      WITH_META_EVIDENCE,
    ],
  ])("%s", async (_name, button, program, kinds) => {
    const user = userEvent.setup();
    programGovernor();
    program();
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    await renderCase();
    const retry = await screen.findByRole("button", { name: button });
    invalidate.mockClear();

    await user.click(retry);

    expect(invalidate.mock.calls.map(([filters]) => String(filters?.queryKey?.[1])).sort((a, b) => a.localeCompare(b))).toEqual(kinds);
  });

  it.each([
    ["keeps the losing side's notice in the timeline", 1n, true],
    ["adds no losing side's notice to the timeline after a tie, where every list has the full period", 0n, false],
  ] as const)("while the cards are held, %s", async (_name, ruling, notice) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime((APPEAL_START + 3_600) * 1000);
    programGovernor();
    vi.mocked(core.readMultipliers).mockResolvedValue({ ok: true, value: { ...MULTIPLIERS, sharedMultiplier: 10_000n } });
    vi.mocked(core.readDisputeDetails).mockImplementation((_context, found) =>
      Promise.resolve(testDetails({ status: "found", ...found }, { currentRuling: { ok: true, value: ruling }, appealInfo: { ok: true, value: APPEAL_INFO } })),
    );
    const wallet = await createConnectedTestWallet();
    renderWithProviders(<CaseTimelineAndAppeal />, { path: "/1", deps: createTestDeps(), wallet });

    expect(await screen.findByText(GATEWAY_FAILED)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Fund/ })).toBeNull();
    const timeline = await screen.findByRole("region", { name: "Dispute timeline" });
    if (notice) expect(await within(timeline).findByText(/^Losing side: .+ left to fund an appeal$/)).toBeInTheDocument();
    else expect(within(timeline).queryByText(/^Losing side:/)).toBeNull();
  });

  it("with the real meta-evidence pipeline, a script answered with HTTP 429 holds Fund, and Retry once the gateway serves it shows the lists", async () => {
    const user = userEvent.setup();
    programGovernor();
    vi.mocked(core.loadMetaEvidence).mockImplementation(actualCore.loadMetaEvidence);
    const metaEvidenceEvent: Outcome<MetaEvidenceEventResult> = {
      ok: true,
      value: { status: "found", event: { uri: TEST_META_EVIDENCE_URI, blockNumber: 100n, logIndex: 0, transactionHash: "0x01", emissions: 1 } },
    };
    vi.mocked(core.readMetaEvidenceEvent).mockResolvedValue(metaEvidenceEvent);
    const scriptCid = core.REGISTRY.dynamicScriptAllowlist[1]?.find((path) => !path.includes("/"));
    if (scriptCid === undefined) throw new Error("No script is allowlisted on chain 1.");
    const document = { title: "Kleros governor session", description: "", rulingOptions: {}, dynamicScriptURI: `/ipfs/${scriptCid}` };
    const gateway = { scriptStatus: 429 };
    const answer = (status: number, text: string): FetchResponse => ({
      ok: status === 200,
      status,
      json: () => Promise.resolve(JSON.parse(text) as unknown),
      text: () => Promise.resolve(text),
    });
    const fetcher: Fetcher = (url) => {
      if (url.endsWith(TEST_META_EVIDENCE_URI)) return Promise.resolve(answer(200, JSON.stringify(document)));
      if (url.endsWith(`/ipfs/${scriptCid}`)) return Promise.resolve(answer(gateway.scriptStatus, "getMetaEvidence"));
      return Promise.resolve(answer(404, ""));
    };
    const runScript = vi.fn(() => ({ status: "ok", value: { rulingOptions: { type: "single-select", titles: ["List 17", "List 18"] } }, jsonDuplicateKeys: false }) as const);
    await renderCase(createTestDeps({ fetcher, runScript }));
    const retry = await screen.findByRole("button", { name: "Retry Appeal" });
    expect(screen.getByText("Appeal unavailable")).toBeInTheDocument();
    expect(screen.getByText(GATEWAY_FAILED)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Fund/ })).toBeNull();
    expect(runScript).not.toHaveBeenCalled();

    gateway.scriptStatus = 200;
    await user.click(retry);

    const lists = [await screen.findByRole("listitem", { name: "List 17" }), screen.getByRole("listitem", { name: "List 18" })];
    for (const card of lists) expect(within(card).getByRole("button", { name: /^Fund/ })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: /^Fund/ })).toHaveLength(2);
    expect(screen.queryByText(GATEWAY_FAILED)).toBeNull();
    expect(runScript).toHaveBeenCalledTimes(1);
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(2);
  });
});
