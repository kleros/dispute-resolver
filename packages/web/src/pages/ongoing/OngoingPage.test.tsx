import * as core from "@dispute-resolver/core";
import type { Court, MetaEvidenceResult, OngoingDispute, OngoingList, Outcome, Period } from "@dispute-resolver/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testCourt, testOkMetaEvidence, TEST_ARBITRABLE } from "../../test/data";
import { renderWithProviders } from "../../test/shell";
import { OngoingPage } from "./OngoingPage";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const DAY = 86_400;
const nowSeconds = () => Math.floor(Date.now() / 1000);

const GENERAL = testCourt({ id: 0n, name: "General Court" });
const BLOCKCHAIN = testCourt({ id: 2n, name: "Blockchain" });
const NAMELESS = testCourt({ id: 5n, name: null });
const COURTS: Outcome<readonly Court[]> = { ok: true, value: [GENERAL, BLOCKCHAIN, NAMELESS] };
/** A bad meta-evidence whose title is an object: rendering it as text throws inside the card (D-36). */
const UNRENDERABLE_TITLE = { bad: true } as unknown as string;

function dispute(id: bigint, period: Period, overrides: Partial<OngoingDispute> = {}): OngoingDispute {
  return { id, arbitrated: TEST_ARBITRABLE, period, subcourtId: 0n, lastPeriodChange: nowSeconds() - DAY, countdownTarget: nowSeconds() + 2 * DAY, ...overrides };
}

function listOf(disputes: readonly OngoingDispute[], failedIds: readonly bigint[] = []): OngoingList {
  return { status: "ok", disputes, failedIds };
}

/** Answers `loadMetaEvidence` per dispute ID; an ID without an entry stays pending. */
function titles(results: Readonly<Record<string, MetaEvidenceResult>>) {
  vi.mocked(core.loadMetaEvidence).mockImplementation((input) => {
    const result = results[input.disputeId.toString()];
    return result === undefined ? new Promise<MetaEvidenceResult>(() => undefined) : Promise.resolve(result);
  });
}

function renderOngoing(path = "/1/ongoing") {
  return renderWithProviders(<OngoingPage />, { path });
}

function page(): HTMLElement {
  return screen.getByTestId("ongoing-page");
}

async function settledPage(state: string): Promise<HTMLElement> {
  await waitFor(() => {
    expect(page()).toHaveAttribute("data-state", state);
  });
  return page();
}

function card(id: string): HTMLElement {
  const found = screen.getAllByTestId("ongoing-card").find((element) => element.getAttribute("data-dispute-id") === id);
  if (found === undefined) throw new Error(`No card for dispute ${id}.`);
  return found;
}

function cardIds(): string[] {
  return screen.queryAllByTestId("ongoing-card").map((element) => element.getAttribute("data-dispute-id") ?? "");
}

async function chooseFilter(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /period/i }));
  await user.click(await screen.findByRole("option", { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(core.listCourts).mockResolvedValue(COURTS);
  titles({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Ongoing page (spec §3, ARCHITECTURE.md §5.5, §12.2)", () => {
  it("spec §3: a chain without an arbitrator shows the no-arbitrator heading and reads nothing", () => {
    renderOngoing("/137/ongoing");
    expect(page()).toHaveAttribute("data-state", "no-arbitrator");
    expect(page()).toHaveAttribute("data-chain", "137");
    expect(screen.getByRole("heading", { name: "There is no arbitrator on this network, thus no disputes." })).toBeInTheDocument();
    expect(core.listCourts).not.toHaveBeenCalled();
    expect(core.listOngoingDisputes).not.toHaveBeenCalled();
  });

  it("spec §3: the list's own no-arbitrator answer shows the same heading", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue({ status: "no-arbitrator" });
    renderOngoing();
    await settledPage("no-arbitrator");
    expect(screen.getByRole("heading", { name: "There is no arbitrator on this network, thus no disputes." })).toBeInTheDocument();
  });

  it("ONG-2 §12.2: the page is loading until the list resolves, after the courts have settled", async () => {
    vi.mocked(core.listOngoingDisputes).mockReturnValue(new Promise<OngoingList>(() => undefined));
    renderOngoing();
    await waitFor(() => {
      expect(core.listOngoingDisputes).toHaveBeenCalled();
    });
    expect(page()).toHaveAttribute("data-state", "loading");
    expect(page()).toHaveAttribute("data-chain", "1");
    expect(within(page()).getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("spec §3: a failed scan shows 'Failed to load disputes.' with the RPC hint and the reason", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue({ status: "failed", error: { code: "rpc-error", message: "Could not read the open disputes: getLogs refused" } });
    renderOngoing();
    await settledPage("failed");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Failed to load disputes.");
    expect(alert).toHaveTextContent("There may be a problem with the RPC endpoint. Please refresh the page to try again.");
    expect(alert).toHaveTextContent("getLogs refused");
    expect(screen.queryAllByTestId("ongoing-card")).toHaveLength(0);
  });

  it("spec §3: with no open dispute the page says 'There are no open disputes.'", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([]));
    renderOngoing();
    await settledPage("empty");
    expect(screen.getByText("There are no open disputes.")).toBeInTheDocument();
  });

  it("§12.2: each card carries its dispute ID and period, newest first, with the title, court and countdown hooks", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(12n, 2, { subcourtId: 2n }), dispute(9n, 0)]));
    titles({ "12": testOkMetaEvidence({ title: "Was the delivery on time?" }), "9": testOkMetaEvidence({ title: "Is the logo original?" }) });
    renderOngoing();
    await settledPage("list");
    expect(cardIds()).toEqual(["12", "9"]);
    const twelve = card("12");
    expect(twelve).toHaveAttribute("data-period", "2");
    await waitFor(() => {
      expect(within(twelve).getByTestId("ongoing-card-title")).toHaveTextContent("Was the delivery on time?");
    });
    expect(within(twelve).getByTestId("ongoing-card-court")).toHaveTextContent("Blockchain");
    expect(within(twelve).getByTestId("ongoing-card-countdown")).toHaveTextContent(/^\d{2}d \d{2}h \d{2}m$/);
    expect(within(twelve).getByText("#12")).toBeInTheDocument();
    expect(within(twelve).getByText("Voting")).toBeInTheDocument();
  });

  it("§3.4: a card is a router link to its case page", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(1665n, 1)]));
    titles({ "1665": testOkMetaEvidence({ title: "Some case" }) });
    renderOngoing("/100/ongoing");
    await settledPage("list");
    expect(within(card("1665")).getByRole("link")).toHaveAttribute("href", "/100/cases/1665");
  });

  it("D-37: cards render as each dispute resolves, before every title has settled", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(3n, 0), dispute(2n, 0)]));
    titles({ "3": testOkMetaEvidence({ title: "Settled title" }) });
    renderOngoing();
    await settledPage("list");
    await waitFor(() => {
      expect(within(card("3")).getByTestId("ongoing-card-title")).toHaveTextContent("Settled title");
    });
    const pending = within(card("2")).getByTestId("ongoing-card-title");
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(pending).not.toHaveTextContent("Settled title");
  });

  it("D-37: a failed meta-evidence shows the dispute ID with 'title unavailable'", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(77n, 0)]));
    titles({ "77": { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "The meta-evidence did not load in time." } } });
    renderOngoing();
    await settledPage("list");
    await waitFor(() => {
      expect(within(card("77")).getByTestId("ongoing-card-title")).toHaveTextContent("Dispute 77: title unavailable");
    });
  });

  it("spec §3: a missing meta-evidence shows 'Meta Evidence Missing'", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(5n, 0)]));
    titles({ "5": { status: "missing" } });
    renderOngoing();
    await settledPage("list");
    await waitFor(() => {
      expect(within(card("5")).getByTestId("ongoing-card-title")).toHaveTextContent("Meta Evidence Missing");
    });
  });

  it("spec §3: an accepted meta-evidence with an empty title shows 'Meta Evidence Missing'", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(6n, 0)]));
    titles({ "6": testOkMetaEvidence({ title: "" }) });
    renderOngoing();
    await settledPage("list");
    await waitFor(() => {
      expect(within(card("6")).getByTestId("ongoing-card-title")).toHaveTextContent("Meta Evidence Missing");
    });
  });

  it("A2: a rejected meta-evidence shows its placeholder title", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(8n, 0)]));
    titles({ "8": { status: "invalid", metaEvidence: testOkMetaEvidence({ title: "Invalid meta-evidence" }).metaEvidence, reason: "uri-not-content-addressed" } });
    renderOngoing();
    await settledPage("list");
    await waitFor(() => {
      expect(within(card("8")).getByTestId("ongoing-card-title")).toHaveTextContent("Invalid meta-evidence");
    });
  });

  it("ONG-1 spec §3: the countdown shows whenever the period's end is known, a passed end as zeros, as today", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(
      listOf([dispute(30n, 0), dispute(20n, 3, { countdownTarget: nowSeconds() - 60 }), dispute(10n, 1, { countdownTarget: null })]),
    );
    renderOngoing();
    await settledPage("list");
    expect(within(card("30")).getByTestId("ongoing-card-countdown")).toHaveTextContent(/^01d 23h 59m$|^02d 00h 00m$/);
    expect(within(card("20")).getByTestId("ongoing-card-countdown")).toHaveTextContent("00d 00h 00m");
    expect(within(card("10")).queryByTestId("ongoing-card-countdown")).toBeNull();
  });

  it("D-19: a court whose policy failed shows its ID with 'name unavailable'", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(4n, 0, { subcourtId: 5n })]));
    renderOngoing();
    await settledPage("list");
    expect(within(card("4")).getByTestId("ongoing-card-court")).toHaveTextContent("Court 5 (name unavailable)");
  });

  it("D-36: a court missing from the court list degrades the badge instead of crashing the card", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(4n, 0, { subcourtId: 99n, countdownTarget: null })]));
    renderOngoing();
    await settledPage("list");
    expect(within(card("4")).getByTestId("ongoing-card-court")).toHaveTextContent("Court 99 (unavailable)");
  });

  it("D-36: without the court list the cards still render, with the court unavailable", async () => {
    vi.mocked(core.listCourts).mockResolvedValue({ ok: false, error: { code: "rpc-error", message: "down" } });
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(4n, 0, { countdownTarget: null })]));
    renderOngoing();
    await settledPage("list");
    expect(within(card("4")).getByTestId("ongoing-card-court")).toHaveTextContent("Court 0 (unavailable)");
    expect(within(card("4")).queryByTestId("ongoing-card-countdown")).toBeNull();
  });

  it("§5.5: a dispute whose struct failed shows its ID with 'details unavailable', outside the parity snapshot", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(9n, 0)], [11n]));
    renderOngoing();
    await settledPage("list");
    expect(cardIds()).toEqual(["9"]);
    const failed = screen.getByRole("link", { name: /Dispute 11: details unavailable/ });
    expect(failed).toHaveAttribute("href", "/1/cases/11");
    const items = within(screen.getByRole("list", { name: "Open disputes" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([expect.stringContaining("#11"), expect.stringContaining("#9")]);
  });

  it("§12.2: a list holding only failed structs is a list, not empty", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([], [11n]));
    renderOngoing();
    await settledPage("list");
    expect(screen.getByText(/details unavailable/)).toBeInTheDocument();
  });

  it("spec §3: the filter defaults to Ongoing (all) and shows only the selected period's cards", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(4n, 3), dispute(3n, 2), dispute(2n, 1), dispute(1n, 0)], [7n]));
    renderOngoing();
    await settledPage("list");
    expect(cardIds()).toEqual(["4", "3", "2", "1"]);
    expect(screen.getByText(/Dispute 7: details unavailable/)).toBeInTheDocument();

    await chooseFilter("Appeal");
    expect(cardIds()).toEqual(["4"]);
    expect(screen.queryByText(/details unavailable/)).toBeNull();

    await chooseFilter("Commit");
    expect(cardIds()).toEqual(["2"]);

    await chooseFilter("Ongoing");
    expect(cardIds()).toEqual(["4", "3", "2", "1"]);
    expect(screen.getByText(/Dispute 7: details unavailable/)).toBeInTheDocument();
    expect(page()).toHaveAttribute("data-state", "list");
  });

  it("spec §3: a filter with no matching dispute says so", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(1n, 0)]));
    renderOngoing();
    await settledPage("list");
    await chooseFilter("Voting");
    expect(cardIds()).toEqual([]);
    expect(screen.getByText("No open dispute is in the Voting period.")).toBeInTheDocument();
  });

  it("D-36: a card whose render throws degrades to its own section, the other cards stay", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(2n, 0), dispute(1n, 0)]));
    titles({ "1": testOkMetaEvidence({ title: UNRENDERABLE_TITLE }) });
    renderOngoing();
    await settledPage("list");
    expect(card("2")).toBeInTheDocument();
    expect(await screen.findByText("Dispute 1 unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Dispute 1" })).toBeInTheDocument();
  });

  it("S-3: Retry resets the card's boundary and reloads its title", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(1n, 0)]));
    titles({ "1": testOkMetaEvidence({ title: UNRENDERABLE_TITLE }) });
    renderOngoing();
    await settledPage("list");
    await waitFor(() => {
      expect(core.loadMetaEvidence).toHaveBeenCalledTimes(1);
    });
    await userEvent.setup().click(await screen.findByRole("button", { name: "Retry Dispute 1" }));
    await waitFor(() => {
      expect(core.loadMetaEvidence).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Dispute 1 unavailable")).toBeInTheDocument();
  });

  it("spec §3: the dropdown shows the selected filter's name", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(1n, 0)]));
    renderOngoing();
    await settledPage("list");
    expect(screen.getByRole("button", { name: /period/i })).toHaveTextContent("Ongoing");
    await chooseFilter("Evidence");
    expect(screen.getByRole("button", { name: /period/i })).toHaveTextContent("Evidence");
  });
});
