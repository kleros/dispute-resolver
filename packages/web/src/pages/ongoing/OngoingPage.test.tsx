import * as core from "@dispute-resolver/core";
import type { Court, MetaEvidenceResult, OngoingDispute, OngoingList, Outcome, Period } from "@dispute-resolver/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation, useNavigate } from "react-router";
import { numberToHex } from "viem";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { createTestDeps, testCourt, testOkMetaEvidence, TEST_ARBITRABLE, type RpcHandler } from "../../test/data";
import { renderWithProviders } from "../../test/shell";
import { createTestWallet, holdChainSwitches } from "../../test/wallet";
import { OngoingPage } from "./OngoingPage";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const DAY = 86_400;
const nowSeconds = () => Math.floor(Date.now() / 1000);

const GENERAL = testCourt({ id: 0n, name: "General Court" });
const BLOCKCHAIN = testCourt({ id: 2n, name: "Blockchain" });
const NAMELESS = testCourt({ id: 5n, name: null });
const COURTS: Outcome<readonly Court[]> = { ok: true, value: [GENERAL, BLOCKCHAIN, NAMELESS] };
/** A bad meta-evidence whose title is an object: rendering it as text throws inside the card. */
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

const CHAIN_SECONDS = 1_700_000_000;
const HOUR = 3_600;

/** Answers the latest block, mined at `CHAIN_SECONDS`; any other request fails. */
function latestBlockRpc() {
  return vi.fn<RpcHandler>(({ method }) => {
    if (method !== "eth_getBlockByNumber") throw new Error(`unexpected ${method}`);
    return { number: "0x10", timestamp: numberToHex(CHAIN_SECONDS), hash: `0x${"cd".repeat(32)}`, transactions: [] };
  });
}

/** The page inside the app's frame, which reads the page chain's latest block for its clock. */
function renderOngoingInFrame(rpc: RpcHandler) {
  return renderWithProviders(<OngoingPage />, { path: "/1/ongoing", frame: "page", deps: createTestDeps({ rpc }) });
}

const NO_ARBITRATOR = "There is no arbitrator on this network, thus no disputes.";
const NO_DISPUTES = "There are no open disputes.";
const FAILED_SCAN: OngoingList = { status: "failed", error: { code: "rpc-error", message: "Could not read the open disputes: getLogs refused" } };
const NO_NETWORK_DATA: OngoingList = { status: "failed", error: { code: "no-rpc", message: "This network's data is unavailable." } };
const CONFIGURATION_WORDING = /RPC|endpoint|configur|REACT_APP/i;
const COUNTDOWN = /^\d{2}d \d{2}h \d{2}m$/;

/** The page's landmark, named by its "Ongoing Disputes" heading. */
function page(): HTMLElement {
  return screen.getByRole("region", { name: "Ongoing Disputes" });
}

/** The subtitle naming the chain whose disputes the page lists. */
function chainSubtitle(chainId: number): string {
  const chain = core.getChain(chainId);
  if (chain === undefined) throw new Error(`Chain ${String(chainId)} is not configured.`);
  return `Open disputes on ${chain.name}, newest first.`;
}

/** Waits until the list has resolved and shows its grid of open disputes. */
async function settledList(): Promise<HTMLElement> {
  return screen.findByRole("list", { name: "Open disputes" });
}

/** The ID a card shows as `#<id>`. */
function shownId(link: HTMLElement): string {
  return /#(\d+)/.exec(link.textContent)?.[1] ?? "";
}

/** The visible cards of disputes whose struct was read; a failed struct's card reads "details unavailable". */
function disputeCards(): HTMLElement[] {
  const list = screen.queryByRole("list", { name: "Open disputes" });
  if (list === null) return [];
  return within(list)
    .queryAllByRole("link")
    .filter((link) => !link.textContent.includes("details unavailable"));
}

function card(id: string): HTMLElement {
  const found = disputeCards().find((link) => shownId(link) === id);
  if (found === undefined) throw new Error(`No card for dispute ${id}.`);
  return found;
}

function cardIds(): string[] {
  return disputeCards().map(shownId);
}

/** The card's ID, drawn as a muted "#" and the number in two spans. */
function cardId(link: HTMLElement, id: string): HTMLElement {
  return within(link).getByText((_, element) => element?.textContent === `#${id}` && element.children.length === 1);
}

/** The arrow at the end of the card's foot, the one icon that moves on hover. */
function arrowIn(container: HTMLElement): Element | null {
  return container.querySelector(".t-learn-chevron");
}

const REVEAL = "animate-[t-reveal-in_var(--reveal-dur)_var(--reveal-ease)_backwards]";

function cardTitle(id: string): HTMLElement {
  return within(card(id)).getByRole("heading", { level: 2 });
}

/** React logs every render error a boundary catches and reports it to the window, where jsdom prints it; both are expected. */
function expectRenderErrors() {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const silence = (event: ErrorEvent) => {
    event.preventDefault();
  };
  window.addEventListener("error", silence);
  onTestFinished(() => {
    window.removeEventListener("error", silence);
  });
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
  vi.useRealTimers();
});

describe("Ongoing page", () => {
  it("a chain without an arbitrator shows the no-arbitrator heading and reads nothing", () => {
    renderOngoing("/137/ongoing");
    expect(screen.getByRole("heading", { name: NO_ARBITRATOR })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Ongoing Disputes" })).toBeNull();
    expect(core.listCourts).not.toHaveBeenCalled();
    expect(core.listOngoingDisputes).not.toHaveBeenCalled();
  });

  it("the list's own no-arbitrator answer shows the same heading", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue({ status: "no-arbitrator" });
    renderOngoing();
    expect(await screen.findByRole("heading", { name: NO_ARBITRATOR })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Ongoing Disputes" })).toBeNull();
  });

  it("the page is loading until the list resolves, after the courts have settled", async () => {
    vi.mocked(core.listOngoingDisputes).mockReturnValue(new Promise<OngoingList>(() => undefined));
    renderOngoing();
    await waitFor(() => {
      expect(core.listOngoingDisputes).toHaveBeenCalled();
    });
    expect(within(page()).getByText(chainSubtitle(1))).toBeInTheDocument();
    expect(within(page()).getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("list", { name: "Open disputes" })).toBeNull();
    expect(screen.queryByText(NO_DISPUTES)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a wallet chain change lists the new chain's open disputes and drops the old chain's cards", async () => {
    vi.mocked(core.listOngoingDisputes).mockImplementation(({ chainId }) => Promise.resolve(chainId === 1 ? listOf([dispute(12n, 0)]) : listOf([dispute(7n, 3)])));
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    renderWithProviders(<OngoingPage />, { path: "/1/ongoing", wallet });
    await settledList();
    expect(within(page()).getByText(chainSubtitle(1))).toBeInTheDocument();
    expect(cardIds()).toEqual(["12"]);

    await act(async () => {
      await wallet.changeChain(100);
    });
    await waitFor(() => {
      expect(within(page()).getByText(chainSubtitle(100))).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(cardIds()).toEqual(["7"]);
    });
    expect(core.listOngoingDisputes).toHaveBeenLastCalledWith(expect.objectContaining({ chainId: 100 }), COURTS.value);
    expect(core.listCourts).toHaveBeenLastCalledWith(expect.objectContaining({ chainId: 100 }));
  });

  it("a failed scan says the disputes failed to load, gives only the reason and offers Try again", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(FAILED_SCAN);
    renderOngoing();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to load disputes.");
    expect(alert).toHaveTextContent("getLogs refused");
    expect(alert).not.toHaveTextContent(/refresh the page/i);
    expect(alert).not.toHaveTextContent(CONFIGURATION_WORDING);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Open disputes" })).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("a network whose data cannot be read says so without naming its configuration", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(NO_NETWORK_DATA);
    renderOngoing();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to load disputes.");
    expect(alert).toHaveTextContent("This network's data is unavailable.");
    expect(alert).not.toHaveTextContent(CONFIGURATION_WORDING);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("Try again reads the open disputes again and shows them once the read succeeds", async () => {
    vi.mocked(core.listOngoingDisputes)
      .mockResolvedValueOnce(FAILED_SCAN)
      .mockResolvedValueOnce(listOf([dispute(3n, 0)]));
    renderOngoing();
    await screen.findByRole("alert");
    expect(core.listOngoingDisputes).toHaveBeenCalledTimes(1);

    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));

    await settledList();
    expect(cardIds()).toEqual(["3"]);
    expect(core.listOngoingDisputes).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("Try again reads the chain time again with the open disputes", async () => {
    vi.mocked(core.listOngoingDisputes)
      .mockResolvedValueOnce(FAILED_SCAN)
      .mockResolvedValueOnce(listOf([dispute(3n, 0)]));
    const rpc = latestBlockRpc();
    renderOngoingInFrame(rpc);
    await screen.findByRole("alert");
    await waitFor(() => {
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));

    await settledList();
    await waitFor(() => {
      expect(rpc).toHaveBeenCalledTimes(2);
    });
    expect(rpc).toHaveBeenLastCalledWith({ chainId: 1, method: "eth_getBlockByNumber", params: ["latest", false] });
  });

  it("an Ongoing card's countdown follows chain time under a skewed browser clock", async () => {
    vi.setSystemTime((CHAIN_SECONDS + HOUR) * 1000);
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(3n, 0, { lastPeriodChange: CHAIN_SECONDS - DAY, countdownTarget: CHAIN_SECONDS + 2 * DAY })]));
    renderOngoingInFrame(latestBlockRpc());
    await settledList();
    await waitFor(() => {
      expect(within(card("3")).getByText(COUNTDOWN)).toHaveTextContent("02d 00h 00m");
    });
  });

  it("with no open dispute the page says so and says where new disputes will show up", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([]));
    renderOngoing();
    expect(await screen.findByText(NO_DISPUTES)).toBeInTheDocument();
    expect(screen.getByText("New disputes on Ethereum Mainnet will show up here.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Open disputes" })).toBeNull();
  });

  it("each card shows its dispute ID and period, newest first, with the title, court and countdown", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(12n, 2, { subcourtId: 2n }), dispute(9n, 0)]));
    titles({ "12": testOkMetaEvidence({ title: "Was the delivery on time?" }), "9": testOkMetaEvidence({ title: "Is the logo original?" }) });
    renderOngoing();
    await settledList();
    expect(cardIds()).toEqual(["12", "9"]);
    await waitFor(() => {
      expect(cardTitle("12")).toHaveTextContent("Was the delivery on time?");
    });
    const twelve = card("12");
    expect(within(twelve).getByText("Voting")).toBeInTheDocument();
    expect(within(card("9")).getByText("Evidence")).toBeInTheDocument();
    expect(within(twelve).getByText("Blockchain")).toBeInTheDocument();
    expect(within(twelve).getByText("Period ends in")).toBeInTheDocument();
    expect(within(twelve).getByText(COUNTDOWN)).toBeInTheDocument();
    expect(cardId(twelve, "12")).toBeInTheDocument();
  });

  it("every card ends in a foot that points at the case, with the countdown and its label when the period end is known", async () => {
    vi.mocked(core.listCourts).mockResolvedValue({ ok: false, error: { code: "rpc-error", message: "down" } });
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(12n, 2), dispute(4n, 0, { countdownTarget: null })]));
    renderOngoing();
    await settledList();
    await waitFor(() => {
      expect(within(card("4")).getByText("Court 0 (unavailable)")).toBeInTheDocument();
    });
    const twelve = card("12");
    expect(within(twelve).getByText("Period ends in")).not.toHaveClass("sr-only");
    const countdown = within(twelve).getByText(COUNTDOWN);
    expect(countdown.tagName).toBe("TIME");
    const foot = countdown.closest("div");
    if (foot === null) throw new Error("No foot around the countdown.");
    expect(arrowIn(foot)).toHaveAttribute("aria-hidden", "true");

    expect(arrowIn(card("4"))).toHaveAttribute("aria-hidden", "true");
    expect(card("4").querySelector("time")).toBeNull();
  });

  it("the court is a plain line with the scales mark, not a stamp", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(12n, 2, { subcourtId: 2n })]));
    renderOngoing();
    await settledList();
    const court = within(card("12")).getByText("Blockchain");
    const line = court.parentElement;
    expect(line?.className).not.toMatch(/rounded-full|\bborder\b/);
    const mark = court.previousElementSibling;
    expect(mark?.tagName.toLowerCase()).toBe("svg");
    expect(mark).toHaveAttribute("aria-hidden", "true");
  });

  it("on hover the card's edge eases on a 200 ms clock and holds still under reduced motion", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(12n, 2)]));
    renderOngoing();
    await settledList();
    const surface = card("12").firstElementChild;
    expect(surface).toHaveClass("transition-[border-color]", "duration-200", "ease-[cubic-bezier(0.22,1,0.36,1)]", "motion-reduce:transition-none");
  });

  it("on hover the card shows only its blue edge, staying flat like the library's cards", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(12n, 2)]));
    renderOngoing();
    await settledList();
    const surface = card("12").firstElementChild;
    expect(surface).toHaveClass("group-hover:border-klerosUIComponentsPrimaryBlue");
    expect([...(surface?.classList ?? [])].filter((name) => name.includes("hover:shadow"))).toEqual([]);
  });

  it("on hover the card's arrow moves forward while its arms spread about the arrow's tip", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(12n, 2)], [11n]));
    renderOngoing();
    await settledList();
    const failed = screen.getByRole("link", { name: /Dispute 11: details unavailable/ });
    for (const link of [card("12"), failed]) {
      expect(link).toHaveClass("t-learn", "group");
      const paths = [...(arrowIn(link)?.querySelectorAll("svg > path") ?? [])];
      expect(paths.map((path) => path.getAttribute("d"))).toEqual(["M3 8h10", "M9 4L13 8", "M13 8L9 12"]);
      expect(paths[1]).toHaveClass("t-learn-arm", "t-learn-arm-top");
      expect(paths[2]).toHaveClass("t-learn-arm", "t-learn-arm-bot");
      for (const arm of paths.slice(1)) expect(arm).toHaveStyle({ transformOrigin: "13px 8px" });
      expect(link.querySelector('[class*="group-hover:translate-x"]')).toBeNull();
    }
  });

  it("the grid and a card's title fade in from their placeholders once they load, and hold still under reduced motion", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(12n, 2, { subcourtId: 2n })]));
    titles({ "12": testOkMetaEvidence({ title: "Was the delivery on time?" }) });
    renderOngoing();
    const grid = await settledList();
    expect(grid).toHaveClass(REVEAL, "motion-reduce:animate-none");
    await waitFor(() => {
      expect(cardTitle("12")).toHaveTextContent("Was the delivery on time?");
    });
    expect(cardTitle("12")).toHaveClass(REVEAL, "motion-reduce:animate-none");
  });

  it("a court already known when its card mounts appears without fading in", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(12n, 2, { subcourtId: 2n })]));
    renderOngoing();
    await settledList();
    expect(within(card("12")).getByText("Blockchain").parentElement).not.toHaveClass(REVEAL);
  });

  it("a title still loading keeps the placeholder pulse and does not fade in yet", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(2n, 0)]));
    renderOngoing();
    await settledList();
    const pending = cardTitle("2");
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(pending).not.toHaveClass(REVEAL);
    expect(pending.querySelector(".animate-loading")).not.toBeNull();
  });

  it("a card is a router link to its case page", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(1665n, 1)]));
    titles({ "1665": testOkMetaEvidence({ title: "Some case" }) });
    renderOngoing("/100/ongoing");
    await settledList();
    expect(card("1665")).toHaveAttribute("href", "/100/cases/1665");
  });

  it("cards render as each dispute resolves, before every title has settled", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(3n, 0), dispute(2n, 0)]));
    titles({ "3": testOkMetaEvidence({ title: "Settled title" }) });
    renderOngoing();
    await settledList();
    await waitFor(() => {
      expect(cardTitle("3")).toHaveTextContent("Settled title");
    });
    const pending = cardTitle("2");
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(pending).toHaveTextContent("Loading the title");
    expect(pending).not.toHaveTextContent("Settled title");
  });

  it("a failed meta-evidence shows the dispute ID with 'title unavailable'", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(77n, 0)]));
    titles({ "77": { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "The meta-evidence did not load in time." } } });
    renderOngoing();
    await settledList();
    await waitFor(() => {
      expect(cardTitle("77")).toHaveTextContent("Dispute 77: title unavailable");
    });
  });

  it("a missing meta-evidence shows 'Meta Evidence Missing'", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(5n, 0)]));
    titles({ "5": { status: "missing" } });
    renderOngoing();
    await settledList();
    await waitFor(() => {
      expect(cardTitle("5")).toHaveTextContent("Meta Evidence Missing");
    });
  });

  it("an accepted meta-evidence with an empty title shows 'Meta Evidence Missing'", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(6n, 0)]));
    titles({ "6": testOkMetaEvidence({ title: "" }) });
    renderOngoing();
    await settledList();
    await waitFor(() => {
      expect(cardTitle("6")).toHaveTextContent("Meta Evidence Missing");
    });
  });

  it("a rejected meta-evidence shows its placeholder title", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(8n, 0)]));
    titles({ "8": { status: "invalid", metaEvidence: testOkMetaEvidence({ title: "Invalid meta-evidence" }).metaEvidence, reason: "uri-not-content-addressed" } });
    renderOngoing();
    await settledList();
    await waitFor(() => {
      expect(cardTitle("8")).toHaveTextContent("Invalid meta-evidence");
    });
  });

  it("the countdown shows whenever the period's end is known, and a passed end as zeros", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(
      listOf([dispute(30n, 0), dispute(20n, 3, { countdownTarget: nowSeconds() - 60 }), dispute(10n, 1, { countdownTarget: null })]),
    );
    renderOngoing();
    await settledList();
    expect(within(card("30")).getByText(COUNTDOWN)).toHaveTextContent(/^01d 23h 59m$|^02d 00h 00m$/);
    expect(within(card("20")).getByText(COUNTDOWN)).toHaveTextContent("00d 00h 00m");
    expect(within(card("10")).queryByText(COUNTDOWN)).toBeNull();
    expect(within(card("10")).queryByText("Period ends in")).toBeNull();
  });

  it("a court whose policy failed shows its ID with 'name unavailable'", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(4n, 0, { subcourtId: 5n })]));
    renderOngoing();
    await settledList();
    expect(within(card("4")).getByText("Court 5 (name unavailable)")).toBeInTheDocument();
  });

  it("a court missing from the court list degrades the badge instead of crashing the card", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(4n, 0, { subcourtId: 99n, countdownTarget: null })]));
    renderOngoing();
    await settledList();
    expect(within(card("4")).getByText("Court 99 (unavailable)")).toBeInTheDocument();
  });

  it("without the court list the cards still render, with the court unavailable", async () => {
    vi.mocked(core.listCourts).mockResolvedValue({ ok: false, error: { code: "rpc-error", message: "down" } });
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(4n, 0, { countdownTarget: null })]));
    renderOngoing();
    await settledList();
    await waitFor(() => {
      expect(within(card("4")).getByText("Court 0 (unavailable)")).toBeInTheDocument();
    });
    expect(within(card("4")).queryByText(COUNTDOWN)).toBeNull();
  });

  it("a dispute whose record could not be read shows its ID, 'details unavailable', an unknown period and the arrow to its case", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(9n, 0)], [11n]));
    renderOngoing();
    await settledList();
    expect(cardIds()).toEqual(["9"]);
    const failed = screen.getByRole("link", { name: /Dispute 11: details unavailable/ });
    expect(failed).toHaveAttribute("href", "/1/cases/11");
    expect(within(failed).getByText("Period unknown")).toBeInTheDocument();
    expect(within(failed).getByText("The arbitrator's record of this dispute could not be read.")).toBeInTheDocument();
    expect(arrowIn(failed)).not.toBeNull();
    const items = within(screen.getByRole("list", { name: "Open disputes" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([expect.stringContaining("#11"), expect.stringContaining("#9")]);
  });

  it("a list holding only failed structs is a list, not empty", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([], [11n]));
    renderOngoing();
    const list = await settledList();
    expect(within(list).getByText(/details unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(NO_DISPUTES)).toBeNull();
  });

  it("the filter defaults to Ongoing (all) and shows only the selected period's cards", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(4n, 3), dispute(3n, 2), dispute(2n, 1), dispute(1n, 0)], [7n]));
    renderOngoing();
    await settledList();
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
    expect(screen.getByRole("list", { name: "Open disputes" })).toBeInTheDocument();
    expect(screen.queryByText(/^No open dispute is in the/)).toBeNull();
  });

  it("a filter with no matching dispute says so", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(1n, 0)]));
    renderOngoing();
    await settledList();
    await chooseFilter("Voting");
    expect(cardIds()).toEqual([]);
    expect(screen.getByText("No open dispute is in the Voting period.")).toBeInTheDocument();
  });

  it("a card whose render throws degrades to its own section, the other cards stay", async () => {
    expectRenderErrors();
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(2n, 0), dispute(1n, 0)]));
    titles({ "1": testOkMetaEvidence({ title: UNRENDERABLE_TITLE }) });
    renderOngoing();
    await settledList();
    expect(card("2")).toBeInTheDocument();
    expect(await screen.findByText("Dispute 1 unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Dispute 1" })).toBeInTheDocument();
  });

  it("Retry resets the card's boundary and reloads its title", async () => {
    expectRenderErrors();
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(1n, 0)]));
    // The first read returns a title the card cannot render; the read Retry starts returns a good one.
    vi.mocked(core.loadMetaEvidence)
      .mockResolvedValueOnce(testOkMetaEvidence({ title: UNRENDERABLE_TITLE }))
      .mockResolvedValueOnce(testOkMetaEvidence({ title: "Recovered dispute" }));
    renderOngoing();
    await settledList();
    expect(await screen.findByText("Dispute 1 unavailable")).toBeInTheDocument();
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(1);

    await userEvent.setup().click(screen.getByRole("button", { name: "Retry Dispute 1" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Recovered dispute" })).toBeInTheDocument();
    expect(cardTitle("1")).toHaveTextContent("Recovered dispute");
    expect(screen.queryByText("Dispute 1 unavailable")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry Dispute 1" })).toBeNull();
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(2);
  });

  it("a Retry whose read is still bad degrades the card again and keeps offering Retry", async () => {
    expectRenderErrors();
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(1n, 0)]));
    titles({ "1": testOkMetaEvidence({ title: UNRENDERABLE_TITLE }) });
    renderOngoing();
    await settledList();
    expect(await screen.findByText("Dispute 1 unavailable")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Retry Dispute 1" }));

    await waitFor(() => {
      expect(core.loadMetaEvidence).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Dispute 1 unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Dispute 1" })).toBeInTheDocument();
  });

  it("the dropdown shows the selected filter's name", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(1n, 0)]));
    renderOngoing();
    await settledList();
    expect(screen.getByRole("button", { name: /period/i })).toHaveTextContent("Ongoing");
    await chooseFilter("Evidence");
    expect(screen.getByRole("button", { name: /period/i })).toHaveTextContent("Evidence");
  });
});

/**
 * The Ongoing page on its own path, and on any other path a stand-in for the page a card opens; Back steps the router's
 * history from anywhere, so a test can leave the page and come back to a fresh mount.
 */
function OngoingWithBack() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      {pathname.endsWith("/ongoing") ? <OngoingPage /> : <p>Case page</p>}
      <button
        type="button"
        onClick={() => {
          void navigate(-1);
        }}
      >
        Back
      </button>
    </>
  );
}

describe("the period filter in the address", () => {
  it("survives opening a case and coming back, and changing it does not add history entries", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(4n, 3), dispute(2n, 1), dispute(1n, 0)]));
    const view = renderWithProviders(<OngoingWithBack />, { path: "/1/ongoing" });
    await settledList();
    await chooseFilter("Appeal");
    await chooseFilter("Commit");
    expect(view.currentPath()).toBe("/1/ongoing?period=commit");
    expect(cardIds()).toEqual(["2"]);

    const user = userEvent.setup();
    await user.click(card("2"));
    expect(await screen.findByText("Case page")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    await settledList();
    expect(view.currentPath()).toBe("/1/ongoing?period=commit");
    expect(screen.getByRole("button", { name: /period/i })).toHaveTextContent("Commit");
    expect(cardIds()).toEqual(["2"]);

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(view.currentPath()).toBe("/1/ongoing?period=commit");
  });

  it("an address that names a period opens the page filtered to it", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(4n, 3), dispute(3n, 2), dispute(1n, 0)]));
    renderOngoing("/1/ongoing?period=voting");
    await settledList();
    expect(screen.getByRole("button", { name: /period/i })).toHaveTextContent("Voting");
    expect(cardIds()).toEqual(["3"]);
  });

  it("an unknown period in the address reads as every open dispute", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(4n, 3), dispute(1n, 0)], [7n]));
    renderOngoing("/1/ongoing?period=bogus");
    await settledList();
    expect(screen.getByRole("button", { name: /period/i })).toHaveTextContent("Ongoing");
    expect(cardIds()).toEqual(["4", "1"]);
    expect(screen.getByText(/Dispute 7: details unavailable/)).toBeInTheDocument();
  });

  it("choosing Ongoing drops the period from the address and keeps the other parameters", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([dispute(4n, 3), dispute(1n, 0)]));
    const view = renderOngoing("/1/ongoing?period=appeal&ref=home");
    await settledList();
    await chooseFilter("Ongoing");
    expect(view.currentPath()).toBe("/1/ongoing?ref=home");
    expect(cardIds()).toEqual(["4", "1"]);
  });
});

describe("the other chain's disputes from the zero state", () => {
  beforeEach(() => {
    vi.mocked(core.listOngoingDisputes).mockImplementation(({ chainId }) => Promise.resolve(chainId === 100 ? listOf([dispute(7n, 3)]) : listOf([])));
  });

  it("without a wallet, the action moves the page to Gnosis Network's Ongoing page", async () => {
    const view = renderOngoing("/1/ongoing");
    const action = await screen.findByRole("button", { name: "View disputes on Gnosis Network" });

    await userEvent.setup().click(action);

    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/ongoing");
    });
    await settledList();
    expect(cardIds()).toEqual(["7"]);
    expect(view.wallet.modal?.openConnect).not.toHaveBeenCalled();
  });

  it("on Gnosis Network it offers Ethereum Mainnet", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([]));
    renderOngoing("/100/ongoing");
    expect(await screen.findByText("New disputes on Gnosis Network will show up here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View disputes on Ethereum Mainnet" })).toBeInTheDocument();
  });

  it("on a testnet page it offers Ethereum Mainnet", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([]));
    renderOngoing("/11155111/ongoing");
    expect(await screen.findByText("New disputes on Ethereum Testnet Sepolia will show up here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View disputes on Ethereum Mainnet" })).toBeInTheDocument();
  });

  it("the action's label wraps inside the empty state instead of widening a narrow page", async () => {
    vi.mocked(core.listOngoingDisputes).mockResolvedValue(listOf([]));
    renderOngoing("/11155111/ongoing");
    const action = await screen.findByRole("button", { name: "View disputes on Ethereum Mainnet" });
    expect(action).toHaveClass("h-auto", "max-w-full", "[&_p]:whitespace-normal");
  });

  it("with a wallet connected, the action asks the wallet to switch and the page follows it", async () => {
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    const view = renderWithProviders(<OngoingPage />, { path: "/1/ongoing", wallet });
    const action = await screen.findByRole("button", { name: "View disputes on Gnosis Network" });

    await userEvent.setup().click(action);

    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/ongoing");
    });
    expect(within(page()).getByText(chainSubtitle(100))).toBeInTheDocument();
    await settledList();
    expect(cardIds()).toEqual(["7"]);
  });

  it("names the action while the wallet has not answered its switch, though the library hides the button's text while loading", async () => {
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    holdChainSwitches(wallet);
    renderWithProviders(<OngoingPage />, { path: "/1/ongoing", wallet });

    await userEvent.setup().click(await screen.findByRole("button", { name: "View disputes on Gnosis Network" }));

    const pending = await screen.findByRole("button", { name: "Switching to Gnosis Network" });
    expect(pending).toHaveAttribute("aria-label", "Switching to Gnosis Network");
    expect(pending).toBeDisabled();
  });

  it("a switch the wallet declines leaves the page where it is and says so", async () => {
    const wallet = createTestWallet({ chainId: 1, switchChainError: true });
    await wallet.connect();
    const view = renderWithProviders(<OngoingPage />, { path: "/1/ongoing", wallet });
    const action = await screen.findByRole("button", { name: "View disputes on Gnosis Network" });

    await userEvent.setup().click(action);

    expect(await screen.findByRole("alert")).toHaveTextContent("The switch to Gnosis Network was declined in the wallet.");
    expect(view.currentPath()).toBe("/1/ongoing");
    expect(screen.getByText(NO_DISPUTES)).toBeInTheDocument();
  });
});
