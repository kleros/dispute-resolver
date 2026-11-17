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
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys, type CaseDispute } from "../../data";
import { createTestDeps, sectionReady, testCaseDispute, testChain, testDisputeEvent, testFamily, testFoundLookup, testWriteContext } from "../../test/data";
import { renderWithProviders } from "../../test/shell";
import { shortenAddress } from "../../ui";
import { EvidenceSection } from "./EvidenceSection";
import { plainAddress } from "./plainAddress";

vi.mock("./plainAddress", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./plainAddress")>();
  return { ...actual, plainAddress: vi.fn(actual.plainAddress) };
});

const CHAIN = testChain(1);
const GATEWAY = resolveGateway({});
const CID = "QmPiLHsHHhzfWDaSYWXjaANAJyY2hU9VBPt7Txc94SCTsA";
const SUBMITTER: Address = "0x1111111111111111111111111111111111111111";
const RAISED_AT = 1_700_000_000;
const EVIDENCE_KEY = queryKeys.evidence(1, 1n, testFoundLookup().binding.arbitrated, 1n);
const TOO_LARGE = "This evidence is too large to show here.";
const DID_NOT_LOAD = "This evidence did not load.";
const NOT_EVIDENCE = "Not in the evidence format.";
const NOT_ADDRESSED = "What was submitted is not an IPFS file:";
const UNREADABLE = "This entry could not be read.";
const COPY = "Copy the submitted text";

interface LogOptions {
  readonly blocks?: (index: number) => number;
  /** Another `_evidence` for an entry, or `null` for one whose data does not decode. */
  readonly addresses?: ReadonlyMap<number, string | null>;
  /** Entries whose `_party` does not decode either. */
  readonly withoutParty?: ReadonlySet<number>;
}

/** Entry `n` (from 0, chain order) is block `100 + n` unless `blocks` says otherwise; its document is titled "Entry n". */
function evidenceLogs(count: number, { blocks = (index) => 100 + index, addresses = new Map(), withoutParty = new Set() }: LogOptions = {}): EvidenceLog[] {
  const logIndexInBlock = new Map<number, number>();
  return Array.from({ length: count }, (_, index) => {
    const block = blocks(index);
    const logIndex = logIndexInBlock.get(block) ?? 0;
    logIndexInBlock.set(block, logIndex + 1);
    const address = addresses.get(index);
    const party = withoutParty.has(index) ? null : SUBMITTER;
    return {
      blockNumber: BigInt(block),
      logIndex,
      transactionHash: `0x${index.toString(16).padStart(64, "0")}`,
      party,
      decoded: address === null || party === null ? null : { evidenceUri: address ?? `/ipfs/${CID}/${String(index)}`, submitter: party },
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

/** Documents the gateway answers otherwise than with an evidence document titled "Entry n". */
interface Documents {
  readonly tooLarge?: Set<number>;
  /** Refused by the gateway. */
  readonly refused?: Set<number>;
  readonly notJson?: ReadonlySet<number>;
  /** JSON that is not an evidence document. */
  readonly notEvidence?: ReadonlySet<number>;
}

interface Reads {
  /** Every document fetch, the first page's included. */
  readonly everFetched: string[];
  /** The fetches since the first page. */
  readonly fetched: string[];
  readonly fetcher: Fetcher;
  /** Block reads fail while set. */
  failBlocks: boolean;
  /** Document fetches wait for it while set. */
  hold: Promise<void> | null;
  /** The documents the gateway refuses, and those it answers as over the cap; a test may change them. */
  readonly refused: Set<number>;
  readonly tooLarge: Set<number>;
  readonly rpc: (request: { readonly method: string; readonly params: unknown }) => unknown;
}

function notJsonAnswer(): FetchResponse {
  return { ok: true, status: 200, json: () => Promise.reject(new SyntaxError("Unexpected token % in JSON")), text: () => Promise.resolve("%PDF-1.4") };
}

function reads({ tooLarge = new Set(), refused = new Set(), notJson = new Set(), notEvidence = new Set() }: Documents = {}): Reads {
  const state: Reads = {
    everFetched: [],
    fetched: [],
    failBlocks: false,
    hold: null,
    refused,
    tooLarge,
    fetcher: async (url) => {
      state.everFetched.push(url);
      state.fetched.push(url);
      await state.hold;
      const index = indexOf(url);
      if (state.tooLarge.has(index)) throw new BodyTooLargeError(65_536);
      if (state.refused.has(index)) return { ...answer({}), ok: false, status: 500 };
      if (notJson.has(index)) return notJsonAnswer();
      return answer(notEvidence.has(index) ? [1, 2] : { name: `Entry ${String(index)}` });
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

interface LiveOptions extends Documents, LogOptions {}

async function renderLive(count: number, options: LiveOptions = {}) {
  const read = reads(options);
  const initial = await firstPage(evidenceLogs(count, options), read);
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

  it("a page whose documents the gateway refuses gives each of them a row in its place saying it did not load, and is announced as shown", async () => {
    const refused = new Set(Array.from({ length: 10 }, (_, offset) => 20 + offset));
    const { user } = await renderLive(120, { refused });
    await user.click(within(pager("top")).getByRole("button", { name: "Page 2" }));
    await waitFor(() => {
      expect(titles()).toEqual([...entryTitles(30, 70).reverse(), ...Array.from({ length: 10 }, () => DID_NOT_LOAD)]);
    });
    expect(screen.queryByText("Hidden evidence")).toBeNull();
    expect(announcement()).toBe("Entries 51–100 of 120 shown.");
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
    expect(titles()).toEqual(["Entry 2", TOO_LARGE, "Entry 0", "Dispute Raised"]);
    const row = screen.getByRole("heading", { level: 3, name: TOO_LARGE }).closest("article");
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

/** The entry whose heading is `heading`, the `nth` of them from the top. */
function row(heading: string, nth = 0): HTMLElement {
  const article = screen.getAllByRole("heading", { level: 3, name: heading })[nth]?.closest("article");
  if (article === null || article === undefined) throw new Error(`No entry headed ${heading}.`);
  return article;
}

function blockTime(index: number): string {
  return new Date(((100 + index) * 10 + 1_700_000_000) * 1000).toUTCString();
}

/** A row's own buttons and links, without the submitter's explorer link and copy button that every entry has. */
function controls(article: HTMLElement): string[] {
  const submitter = within(article).getByText("Submitted by").parentElement;
  return [...article.querySelectorAll("button, a")]
    .filter((control) => submitter?.contains(control) !== true)
    .map((control) => `${control.tagName === "A" ? "link" : "button"}: ${control.getAttribute("aria-label") ?? control.textContent.trim()}`);
}

/** Holds every document fetch until the returned function is called. */
function holdFetches(read: Reads): () => void {
  let release = (): void => undefined;
  read.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    read.hold = null;
    release();
  };
}

function tryAgainButton(nth = 0): HTMLElement {
  return within(row(DID_NOT_LOAD, nth)).getByRole("button", { name: "Try again" });
}

describe("EvidenceSection: every evidence entry gets a row", () => {
  const MIXED: LiveOptions = {
    refused: new Set([1]),
    notJson: new Set([2]),
    addresses: new Map([
      [3, "https://example.org/evidence.json"],
      [4, null],
    ]),
    notEvidence: new Set([5]),
  };

  it("each entry keeps its own row in its place in both orders, with no notice: rows equal the page's logs", async () => {
    const { user } = await renderLive(7, MIXED);
    expect(titles()).toEqual(["Entry 6", NOT_EVIDENCE, UNREADABLE, NOT_ADDRESSED, NOT_EVIDENCE, DID_NOT_LOAD, "Entry 0", "Dispute Raised"]);
    expect(within(screen.getByRole("list", { name: "Evidence timeline" })).getAllByRole("article")).toHaveLength(7);
    expect(screen.queryByText(/hidden/i)).toBeNull();

    await chooseOrder(user, "Oldest first");
    expect(titles()).toEqual(["Dispute Raised", "Entry 0", DID_NOT_LOAD, NOT_EVIDENCE, NOT_ADDRESSED, UNREADABLE, NOT_EVIDENCE, "Entry 6"]);
    expect(announcement()).toBe("Oldest first. Entries 1–7 of 7 shown.");
  });

  it("each row that shows no document says why in plain words", async () => {
    await renderLive(6, {
      refused: new Set([0]),
      tooLarge: new Set([1]),
      notJson: new Set([2]),
      addresses: new Map([
        [3, "https://example.org/evidence.json"],
        [4, null],
      ]),
    });
    expect(titles()).toEqual([
      "Entry 5",
      "This entry could not be read.",
      "What was submitted is not an IPFS file:",
      "Not in the evidence format.",
      "This evidence is too large to show here.",
      "This evidence did not load.",
      "Dispute Raised",
    ]);
  });

  it("each row has who and when, and only its own controls: Try again and Open the file for a file that did not load, Open the file for one not in the evidence format, Copy for text submitted in place of a file, none otherwise", async () => {
    await renderLive(7, MIXED);
    const expected: [string, number, number, string[]][] = [
      [DID_NOT_LOAD, 0, 1, ["button: Try again", "link: Open the file"]],
      [NOT_EVIDENCE, 1, 2, ["link: Open the file"]],
      [NOT_EVIDENCE, 0, 5, ["link: Open the file"]],
      [NOT_ADDRESSED, 0, 3, [`button: ${COPY}`]],
      [UNREADABLE, 0, 4, []],
    ];
    for (const [heading, nth, index, own] of expected) {
      const article = row(heading, nth);
      expect(within(article).getByText(shortenAddress(SUBMITTER))).toBeInTheDocument();
      expect(within(article).getByText(blockTime(index))).toBeInTheDocument();
      expect(controls(article)).toEqual(own);
      const link = within(article).queryByRole("link", { name: /Open the file/ });
      if (link !== null) {
        expect(link).toHaveAttribute("href", documentUrl(index));
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
      }
    }
  });

  it("what was submitted in place of a file follows the heading as plain text, never a link and never fetched, its marks replaced, cut at 200 characters until Show all shows all of it", async () => {
    const address = `https://example.org/\u202Eevidence.json\u2066${"x".repeat(300_000)}`;
    const { read, user } = await renderLive(3, { addresses: new Map([[1, address]]) });
    const article = row(NOT_ADDRESSED);
    const marked = "https://example.org/\uFFFDevidence.json\uFFFD";
    const text = within(article).getByText(`${marked}${"x".repeat(200 - marked.length)}…`);
    expect(text.closest("a")).toBeNull();
    expect(article.querySelector('a[href*="example.org"]')).toBeNull();
    expect(article.innerHTML).not.toMatch(/[\u202E\u2066]/);

    await user.click(within(article).getByRole("button", { name: "Show all" }));
    expect(
      within(article)
        .getByText(`${marked}${"x".repeat(300_000)}`)
        .closest("a"),
    ).toBeNull();
    expect(article.innerHTML).not.toMatch(/[\u202E\u2066]/);
    expect(new Set(read.everFetched)).toEqual(new Set([documentUrl(0), documentUrl(2)]));
    expect(read.everFetched).toHaveLength(2);
  });

  it("line breaks in what was submitted show as one space", async () => {
    await renderLive(2, { addresses: new Map([[1, "I sent the file\r\n\r\nto the court\tyesterday"]]) });
    expect(within(row(NOT_ADDRESSED)).getByText("I sent the file to the court yesterday")).toBeInTheDocument();
  });

  it("Show all shows all of what was submitted in a box with a visible edge that scrolls and takes focus, and Show less cuts it again", async () => {
    const { user } = await renderLive(2, { addresses: new Map([[1, `${"a".repeat(250)}\n${"b".repeat(50)}`]]) });
    const article = row(NOT_ADDRESSED);
    const cut = `${"a".repeat(200)}…`;
    expect(within(article).getByText(cut)).not.toHaveAttribute("tabindex");
    const toggle = within(article).getByRole("button", { name: "Show all" });

    await user.click(toggle);
    const box = within(article).getByText(`${"a".repeat(250)} ${"b".repeat(50)}`);
    expect(box).toHaveAttribute("tabindex", "0");
    expect(box).toHaveClass("border", "border-klerosUIComponentsStroke", "rounded-base", "max-h-64", "overflow-y-auto");
    expect(within(article).queryByText(cut)).toBeNull();
    expect(toggle).toHaveAccessibleName("Show less");
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    expect(within(article).getByText(cut)).not.toHaveAttribute("tabindex");
    expect(toggle).toHaveAccessibleName("Show all");
  });

  it("Show all and Show less say whether all of what was submitted is shown, and name the box they open and close", async () => {
    const { user } = await renderLive(2, { addresses: new Map([[1, "a".repeat(250)]]) });
    const article = row(NOT_ADDRESSED);
    const toggle = within(article).getByRole("button", { name: "Show all" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const controlled = toggle.getAttribute("aria-controls") ?? "";
    expect(within(article).getByText(`${"a".repeat(200)}…`)).toHaveAttribute("id", controlled);

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(article).getByText("a".repeat(250))).toHaveAttribute("id", controlled);
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("a long submitted value is read only as far as its first 200 characters until Show all or the copy control asks for all of it", async () => {
    const address = `x${"\u202E\u200B".repeat(100_000)}`;
    const whole = `x${"\uFFFD".repeat(200_000)}`;
    const read = vi.mocked(plainAddress);
    read.mockClear();
    const { user } = await renderLive(3, {
      addresses: new Map([
        [1, address],
        [2, address],
      ]),
    });
    expect(within(row(NOT_ADDRESSED, 0)).getByText(`x${"\uFFFD".repeat(199)}…`)).toBeInTheDocument();
    expect(within(row(NOT_ADDRESSED, 1)).getByText(`x${"\uFFFD".repeat(199)}…`)).toBeInTheDocument();
    expect(Math.max(0, ...read.mock.calls.map(([input]) => input.length))).toBeLessThanOrEqual(201);

    await user.click(within(row(NOT_ADDRESSED, 0)).getByRole("button", { name: "Show all" }));
    expect(within(row(NOT_ADDRESSED, 0)).getByText(whole)).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith(address);

    await user.click(within(row(NOT_ADDRESSED, 1)).getByRole("button", { name: COPY }));
    await expect(navigator.clipboard.readText()).resolves.toBe(whole);
  });

  it("the copy control copies all of a long submitted value when it is pressed with no pointer or focus on it first, as a screen reader can", async () => {
    await renderLive(2, { addresses: new Map([[1, `${"a".repeat(250)}\n\u202E${"b".repeat(50)}`]]) });
    fireEvent.click(within(row(NOT_ADDRESSED)).getByRole("button", { name: COPY }));
    await expect(navigator.clipboard.readText()).resolves.toBe(`${"a".repeat(250)} \uFFFD${"b".repeat(50)}`);
  });

  it("the copy control copies all of what was submitted, as Show all shows it, and short text has no Show all", async () => {
    const long = `${"a".repeat(250)}\n\u202E${"b".repeat(50)}`;
    const { user } = await renderLive(3, {
      addresses: new Map([
        [1, long],
        [2, "short\ttext"],
      ]),
    });
    expect(within(row(NOT_ADDRESSED, 0)).queryByRole("button", { name: "Show all" })).toBeNull();

    await user.click(within(row(NOT_ADDRESSED, 1)).getByRole("button", { name: COPY }));
    await expect(navigator.clipboard.readText()).resolves.toBe(`${"a".repeat(250)} \uFFFD${"b".repeat(50)}`);
    await user.click(within(row(NOT_ADDRESSED, 0)).getByRole("button", { name: COPY }));
    await expect(navigator.clipboard.readText()).resolves.toBe("short text");
  });

  it("an empty value or only line breaks submitted in place of a file shows the heading alone, with nothing to copy", async () => {
    await renderLive(3, {
      addresses: new Map([
        [1, ""],
        [2, "\r\n\n"],
      ]),
    });
    for (const nth of [0, 1]) {
      const article = row(NOT_ADDRESSED, nth);
      expect(controls(article)).toEqual([]);
      expect(article.querySelector("h3")?.nextElementSibling?.tagName).toBe("FOOTER");
    }
  });

  it("an entry whose data does not decode keeps its row with when, and who when its submitter decodes", async () => {
    await renderLive(3, { addresses: new Map([[0, null]]), withoutParty: new Set([1]) });
    expect(titles()).toEqual(["Entry 2", UNREADABLE, UNREADABLE, "Dispute Raised"]);
    const [withoutSubmitter, withSubmitter] = [row(UNREADABLE, 0), row(UNREADABLE, 1)];
    expect(within(withSubmitter).getByText(shortenAddress(SUBMITTER))).toBeInTheDocument();
    expect(within(withSubmitter).getByText(blockTime(0))).toBeInTheDocument();
    expect(within(withoutSubmitter).queryByText("Submitted by")).toBeNull();
    expect(within(withoutSubmitter).getByText(blockTime(1))).toBeInTheDocument();
    expect(withoutSubmitter.querySelectorAll("a, button")).toHaveLength(0);
  });

  it("Try again reads only that file's IPFS address: every other row, the Order and the links stay, nothing shows the loading state, and only its button is busy, keeping focus", async () => {
    const { read, user } = await renderLive(5, { refused: new Set([1, 2]), addresses: new Map([[3, "https://example.org/evidence.json"]]) });
    const shown = ["Entry 4", NOT_ADDRESSED, DID_NOT_LOAD, DID_NOT_LOAD, "Entry 0", "Dispute Raised"];
    expect(titles()).toEqual(shown);
    const release = holdFetches(read);
    const pressed = tryAgainButton(1);
    await user.click(pressed);

    expect(read.fetched).toEqual([documentUrl(1)]);
    expect(titles()).toEqual(shown);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(pressed).toHaveAttribute("aria-disabled", "true");
    expect(pressed).toHaveAccessibleName("Try again");
    expect(pressed).toHaveFocus();
    expect(tryAgainButton(0)).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("button", { name: /order/i })).toBeEnabled();
    expect(within(row(DID_NOT_LOAD, 0)).getByRole("link", { name: /Open the file/ })).toHaveAttribute("href", documentUrl(2));

    release();
    await waitFor(() => {
      expect(pressed).not.toHaveAttribute("aria-disabled");
    });
    expect(read.everFetched.filter((url) => !url.startsWith(`${GATEWAY}/ipfs/`))).toEqual([]);
  });

  it("a file that loads now turns only that row into a normal entry, in the held page too, focus moves to that row and it is announced", async () => {
    const { read, user } = await renderLive(3, { refused: new Set([1]) });
    const before = heldList().entries;
    read.refused.clear();
    await user.click(tryAgainButton());
    await waitFor(() => {
      expect(titles()).toEqual(["Entry 2", "Entry 1", "Entry 0", "Dispute Raised"]);
    });
    expect(read.fetched).toEqual([documentUrl(1)]);
    const after = heldList().entries;
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after[1]?.status).toBe("shown");
    expect(row("Entry 1")).toHaveFocus();
    expect(announcement()).toBe("This evidence loaded.");
  });

  it("a file that loads now moves focus to its row also when focus went to that row's link while it was read", async () => {
    const { read, user } = await renderLive(3, { refused: new Set([1]) });
    read.refused.clear();
    const release = holdFetches(read);
    await user.click(tryAgainButton());
    await user.tab();
    expect(within(row(DID_NOT_LOAD)).getByRole("link", { name: /Open the file/ })).toHaveFocus();

    release();
    await waitFor(() => {
      expect(titles()).toEqual(["Entry 2", "Entry 1", "Entry 0", "Dispute Raised"]);
    });
    expect(row("Entry 1")).toHaveFocus();
  });

  it("a file that still does not load keeps its row and focus on its Try again, and says so each time", async () => {
    const { read, user } = await renderLive(3, { refused: new Set([1]) });
    const button = tryAgainButton();
    await user.click(button);
    await waitFor(() => {
      expect(announcement()).toBe("This evidence did not load.");
    });
    expect(read.fetched).toEqual([documentUrl(1)]);
    expect(titles()).toEqual(["Entry 2", DID_NOT_LOAD, "Entry 0", "Dispute Raised"]);
    expect(button).toHaveFocus();
    expect(button).not.toHaveAttribute("aria-disabled");

    const release = holdFetches(read);
    await user.click(button);
    expect(announcement()).toBe("");
    release();
    await waitFor(() => {
      expect(announcement()).toBe("This evidence did not load.");
    });
    expect(read.fetched).toEqual([documentUrl(1), documentUrl(1)]);
    expect(button).toHaveFocus();
  });

  it("a file that is now over 64 KB becomes the too-large row with its link, and focus moves to it", async () => {
    const { read, user } = await renderLive(3, { refused: new Set([1]) });
    read.refused.clear();
    read.tooLarge.add(1);
    await user.click(tryAgainButton());
    await waitFor(() => {
      expect(titles()).toEqual(["Entry 2", TOO_LARGE, "Entry 0", "Dispute Raised"]);
    });
    expect(read.fetched).toEqual([documentUrl(1)]);
    expect(within(row(TOO_LARGE)).getByRole("link", { name: /Open the file/ })).toHaveAttribute("href", documentUrl(1));
    expect(row(TOO_LARGE)).toHaveFocus();
    expect(announcement()).toBe(TOO_LARGE);
  });

  it("two files tried again at once each update their own row", async () => {
    const { read, user } = await renderLive(3, { refused: new Set([0, 2]) });
    read.refused.clear();
    const release = holdFetches(read);
    await user.click(tryAgainButton(0));
    await user.click(tryAgainButton(1));
    release();
    await waitFor(() => {
      expect(titles()).toEqual(["Entry 2", "Entry 1", "Entry 0", "Dispute Raised"]);
    });
    expect(read.fetched.map(indexOf).sort((a, b) => a - b)).toEqual([0, 2]);
    expect(heldList().entries.every((entry) => entry.status === "shown")).toBe(true);
  });

  it("a page change while Try again runs drops its result, which never reaches the page opened", async () => {
    const { read, user } = await renderLive(120, { refused: new Set([100]) });
    read.refused.clear();
    const release = holdFetches(read);
    await user.click(tryAgainButton());
    expect(read.fetched).toEqual([documentUrl(100)]);
    await user.click(within(pager("top")).getByRole("button", { name: "Page 2" }));
    release();
    await waitFor(() => {
      expect(titles()).toEqual(entryTitles(20, 70).reverse());
    });
    expect(heldList().page).toEqual({ order: "newest", page: 2 });
    expect(heldList().entries.some((entry) => entry.blockNumber === 200n)).toBe(false);
  });

  it("an order change while Try again runs drops its result, and that row can be tried again", async () => {
    const { read, user } = await renderLive(3, { refused: new Set([1]) });
    read.refused.clear();
    const release = holdFetches(read);
    await user.click(tryAgainButton());
    expect(read.fetched).toEqual([documentUrl(1)]);
    await chooseOrder(user, "Oldest first");
    await waitFor(() => {
      expect(tryAgainButton()).not.toHaveAttribute("aria-disabled");
    });
    release();
    expect(titles()).toEqual(["Dispute Raised", "Entry 0", DID_NOT_LOAD, "Entry 2"]);
    expect(announcement()).toBe("Oldest first. Entries 1–3 of 3 shown.");
    await user.click(tryAgainButton());
    await waitFor(() => {
      expect(titles()).toEqual(["Dispute Raised", "Entry 0", "Entry 1", "Entry 2"]);
    });
  });

  it("after Try again loads a file, switching the order and back keeps that entry without reading anything again", async () => {
    const { read, user } = await renderLive(3, { refused: new Set([1]) });
    read.refused.clear();
    await user.click(tryAgainButton());
    await waitFor(() => {
      expect(titles()).toEqual(["Entry 2", "Entry 1", "Entry 0", "Dispute Raised"]);
    });
    expect(read.fetched).toEqual([documentUrl(1)]);
    read.fetched.length = 0;
    await chooseOrder(user, "Oldest first");
    expect(titles()).toEqual(["Dispute Raised", "Entry 0", "Entry 1", "Entry 2"]);
    await chooseOrder(user, "Newest first");
    expect(titles()).toEqual(["Entry 2", "Entry 1", "Entry 0", "Dispute Raised"]);
    expect(read.fetched).toEqual([]);
  });

  it("after Try again loads a file, another page and back still shows that entry, even when the page's new read does not load it", async () => {
    const { read, user } = await renderLive(120, { refused: new Set([100]) });
    read.refused.clear();
    await user.click(tryAgainButton());
    await waitFor(() => {
      expect(titles()).toEqual(entryTitles(70, 120).reverse());
    });
    read.refused.add(100);
    await user.click(within(pager("top")).getByRole("button", { name: "Page 2" }));
    await waitFor(() => {
      expect(titles()).toEqual(entryTitles(20, 70).reverse());
    });
    read.fetched.length = 0;

    await user.click(within(pager("top")).getByRole("button", { name: "Page 1" }));
    await waitFor(() => {
      expect(titles()).toEqual(entryTitles(70, 120).reverse());
    });
    expect(read.fetched).toContain(documentUrl(100));
    expect(heldList().entries.find((entry) => entry.blockNumber === 200n)?.status).toBe("fetch-failed");
  });

  it("a page whose every document loads renders as before: entries only, no notice and no Try again", async () => {
    await renderLive(3);
    expect(titles()).toEqual(["Entry 2", "Entry 1", "Entry 0", "Dispute Raised"]);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText(/hidden/i)).toBeNull();
    const page = screen.getByRole("list", { name: "Evidence timeline" }).parentElement;
    expect(page).not.toHaveAttribute("tabindex");
  });
});
