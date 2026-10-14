import * as core from "@dispute-resolver/core";
import type { Address, DisputeEventResult, EvidenceList, Outcome, RoundFunding } from "@dispute-resolver/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCase } from "../../data";
import { createTestDeps, testCourt, testDetails, testFamily, testFoundLookup, testOkMetaEvidence } from "../../test/data";
import { testPageChain } from "../../test/routing";
import { renderWithProviders } from "../../test/shell";
import { TEST_TX_HASH, fakeWriteController, testReceipt, type FakeWriteController } from "../../test/wallet";
import type { WriteStatus } from "../../wallet";
import { AppealSection } from "./AppealSection";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../../test/data/mockCoreReads")).mockCoreReads(importOriginal));

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
const ACCOUNT: Address = "0x1111111111111111111111111111111111111111";
const EVIDENCE: EvidenceList = {
  items: [],
  hiddenEvidenceCount: 0,
  hiddenByReason: { undecodable: 0, "not-content-addressed": 0, "fetch-failed": 0, "not-json": 0, "schema-invalid": 0 },
};
const FOUND_EVENT: Outcome<DisputeEventResult> = {
  ok: true,
  value: { status: "found", event: { metaEvidenceId: 0n, evidenceGroupId: 3n, blockNumber: 100n, createdAt: 1_700_000_000, transactionHash: "0x01" } },
};
const MINED: WriteStatus = { phase: "mined", hash: TEST_TX_HASH, explorerUrl: null, receipt: testReceipt() };
const SENT: readonly WriteStatus[] = [{ phase: "pending" }, { phase: "submitted", hash: TEST_TX_HASH, explorerUrl: null }, MINED];
const NO_FUNDING: Outcome<RoundFunding> = { ok: true, value: { round: 0n, contributions: [], fundedRulings: [] } };
const RPC_DOWN = { code: "rpc-error", message: "The RPC did not answer." } as const;
const GOVERNOR = testFamily({
  family: "governor",
  writeFamily: "governor",
  capabilities: { localId: "none", evidence: { kind: "uri-only" }, appeal: { kind: "governor" }, withdraw: { kind: "governor" } },
});

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

/** The case page's data feeding the section, as `pages/case` composes them. */
function CaseAppeal() {
  const data = useCase(1, 1n, ACCOUNT);
  return data.status === "dispute" ? <AppealSection dispute={data} chain={testPageChain(1).chain} /> : null;
}

function winnerCard(): HTMLElement {
  const found = screen.queryAllByTestId("appeal-card").find((card) => card.getAttribute("data-code") === "1");
  if (found === undefined) throw new Error("The card of ruling 1 is not shown.");
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  writes.fake = fakeWriteController(SENT);
});

describe("AppealSection refresh after a mined write (proposal P-02, D-07)", () => {
  it("P-02: after a mined funding the panel shows the refreshed totals", async () => {
    const user = userEvent.setup();
    programReads(3);
    renderWithProviders(<CaseAppeal />, { path: "/1", deps: createTestDeps() });
    await waitFor(() => {
      expect(winnerCard()).toHaveAttribute("data-funded-percent", "0");
    });
    expect(core.readRoundFunding).toHaveBeenCalledTimes(1);
    vi.mocked(core.readRoundFunding).mockResolvedValue({ ok: true, value: { round: 0n, contributions: [{ ruling: 1n, amount: ETH }], fundedRulings: [] } });

    await user.click(within(winnerCard()).getByRole("button", { name: /^Fund/ }));

    await waitFor(() => {
      expect(winnerCard()).toHaveAttribute("data-funded-percent", "50");
    });
    expect(core.readRoundFunding).toHaveBeenCalledTimes(2);
    expect(core.readDisputeDetails).toHaveBeenCalledTimes(2);
    expect(within(winnerCard()).getByText("Transaction confirmed")).toBeInTheDocument();
  });

  it("P-02, D-54: once a funding is mined, an edited contribution follows the refreshed remaining amount again", async () => {
    const user = userEvent.setup();
    programReads(3);
    renderWithProviders(<CaseAppeal />, { path: "/1", deps: createTestDeps() });
    const field = await waitFor(() => within(winnerCard()).getByRole("spinbutton", { name: /Contribution/ }));
    await user.clear(field);
    await user.type(field, "0.5");
    vi.mocked(core.readRoundFunding).mockResolvedValue({ ok: true, value: { round: 0n, contributions: [{ ruling: 1n, amount: ETH / 2n }], fundedRulings: [] } });

    await user.click(within(winnerCard()).getByRole("button", { name: /^Fund/ }));

    await waitFor(() => {
      expect(within(winnerCard()).getByRole("spinbutton", { name: /Contribution/ })).toHaveValue("1.5");
    });
  });

  it("P-02: after the mined withdrawals the panel shows nothing withdrawable", async () => {
    const user = userEvent.setup();
    programReads(4);
    renderWithProviders(<CaseAppeal />, { path: "/1", deps: createTestDeps() });
    const button = await screen.findByRole("button", { name: "Withdraw 1 ETH" });
    vi.mocked(core.readWithdrawable).mockResolvedValue({ status: "nothing" });

    await user.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("appeal-panel")).toHaveAttribute("data-withdrawable-wei", "0");
    });
    expect(screen.getByTestId("appeal-panel")).toHaveTextContent(/You don't have any amount to withdraw/);
    expect(screen.queryByRole("button", { name: /^Withdraw/ })).toBeNull();
    expect(core.readWithdrawable).toHaveBeenCalledTimes(2);
    expect(core.lookupDispute).toHaveBeenCalledTimes(1);
  });
});

describe("AppealSection retry (D-36: Retry reads the section's data again)", () => {
  function panelKind(): string | null {
    return screen.getByTestId("appeal-panel").getAttribute("data-kind");
  }

  it("CA-2, D-36: 'Retry the appeal fees' reads the multipliers again and shows the cards", async () => {
    const user = userEvent.setup();
    programReads(3);
    vi.mocked(core.readMultipliers).mockResolvedValueOnce({ ok: false, error: RPC_DOWN });
    renderWithProviders(<CaseAppeal />, { path: "/1", deps: createTestDeps() });
    const retry = await screen.findByRole("button", { name: "Retry the appeal fees" });
    expect(panelKind()).toBe("fees-unavailable");

    await user.click(retry);

    await waitFor(() => {
      expect(panelKind()).toBe("crowdfunding");
    });
    expect(winnerCard()).toHaveAttribute("data-funded-percent", "0");
    expect(core.readMultipliers).toHaveBeenCalledTimes(2);
    expect(core.detectFamily).toHaveBeenCalledTimes(1);
    expect(core.readDisputeEvent).toHaveBeenCalledTimes(1);
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(1);
  });

  it("CA-2, D-47: 'Retry the appeal fees' reads a governor's Dispute event again, which gives its session", async () => {
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
    renderWithProviders(<CaseAppeal />, { path: "/1", deps: createTestDeps() });
    const retry = await screen.findByRole("button", { name: "Retry the appeal fees" });
    expect(screen.getByTestId("appeal-panel")).toHaveTextContent("The governor session is unknown");

    await user.click(retry);

    await waitFor(() => {
      expect(panelKind()).toBe("crowdfunding");
    });
    expect(core.readDisputeEvent).toHaveBeenCalledTimes(2);
    expect(winnerCard()).toBeInTheDocument();
  });

  it("CA-2, D-36: Retry on an unavailable panel reads the meta-evidence again", async () => {
    const user = userEvent.setup();
    programReads(3);
    vi.mocked(core.loadMetaEvidence).mockResolvedValueOnce({
      status: "failed",
      reason: "fetch-error",
      error: { code: "rpc-error", message: "The meta-evidence file could not be fetched." },
    });
    renderWithProviders(<CaseAppeal />, { path: "/1", deps: createTestDeps() });
    const retry = await screen.findByRole("button", { name: "Retry Appeal" });
    expect(screen.getByText("The meta-evidence file could not be fetched.")).toBeInTheDocument();

    await user.click(retry);

    await waitFor(() => {
      expect(panelKind()).toBe("crowdfunding");
    });
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(2);
  });

  it("CA-2, D-36: Retry on an unavailable panel detects the family again", async () => {
    const user = userEvent.setup();
    programReads(3);
    vi.mocked(core.detectFamily).mockRejectedValueOnce(new Error("probe failed")).mockRejectedValueOnce(new Error("probe failed"));
    renderWithProviders(<CaseAppeal />, { path: "/1", deps: createTestDeps() });
    const retry = await screen.findByRole("button", { name: "Retry Appeal" });

    await user.click(retry);

    await waitFor(() => {
      expect(panelKind()).toBe("crowdfunding");
    });
    expect(core.detectFamily).toHaveBeenCalledTimes(3);
  });
});
