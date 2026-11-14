import {
  BodyTooLargeError,
  FIRST_EVIDENCE_PAGE,
  loadEvidencePage,
  resolveGateway,
  type Address,
  type EvidenceList,
  type EvidenceLog,
  type Fetcher,
  type FetchResponse,
  type Hex,
  type Outcome,
} from "@dispute-resolver/core";
import { skipToken, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys, type CaseDispute } from "../../data";
import { createTestDeps, sectionReady, testCaseDispute, testChain, testDisputeEvent, testFamily, testFoundLookup, testWriteContext } from "../../test/data";
import { renderWithProviders } from "../../test/shell";
import { shortenAddress } from "../../ui";
import { EvidenceSection } from "./EvidenceSection";

const CHAIN = testChain(1);
const GATEWAY = resolveGateway({});
const CID = "QmPiLHsHHhzfWDaSYWXjaANAJyY2hU9VBPt7Txc94SCTsA";
const SUBMITTER: Address = "0x1111111111111111111111111111111111111111";
const RAISED_AT = 1_700_000_000;
const EVIDENCE_KEY = queryKeys.evidence(1, 1n, testFoundLookup().binding.arbitrated, 1n);

/** Entry `n` (from 0, chain order) is block `100 + n` unless `blocks` says otherwise; its document is titled "Entry n". */
function evidenceLogs(count: number, blocks: (index: number) => number = (index) => 100 + index): EvidenceLog[] {
  const logIndexInBlock = new Map<number, number>();
  return Array.from({ length: count }, (_, index) => {
    const block = blocks(index);
    const logIndex = logIndexInBlock.get(block) ?? 0;
    logIndexInBlock.set(block, logIndex + 1);
    return {
      blockNumber: BigInt(block),
      logIndex,
      transactionHash: `0x${index.toString(16).padStart(64, "0")}`,
      decoded: { evidenceUri: `/ipfs/${CID}/${String(index)}`, submitter: SUBMITTER },
    };
  });
}

function documentUrl(index: number): string {
  return `${GATEWAY}/ipfs/${CID}/${String(index)}`;
}

function indexOf(url: string): number {
  return Number(url.slice(url.lastIndexOf("/") + 1));
}

function answer(body: unknown): FetchResponse {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

interface Reads {
  readonly fetched: string[];
  readonly fetcher: Fetcher;
  /** Block reads fail while set. */
  failBlocks: boolean;
  /** Document fetches wait for it while set. */
  hold: Promise<void> | null;
  readonly rpc: (request: { readonly method: string; readonly params: unknown }) => unknown;
}

function reads(tooLarge: ReadonlySet<number> = new Set(), refused: ReadonlySet<number> = new Set()): Reads {
  const state: Reads = {
    fetched: [],
    failBlocks: false,
    hold: null,
    fetcher: async (url) => {
      state.fetched.push(url);
      await state.hold;
      const index = indexOf(url);
      if (tooLarge.has(index)) throw new BodyTooLargeError(65_536);
      if (refused.has(index)) return { ...answer({}), ok: false, status: 500 };
      return answer({ name: `Entry ${String(index)}` });
    },
    rpc: ({ method, params }) => {
      if (method !== "eth_getBlockByNumber") throw new Error(`Unexpected RPC request ${method}.`);
      if (state.failBlocks) throw new Error("block read refused");
      const [number] = params as [Hex];
      return { number, timestamp: `0x${(BigInt(number) * 10n + 1_700_000_000n).toString(16)}`, hash: `0x${"cd".repeat(32)}` };
    },
  };
  return state;
}

/** The evidence `loadEvidence` would hand the section: every log, and the documents of the first page. */
async function firstPage(logs: readonly EvidenceLog[], read: Reads): Promise<EvidenceList> {
  const deps = createTestDeps({ rpc: read.rpc, fetcher: read.fetcher });
  const client = deps.getReadClient(1);
  if (client === undefined) throw new Error("The test chain has no read client.");
  const outcome = await loadEvidencePage({ client, fetcher: read.fetcher, gateway: GATEWAY }, logs, FIRST_EVIDENCE_PAGE);
  if (!outcome.ok) throw new Error(outcome.error.message);
  read.fetched.length = 0;
  return outcome.value;
}

function dispute(evidence: CaseDispute["evidence"]): CaseDispute {
  return testCaseDispute({
    lookup: sectionReady(testFoundLookup()),
    family: sectionReady(testFamily()),
    disputeEvent: sectionReady(testDisputeEvent({ evidenceGroupId: 1n, blockNumber: 90n, createdAt: RAISED_AT })),
    evidence,
    appealDecisions: sectionReady([]),
    write: sectionReady(testWriteContext()),
  });
}

const held: { client: QueryClient | null } = { client: null };

/** The section over the evidence query, as the case page builds it, so a page read lands where it shows. */
function LiveSection({ initial }: { readonly initial: EvidenceList }) {
  const client = useQueryClient();
  useState(() => {
    held.client = client;
    const seeded: Outcome<EvidenceList> = { ok: true, value: initial };
    client.setQueryData(EVIDENCE_KEY, seeded);
    return null;
  });
  const query = useQuery<Outcome<EvidenceList>>({ queryKey: EVIDENCE_KEY, queryFn: skipToken });
  const value = query.data?.ok === true ? query.data.value : initial;
  return <EvidenceSection dispute={dispute(sectionReady(value))} chain={CHAIN} />;
}

interface LiveOptions {
  readonly blocks?: (index: number) => number;
  readonly tooLarge?: ReadonlySet<number>;
  /** Documents the gateway refuses. */
  readonly refused?: ReadonlySet<number>;
}

async function renderLive(count: number, options: LiveOptions = {}) {
  const read = reads(options.tooLarge, options.refused);
  const initial = await firstPage(evidenceLogs(count, options.blocks), read);
  renderWithProviders(<LiveSection initial={initial} />, { deps: createTestDeps({ rpc: read.rpc, fetcher: read.fetcher }) });
  return { read, user: userEvent.setup() };
}

function heldList(): EvidenceList {
  const data = held.client?.getQueryData<Outcome<EvidenceList>>(EVIDENCE_KEY);
  if (data?.ok !== true) throw new Error("The evidence query holds no list.");
  return data.value;
}

function titles(): string[] {
  const timeline = screen.getByRole("list", { name: "Evidence timeline" });
  return within(timeline)
    .getAllByRole("listitem")
    .map((row) => within(row).queryByRole("heading", { level: 3 })?.textContent ?? within(row).getByText(/Dispute Raised|Appealed/).textContent);
}

function entryTitles(from: number, to: number): string[] {
  return Array.from({ length: to - from }, (_, offset) => `Entry ${String(from + offset)}`);
}

function pager(position: "top" | "bottom"): HTMLElement {
  return screen.getByRole("navigation", { name: `Evidence pages, ${position}` });
}

function announcement(): string {
  const region = document.querySelector('p[aria-live="polite"]');
  if (region === null) throw new Error("No announcement region.");
  return region.textContent;
}

async function chooseOrder(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: /order/i }));
  await user.click(await screen.findByRole("option", { name }));
}

/** jsdom lays nothing out and has no scrollIntoView. */
const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>();

beforeEach(() => {
  held.client = null;
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  scrollIntoView.mockReset();
});

describe("EvidenceSection: order", () => {
  it("one entry has no Order dropdown", async () => {
    await renderLive(1);
    expect(screen.queryByRole("button", { name: /order/i })).toBeNull();
  });

  it("two entries show the Order dropdown, named Order without a visible label, set to Newest first", async () => {
    await renderLive(2);
    const select = screen.getByRole("button", { name: /order/i });
    expect(select).toHaveTextContent("Newest first");
    expect(screen.queryByText("Order")).toBeNull();
  });

  it("on one page Oldest first puts Dispute Raised first, reads nothing and is announced", async () => {
    const { read, user } = await renderLive(3);
    expect(titles()).toEqual(["Entry 2", "Entry 1", "Entry 0", "Dispute Raised"]);
    await chooseOrder(user, "Oldest first");
    expect(titles()).toEqual(["Dispute Raised", "Entry 0", "Entry 1", "Entry 2"]);
    expect(read.fetched).toEqual([]);
    expect(announcement()).toBe("Oldest first. Entries 1–3 of 3 shown.");
  });

  it("Oldest first on many pages opens page 1 with Dispute Raised, then the oldest entries in chain order, a shared block kept in chain order", async () => {
    const { read, user } = await renderLive(120, { blocks: (index) => (index < 3 ? 100 : 100 + index) });
    await chooseOrder(user, "Oldest first");
    await waitFor(() => {
      expect(titles().slice(0, 5)).toEqual(["Dispute Raised", "Entry 0", "Entry 1", "Entry 2", "Entry 3"]);
    });
    expect(titles()).toHaveLength(51);
    expect(read.fetched.map(indexOf).sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, index) => index));
    expect(within(pager("top")).getByText("Entries 1–50 of 120")).toBeInTheDocument();
    expect(announcement()).toBe("Oldest first. Entries 1–50 of 120 shown.");
  });
});

describe("EvidenceSection: pages", () => {
  it("50 entries show every entry with no count and no page numbers", async () => {
    await renderLive(50);
    expect(titles()).toEqual([...entryTitles(0, 50).reverse(), "Dispute Raised"]);
    expect(screen.queryByRole("navigation", { name: /Evidence pages/ })).toBeNull();
    expect(screen.queryByText(/^Entries /)).toBeNull();
  });

  it("51 entries show the count and the page numbers above and below the list, in two navigations named apart", async () => {
    await renderLive(51);
    expect(within(pager("top")).getByText("Entries 1–50 of 51")).toBeInTheDocument();
    expect(within(pager("bottom")).getByText("Entries 1–50 of 51")).toBeInTheDocument();
    expect(within(pager("top")).getByRole("button", { name: "Page 2" })).toBeInTheDocument();
    expect(titles()).toEqual(entryTitles(1, 51).reverse());
  });

  it("names the arrows and the page buttons of both navigations, and marks the page shown as current", async () => {
    const { user } = await renderLive(120);
    for (const position of ["top", "bottom"] as const) {
      const nav = pager(position);
      expect(within(nav).getByRole("button", { name: "Previous page" })).toBeDisabled();
      expect(within(nav).getByRole("button", { name: "Next page" })).toBeEnabled();
      expect(within(nav).getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("button", { name: "Page 2" })).not.toHaveAttribute("aria-current");
    }
    await user.click(within(pager("top")).getByRole("button", { name: "Page 2" }));
    await waitFor(() => {
      expect(titles()).toEqual(entryTitles(20, 70).reverse());
    });
    for (const position of ["top", "bottom"] as const) {
      expect(within(pager(position)).getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
      expect(within(pager(position)).getByRole("button", { name: "Page 1" })).not.toHaveAttribute("aria-current");
    }
  });

  it("a top arrow that reaches the last page, and so turns itself off, moves focus to the start of that page", async () => {
    const { user } = await renderLive(120);
    const next = within(pager("top")).getByRole("button", { name: "Next page" });
    await user.click(next);
    await waitFor(() => {
      expect(titles()).toEqual(entryTitles(20, 70).reverse());
    });
    expect(next).toHaveFocus();
    await user.click(next);
    await waitFor(() => {
      expect(titles()).toEqual([...entryTitles(0, 20).reverse(), "Dispute Raised"]);
    });
    expect(next).toBeDisabled();
    expect(document.activeElement?.contains(screen.getByRole("list", { name: "Evidence timeline" }))).toBe(true);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("opening page 2 from the top reads only that page's documents, drops the first page's and keeps focus on the pressed page", async () => {
    const { read, user } = await renderLive(120);
    const pressed = within(pager("top")).getByRole("button", { name: "Page 2" });
    await user.click(pressed);
    await waitFor(() => {
      expect(titles()).toEqual(entryTitles(20, 70).reverse());
    });
    expect(within(pager("top")).getByText("Entries 51–100 of 120")).toBeInTheDocument();
    expect(read.fetched.map(indexOf).sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, offset) => 20 + offset));
    const list = heldList();
    expect(list.page).toEqual({ order: "newest", page: 2 });
    expect(list.entries).toHaveLength(50);
    expect(list.entries.every((entry) => entry.blockNumber < 170n)).toBe(true);
    expect(pressed).toHaveFocus();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(announcement()).toBe("Entries 51–100 of 120 shown.");
  });

  it("a page the held documents already cover is shown without a read and becomes the page a refresh reads", async () => {
    const { read, user } = await renderLive(100);
    await user.click(within(pager("top")).getByRole("button", { name: "Page 2" }));
    await waitFor(() => {
      expect(titles()).toEqual([...entryTitles(0, 50).reverse(), "Dispute Raised"]);
    });
    read.fetched.length = 0;
    await chooseOrder(user, "Oldest first");
    expect(titles()).toEqual(["Dispute Raised", ...entryTitles(0, 50)]);
    expect(read.fetched).toEqual([]);
    await waitFor(() => {
      expect(heldList().page).toEqual({ order: "oldest", page: 1 });
    });
  });

  it("a page opened from the bottom numbers moves focus to the start of that page and brings the top numbers into view", async () => {
    const { user } = await renderLive(120);
    await user.click(within(pager("bottom")).getByRole("button", { name: "Page 3" }));
    await waitFor(() => {
      expect(titles()).toEqual([...entryTitles(0, 20).reverse(), "Dispute Raised"]);
    });
    const focused = document.activeElement;
    expect(focused?.contains(screen.getByRole("list", { name: "Evidence timeline" }))).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(pager("top"));
  });

  it("a page that fails to load says so in the list with Retry, is announced, and keeps the pages; Retry loads it", async () => {
    const { read, user } = await renderLive(120);
    read.failBlocks = true;
    await user.click(within(pager("top")).getByRole("button", { name: "Page 2" }));
    expect(await screen.findByText("Evidence page unavailable")).toBeInTheDocument();
    expect(announcement()).toBe("Entries 51–100 of 120 could not be loaded.");
    expect(pager("top")).toBeInTheDocument();
    expect(pager("bottom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /order/i })).toBeInTheDocument();

    read.failBlocks = false;
    await user.click(screen.getByRole("button", { name: "Retry Evidence page" }));
    await waitFor(() => {
      expect(titles()).toEqual(entryTitles(20, 70).reverse());
    });
    expect(announcement()).toBe("Entries 51–100 of 120 shown.");
    const page = screen.getByRole("list", { name: "Evidence timeline" }).closest('[tabindex="-1"]');
    expect(page).not.toBeNull();
    expect(page).toHaveFocus();
  });

  it("a page that failed to load is read again when the visitor comes back to it", async () => {
    const { read, user } = await renderLive(120);
    read.failBlocks = true;
    await user.click(within(pager("top")).getByRole("button", { name: "Page 2" }));
    expect(await screen.findByText("Evidence page unavailable")).toBeInTheDocument();

    await user.click(within(pager("top")).getByRole("button", { name: "Page 1" }));
    expect(titles()).toEqual(entryTitles(70, 120).reverse());
    read.failBlocks = false;
    await user.click(within(pager("top")).getByRole("button", { name: "Page 2" }));
    await waitFor(() => {
      expect(titles()).toEqual(entryTitles(20, 70).reverse());
    });
    expect(screen.queryByText("Evidence page unavailable")).toBeNull();
  });

  it("a page whose documents the gateway refuses is announced with how many of its entries are hidden", async () => {
    const refused = new Set(Array.from({ length: 10 }, (_, offset) => 20 + offset));
    const { user } = await renderLive(120, { refused });
    await user.click(within(pager("top")).getByRole("button", { name: "Page 2" }));
    await waitFor(() => {
      expect(titles()).toEqual(entryTitles(30, 70).reverse());
    });
    expect(screen.getByText("Hidden evidence")).toBeInTheDocument();
    expect(announcement()).toBe("Entries 51–100 of 120 shown. 10 evidence items hidden: could not be fetched.");
  });

  it("a page loading shows the loading state between the page numbers", async () => {
    const { read, user } = await renderLive(120);
    let release = (): void => undefined;
    read.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await user.click(within(pager("top")).getByRole("button", { name: "Page 2" }));
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("list", { name: "Evidence timeline" })).toBeNull();
    expect(pager("bottom")).toBeInTheDocument();
    release();
    await waitFor(() => {
      expect(titles()).toEqual(entryTitles(20, 70).reverse());
    });
  });
});

describe("EvidenceSection: a document over 64 KB", () => {
  it("keeps its place with who, when and a new-tab link to open the file", async () => {
    await renderLive(3, { tooLarge: new Set([1]) });
    expect(titles()).toEqual(["Entry 2", "This evidence file is too large to show here.", "Entry 0", "Dispute Raised"]);
    const row = screen.getByRole("heading", { level: 3, name: "This evidence file is too large to show here." }).closest("article");
    if (row === null) throw new Error("The too-large entry has no article.");
    expect(within(row).getByText(shortenAddress(SUBMITTER))).toBeInTheDocument();
    expect(within(row).getByText(new Date((101 * 10 + 1_700_000_000) * 1000).toUTCString())).toBeInTheDocument();
    const link = within(row).getByRole("link", { name: /Open the file/ });
    expect(link).toHaveAttribute("href", documentUrl(1));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByText("Hidden evidence")).toBeNull();
  });
});
