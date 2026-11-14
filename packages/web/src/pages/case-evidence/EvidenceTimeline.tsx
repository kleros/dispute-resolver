import {
  evidencePage,
  toAttachmentLink,
  type AppealDecisionEvent,
  type ChainConfig,
  type EvidenceItem,
  type EvidenceList,
  type EvidencePageRequest,
  type EvidencePageSlice,
  type TooLargeEvidence,
} from "@dispute-resolver/core";
import { useEffect, useRef } from "react";
import { useCoreDeps, type EvidencePageState } from "../../data";
import { Attachment } from "../../safe-content";
import { AddressText, EmptyState, Identicon, Notice, SectionSkeleton, SectionUnavailable, Timestamp } from "../../ui";
import { EvidencePager } from "./EvidencePager";
import { hiddenEvidenceText } from "./hiddenEvidence";
import { pageTimeline, type PageTimeline, type TimelineRow } from "./pageTimeline";

/** A page change the visitor made, to announce once its page settles; `lead` names a new order. */
export interface PageAnnouncement {
  readonly request: EvidencePageRequest;
  readonly lead: string;
}

interface EvidenceTimelineProps {
  readonly list: EvidenceList;
  readonly request: EvidencePageRequest;
  readonly pageState: EvidencePageState;
  readonly raisedAt: number | null;
  /** Each shown as an "Appealed" marker; empty while they load or when they failed. */
  readonly appealDecisions: readonly AppealDecisionEvent[];
  readonly chain: ChainConfig;
  readonly onPage: (page: number) => void;
  readonly announcement: PageAnnouncement | null;
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

function Submitter({ submitter, chain }: { readonly submitter: EvidenceItem["submitter"]; readonly chain: ChainConfig }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <Identicon address={submitter} />
      <span>Submitted by</span>
      <AddressText address={submitter} chain={chain} />
    </span>
  );
}

function EvidenceEntry({ item, chain }: { readonly item: EvidenceItem; readonly chain: ChainConfig }) {
  return (
    <li className="relative min-w-0 pl-6">
      <span aria-hidden="true" className={`${DOT_CLASS} top-1.5 bg-klerosUIComponentsPrimaryBlue`} />
      <article className="flex min-w-0 flex-col gap-2">
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

/** The document was never read, so its title is unknown; the entry keeps who and when, and links to the file. */
function TooLargeEntry({ evidence, chain }: { readonly evidence: TooLargeEvidence; readonly chain: ChainConfig }) {
  const { gateway } = useCoreDeps();
  const link = toAttachmentLink(evidence.uri, gateway);
  return (
    <li className="relative min-w-0 pl-6">
      <span aria-hidden="true" className={`${DOT_CLASS} top-1.5 bg-klerosUIComponentsPrimaryBlue`} />
      <article className="flex min-w-0 flex-col gap-2">
        <h3 className="font-semibold text-klerosUIComponentsPrimaryText">This evidence file is too large to show here.</h3>
        <footer className={FOOTER_CLASS}>
          <Submitter submitter={evidence.submitter} chain={chain} />
          <Timestamp value={evidence.timestamp} />
          {link?.kind === "link" ? (
            <span className="min-w-0">
              <Attachment attachment={{ ...link, label: "Open the file" }} />
            </span>
          ) : null}
        </footer>
      </article>
    </li>
  );
}

function rowKey(row: TimelineRow): string {
  return row.kind === "evidence" ? `evidence:${row.entry.blockNumber.toString()}:${String(row.entry.logIndex)}` : `appealed:${row.decision.blockNumber.toString()}`;
}

function Row({ row, chain }: { readonly row: TimelineRow; readonly chain: ChainConfig }) {
  if (row.kind === "appealed") return <TimelineEvent label="Appealed" time={row.decision.appealedAt} />;
  const { entry } = row;
  return entry.status === "shown" ? <EvidenceEntry item={entry.item} chain={chain} /> : <TooLargeEntry evidence={entry.evidence} chain={chain} />;
}

function HiddenCount({ hidden }: { readonly hidden: PageTimeline["hidden"] }) {
  const text = hiddenEvidenceText(hidden);
  if (text === null) return null;
  return <Notice variant="info" title="Hidden evidence" body={`${text}. Only content-addressed evidence in the expected format is shown.`} />;
}

interface PageEntriesProps {
  readonly timeline: PageTimeline;
  readonly slice: EvidencePageSlice;
  readonly raisedAt: number | null;
  readonly chain: ChainConfig;
}

/** Attachments are links, never rendered inline. "Dispute Raised" is the oldest event, shown only when there is evidence, hidden entries included. */
function PageEntries({ timeline, slice, raisedAt, chain }: PageEntriesProps) {
  const raised = <TimelineEvent label="Dispute Raised" time={raisedAt} />;
  return (
    <>
      <HiddenCount hidden={timeline.hidden} />
      {timeline.rows.length === 0 && slice.disputeRaised === null ? null : (
        <ol aria-label="Evidence timeline" className="ml-1.5 flex min-w-0 flex-col gap-6 border-l border-klerosUIComponentsStroke">
          {slice.disputeRaised === "first" ? raised : null}
          {timeline.rows.map((row) => (
            <Row key={rowKey(row)} row={row} chain={chain} />
          ))}
          {slice.disputeRaised === "last" ? raised : null}
        </ol>
      )}
      {slice.total === 0 ? <EmptyState title="No evidence submitted yet." /> : null}
    </>
  );
}

function rangeText(slice: EvidencePageSlice): string {
  return `Entries ${String(slice.start + 1)}–${String(slice.end)} of ${String(slice.total)}`;
}

function announcementText(announcement: PageAnnouncement | null, request: EvidencePageRequest, pageState: EvidencePageState, range: string, timeline: PageTimeline | null): string {
  if (announcement?.request.order !== request.order || announcement.request.page !== request.page) return "";
  if (pageState.status === "failed") return `${announcement.lead}${range} could not be loaded.`;
  if (timeline === null) return "";
  // The hidden-evidence notice is not a live region, so a page that is mostly hidden would otherwise be announced as shown.
  const hidden = hiddenEvidenceText(timeline.hidden);
  return hidden === null ? `${announcement.lead}${range} shown.` : `${announcement.lead}${range} shown. ${hidden}.`;
}

/**
 * One page of the timeline in the chosen order, with the count and the page numbers above and below it when there is more
 * than one page. The top pager keeps focus on the pressed page; the bottom one moves focus to the new page's start and
 * brings the top pager back into view.
 */
export function EvidenceTimeline({ list, request, pageState, raisedAt, appealDecisions, chain, onPage, announcement }: EvidenceTimelineProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const topPagerRef = useRef<HTMLElement>(null);
  const openedFromTop = useRef(false);
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

  const timeline = pageState.status === "ready" ? pageTimeline(list, slice, request.order, appealDecisions) : null;
  let content;
  if (pageState.status === "failed") {
    const { retry } = pageState;
    const retryHere = () => {
      // Retry gives way to the loading state, so focus stays in the page instead of falling to the document.
      focusPage();
      retry();
    };
    content = <SectionUnavailable section="Evidence page" error={pageState.error} onRetry={retryHere} />;
  } else if (timeline === null) content = <SectionSkeleton variant="text" lines={4} />;
  else content = <PageEntries timeline={timeline} slice={slice} raisedAt={raisedAt} chain={chain} />;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {paged ? <EvidencePager label="Evidence pages, top" range={range} page={slice.page} pageCount={slice.pageCount} onChange={openFromTop} navRef={topPagerRef} /> : null}
      <div ref={pageRef} tabIndex={paged ? -1 : undefined} className="flex min-w-0 scroll-mt-4 flex-col gap-4 rounded-base">
        {content}
      </div>
      {paged ? <EvidencePager label="Evidence pages, bottom" range={range} page={slice.page} pageCount={slice.pageCount} onChange={openFromBottom} /> : null}
      {slice.total > 0 ? (
        <p aria-live="polite" className="sr-only">
          {announcementText(announcement, request, pageState, range, timeline)}
        </p>
      ) : null}
    </div>
  );
}
