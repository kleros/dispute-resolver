import * as core from "@dispute-resolver/core";
import type { Address, DisputeEventResult, Outcome, RoundFunding } from "@dispute-resolver/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCase } from "../../data";
import { createTestDeps, deferred, testCourt, testDetails, testDisputeEvent, testEvidenceList, testFamily, testFoundLookup, testOkMetaEvidence } from "../../test/data";
import { testPageChain } from "../../test/routing";
import { renderWithProviders } from "../../test/shell";
import { TEST_SENT, TEST_WALLET_ADDRESS, createConnectedTestWallet, fakeWriteController, type FakeWriteController } from "../../test/wallet";
import { AppealSection } from "./AppealSection";
import { FEES_UNAVAILABLE_TITLE, withdrawNothing } from "./copy";

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

function CaseAppeal() {
  const data = useCase(1, 1n, ACCOUNT);
  return data.status === "dispute" ? <AppealSection dispute={data} chain={testPageChain(1).chain} /> : null;
}

async function renderCase() {
  const wallet = await createConnectedTestWallet();
  return renderWithProviders(<CaseAppeal />, { path: "/1", deps: createTestDeps(), wallet });
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
    expect(within(toastRegion()).getByText("Funded “Yes” with 2 ETH.")).toBeInTheDocument();
  });

  it("once a funding is mined, an edited contribution follows the refreshed remaining amount again", async () => {
    const user = userEvent.setup();
    programReads(3);
    await renderCase();
    const field = await waitFor(() => within(winnerCard()).getByRole("spinbutton", { name: /Contribution/ }));
    await user.clear(field);
    await user.type(field, "0.5");
    vi.mocked(core.readRoundFunding).mockResolvedValue({ ok: true, value: { round: 0n, contributions: [{ ruling: 1n, amount: ETH / 2n }], fundedRulings: [] } });

    await user.click(within(winnerCard()).getByRole("button", { name: /^Fund/ }));

    await waitFor(() => {
      expect(within(winnerCard()).getByRole("spinbutton", { name: /Contribution/ })).toHaveValue("1.5");
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
    expect(container).not.toHaveTextContent(withdrawNothing("answer"));
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

  it("'Retry the appeal fees' reads a governor's Dispute event again, which gives its session", async () => {
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

    await user.click(retry);

    expect(await findRulingsToFund()).toBeInTheDocument();
    expect(core.readDisputeEvent).toHaveBeenCalledTimes(2);
    expect(winnerCard()).toBeInTheDocument();
  });

  it("Retry on an unavailable panel reads the meta-evidence again", async () => {
    const user = userEvent.setup();
    programReads(3);
    vi.mocked(core.loadMetaEvidence).mockResolvedValueOnce({
      status: "failed",
      reason: "fetch-error",
      error: { code: "rpc-error", message: "The meta-evidence file could not be fetched." },
    });
    await renderCase();
    const retry = await screen.findByRole("button", { name: "Retry Appeal" });
    expect(screen.getByText("The meta-evidence file could not be fetched.")).toBeInTheDocument();

    await user.click(retry);

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
