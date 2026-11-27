import {
  evidencePage,
  toAttachmentLink,
  type AppealDecisionEvent,
  type Address,
  type CanonicalIpfsPath,
  type ChainConfig,
  type EvidenceEntry as PageEntry,
  type EvidenceFile,
  type EvidenceItem,
  type EvidenceList,
  type EvidenceLog,
  type EvidencePageRequest,
  type EvidencePageSlice,
} from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCoreDeps, type EvidenceEntryRetry, type EvidencePageState } from "../../data";
import { Attachment } from "../../safe-content";
import { AddressText, EmptyState, Identicon, SectionSkeleton, SectionUnavailable, Timestamp } from "../../ui";
import { EvidencePager } from "./EvidencePager";
import { pageTimeline, type TimelineRow } from "./pageTimeline";
import { SubmittedText } from "./SubmittedText";

/**
 * What the live region says about the page it names: a page change the visitor made, once that page settles (`lead`
 * names a new order), or what a Try again on it gave.
 */
export type Announcement = { readonly request: EvidencePageRequest } & ({ readonly lead: string } | { readonly text: string });

interface EvidenceTimelineProps {
  readonly list: EvidenceList;
  readonly request: EvidencePageRequest;
  readonly pageState: EvidencePageState;
  readonly raisedAt: number | null;
  /** Each shown as an "Appealed" marker; empty while they load or when they failed. */
  readonly appealDecisions: readonly AppealDecisionEvent[];
  readonly chain: ChainConfig;
  readonly onPage: (page: number) => void;
  readonly retry: EvidenceEntryRetry;
  /** Says `text` in the live region for the shown page; `""` clears it. */
  readonly onAnnounce: (text: string) => void;
  readonly announcement: Announcement | null;
}

const DOT_CLASS = "absolute -left-[5.5px] size-2.5 rounded-full ring-4 ring-klerosUIComponentsWhiteBackground";
const FOOTER_CLASS = "flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm text-klerosUIComponentsSecondaryText";

function TimelineEvent({ label, time }: { readonly label: string; readonly time: number | null }) {
  return (
    <li className="relative pl-6">
      <span aria-hidden="true" className={`${DOT_CLASS} top-1.5 bg-klerosUIComponentsSecondaryPurple`} />
      <p className="font-semibold text-klerosUIComponentsPrimaryText">{label}</p>
      {time === null ? null : (
        <small className="text-klerosUIComponentsSecondaryText">
          <Timestamp value={time} />
        </small>
      )}
    </li>
  );
}

function Submitter({ submitter, chain }: { readonly submitter: Address; readonly chain: ChainConfig }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <Identicon address={submitter} />
      <span>Submitted by</span>
      <AddressText address={submitter} chain={chain} />
    </span>
  );
}

/** A row that replaced its Try again takes focus once, where the visitor was. */
function focusRow(row: HTMLElement | null): void {
  row?.focus({ preventScroll: true });
}

function EvidenceEntry({ item, chain, takesFocus }: { readonly item: EvidenceItem; readonly chain: ChainConfig; readonly takesFocus: boolean }) {
  return (
    <li className="relative min-w-0 pl-6">
      <span aria-hidden="true" className={`${DOT_CLASS} top-1.5 bg-klerosUIComponentsPrimaryBlue`} />
      <article ref={takesFocus ? focusRow : undefined} tabIndex={takesFocus ? -1 : undefined} className="flex min-w-0 flex-col gap-2">
        <h3 className="font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">{item.title}</h3>
        <p className="leading-7 whitespace-pre-line text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">{item.description}</p>
        <footer className={FOOTER_CLASS}>
          <Submitter submitter={item.submitter} chain={chain} />
          <Timestamp value={item.timestamp} />
          {item.attachment === null ? null : (
            <span className="min-w-0">
              <Attachment attachment={item.attachment} />
            </span>
          )}
        </footer>
      </article>
    </li>
  );
}

interface FileEntryProps {
  readonly heading: string;
  readonly submitter: Address | null;
  readonly timestamp: number;
  readonly chain: ChainConfig;
  /** Under the heading, above who and when. */
  readonly detail?: ReactNode;
  /** After who and when. */
  readonly children?: ReactNode;
  readonly takesFocus?: boolean;
}

/** An entry whose document is not shown: what happened to it, then who and when as for any entry. */
function FileEntry({ heading, submitter, timestamp, chain, detail, children, takesFocus = false }: FileEntryProps) {
  return (
    <li className="relative min-w-0 pl-6">
      <span aria-hidden="true" className={`${DOT_CLASS} top-1.5 bg-klerosUIComponentsPrimaryBlue`} />
      <article ref={takesFocus ? focusRow : undefined} tabIndex={takesFocus ? -1 : undefined} className="flex min-w-0 flex-col gap-2">
        <h3 className="font-semibold text-klerosUIComponentsPrimaryText">{heading}</h3>
        {detail}
        <footer className={FOOTER_CLASS}>
          {submitter === null ? null : <Submitter submitter={submitter} chain={chain} />}
          <Timestamp value={timestamp} />
          {children}
        </footer>
      </article>
    </li>
  );
}

/** A content-addressed file, through the gateway, in a new tab; never fetched or rendered here. */
function OpenTheFile({ uri }: { readonly uri: CanonicalIpfsPath }) {
  const { gateway } = useCoreDeps();
  const link = toAttachmentLink(uri, gateway);
  return link?.kind === "link" ? (
    <span className="min-w-0">
      <Attachment attachment={{ ...link, label: "Open the file" }} />
    </span>
  ) : null;
}

const NOT_EVIDENCE = "Not in the evidence format.";
const DID_NOT_LOAD = "This evidence did not load.";
const TRY_AGAIN = "Try again";
const FILE_HEADINGS = {
  "too-large": "This evidence is too large to show here.",
  "not-json": NOT_EVIDENCE,
  "schema-invalid": NOT_EVIDENCE,
  "fetch-failed": DID_NOT_LOAD,
} as const;

/** What the live region says once a Try again settles: the row's new heading, or that the evidence loaded. */
function triedAgainText(entry: PageEntry): string {
  switch (entry.status) {
    case "shown":
      return "This evidence loaded.";
    case "not-content-addressed":
    case "undecodable":
      return "";
    default:
      return FILE_HEADINGS[entry.status];
  }
}

/** What every evidence row of the page shares. */
interface RowContext {
  readonly chain: ChainConfig;
  readonly retry: EvidenceEntryRetry;
  /** Called when a Try again is pressed. */
  readonly onTryAgain: () => void;
  /** Called with what a Try again gave; `focusFollows` when the visitor's focus was still in its row, or lost. */
  readonly onTriedAgain: (entry: PageEntry, focusFollows: boolean) => void;
  /** The entry whose row takes focus when it mounts. */
  readonly focusKey: string | null;
}

function entryKey(entry: PageEntry): string {
  return `evidence:${entry.blockNumber.toString()}:${String(entry.logIndex)}`;
}

/** Try again reads this file alone; its button shows busy and keeps focus meanwhile, and no other row waits for it. */
function DidNotLoad({ entry, evidence, context }: { readonly entry: PageEntry; readonly evidence: EvidenceFile; readonly context: RowContext }) {
  const { retry, onTryAgain, onTriedAgain } = context;
  const busy = retry.isRetrying(entry);
  const tryAgain = ({ target }: { readonly target: Element }) => {
    onTryAgain();
    const row = target.closest("li");
    void retry.tryAgain(entry).then((next) => {
      if (next === null) return;
      const active = document.activeElement;
      onTriedAgain(next, active === null || active === document.body || row?.contains(active) === true);
    });
  };
  return (
    <FileEntry heading={DID_NOT_LOAD} submitter={evidence.submitter} timestamp={evidence.timestamp} chain={context.chain}>
      {/* The library's busy state hides the text, and so the name, unless the button carries one. */}
      <Button text={TRY_AGAIN} aria-label={TRY_AGAIN} variant="secondary" small isLoading={busy} isPending={busy} onPress={tryAgain} />
      <OpenTheFile uri={evidence.uri} />
    </FileEntry>
  );
}

/**
 * A document that is not shown keeps its place with who and when. Only a content-addressed file is linked; what was
 * submitted in place of one is plain text, never a link and never fetched.
 */
function EvidenceRow({ entry, context }: { readonly entry: PageEntry; readonly context: RowContext }) {
  const { chain } = context;
  const takesFocus = context.focusKey === entryKey(entry);
  switch (entry.status) {
    case "shown":
      return <EvidenceEntry item={entry.item} chain={chain} takesFocus={takesFocus} />;
    case "not-content-addressed":
      return (
        <FileEntry
          heading="What was submitted is not an IPFS file:"
          submitter={entry.evidence.submitter}
          timestamp={entry.evidence.timestamp}
          chain={chain}
          detail={<SubmittedText address={entry.evidence.address} />}
        />
      );
    case "undecodable":
      return <FileEntry heading="This entry could not be read." submitter={entry.evidence.submitter} timestamp={entry.evidence.timestamp} chain={chain} />;
    case "fetch-failed":
      return <DidNotLoad entry={entry} evidence={entry.evidence} context={context} />;
    default:
      return (
        <FileEntry heading={FILE_HEADINGS[entry.status]} submitter={entry.evidence.submitter} timestamp={entry.evidence.timestamp} chain={chain} takesFocus={takesFocus}>
          <OpenTheFile uri={entry.evidence.uri} />
        </FileEntry>
      );
  }
}

function rowKey(row: TimelineRow): string {
  return row.kind === "evidence" ? entryKey(row.entry) : `appealed:${row.decision.blockNumber.toString()}`;
}

function Row({ row, context }: { readonly row: TimelineRow; readonly context: RowContext }) {
  if (row.kind === "appealed") return <TimelineEvent label="Appealed" time={row.decision.appealedAt} />;
  return <EvidenceRow entry={context.retry.shown(row.entry)} context={context} />;
}

interface PageEntriesProps {
  readonly rows: readonly TimelineRow[];
  readonly slice: EvidencePageSlice;
  readonly raisedAt: number | null;
  readonly context: RowContext;
}

/** Attachments are links, never rendered inline. "Dispute Raised" is the oldest event, shown only when there is evidence. */
function PageEntries({ rows, slice, raisedAt, context }: PageEntriesProps) {
  const raised = <TimelineEvent label="Dispute Raised" time={raisedAt} />;
  return (
    <>
      {rows.length === 0 && slice.disputeRaised === null ? null : (
        <ol aria-label="Evidence timeline" className="ml-1.5 flex min-w-0 flex-col gap-6 border-l border-klerosUIComponentsStroke">
          {slice.disputeRaised === "first" ? raised : null}
          {rows.map((row) => (
            <Row key={rowKey(row)} row={row} context={context} />
          ))}
          {slice.disputeRaised === "last" ? raised : null}
        </ol>
      )}
      {slice.total === 0 ? <EmptyState title="No evidence submitted yet." /> : null}
    </>
  );
}

/** The row a Try again's result takes focus to, on the page and scan it was pressed on. */
interface FocusRequest {
  readonly key: string;
  readonly request: EvidencePageRequest;
  readonly logs: readonly EvidenceLog[];
}

function rangeText(slice: EvidencePageSlice): string {
  return `Entries ${String(slice.start + 1)}–${String(slice.end)} of ${String(slice.total)}`;
}

function announcementText(announcement: Announcement | null, request: EvidencePageRequest, pageState: EvidencePageState, range: string): string {
  if (announcement?.request.order !== request.order || announcement.request.page !== request.page) return "";
  if ("text" in announcement) return announcement.text;
  if (pageState.status === "failed") return `${announcement.lead}${range} could not be loaded.`;
  return pageState.status === "ready" ? `${announcement.lead}${range} shown.` : "";
}

/**
 * One page of the timeline in the chosen order, with the count and the page numbers above and below it when there is more
 * than one page. The top pager keeps focus on the pressed page; the bottom one moves focus to the new page's start and
 * brings the top pager back into view.
 */
export function EvidenceTimeline({ list, request, pageState, raisedAt, appealDecisions, chain, onPage, retry, onAnnounce, announcement }: EvidenceTimelineProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const topPagerRef = useRef<HTMLElement>(null);
  const openedFromTop = useRef(false);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const slice = evidencePage(list.logs, request);
  const paged = slice.pageCount > 1;
  const range = rangeText(slice);
  const focusPage = () => {
    pageRef.current?.focus({ preventScroll: true });
  };
  const openFromTop = (page: number) => {
    openedFromTop.current = page !== slice.page;
    onPage(page);
  };
  const openFromBottom = (page: number) => {
    onPage(page);
    focusPage();
    topPagerRef.current?.scrollIntoView({ block: "nearest" });
  };

  // An arrow that reaches the first or last page disables itself while focused, which drops focus to the document.
  useEffect(() => {
    if (!openedFromTop.current) return;
    openedFromTop.current = false;
    const active = document.activeElement;
    if (active instanceof HTMLButtonElement && !active.disabled && topPagerRef.current?.contains(active) === true) return;
    pageRef.current?.focus({ preventScroll: true });
  }, [slice.page]);

  let content;
  if (pageState.status === "failed") {
    const { retry } = pageState;
    const retryHere = () => {
      // Retry gives way to the loading state, so focus stays in the page instead of falling to the document.
      focusPage();
      retry();
      return Promise.resolve();
    };
    content = <SectionUnavailable section="Evidence page" error={pageState.error} onRetry={retryHere} />;
  } else if (pageState.status === "loading") content = <SectionSkeleton variant="text" lines={4} />;
  else {
    const context: RowContext = {
      chain,
      retry,
      onTryAgain: () => {
        // Cleared first, so the same outcome twice is still announced.
        onAnnounce("");
      },
      onTriedAgain: (entry, focusFollows) => {
        onAnnounce(triedAgainText(entry));
        if (focusFollows && entry.status !== "fetch-failed") setFocus({ key: entryKey(entry), request, logs: list.logs });
      },
      // Only on the page and scan it was asked for, so coming back to that page later moves nothing.
      focusKey: focus?.request === request && focus.logs === list.logs ? focus.key : null,
    };
    content = <PageEntries rows={pageTimeline(list, slice, request.order, appealDecisions)} slice={slice} raisedAt={raisedAt} context={context} />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {paged ? <EvidencePager label="Evidence pages, top" range={range} page={slice.page} pageCount={slice.pageCount} onChange={openFromTop} navRef={topPagerRef} /> : null}
      <div ref={pageRef} tabIndex={paged ? -1 : undefined} className="flex min-w-0 scroll-mt-4 flex-col gap-4 rounded-base">
        {content}
      </div>
      {paged ? <EvidencePager label="Evidence pages, bottom" range={range} page={slice.page} pageCount={slice.pageCount} onChange={openFromBottom} /> : null}
      {slice.total > 0 ? (
        <p aria-live="polite" className="sr-only">
          {announcementText(announcement, request, pageState, range)}
        </p>
      ) : null}
    </div>
  );
}
