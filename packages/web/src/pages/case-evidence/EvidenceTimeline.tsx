import { compareBigint, type AppealDecisionEvent, type ChainConfig, type EvidenceItem, type EvidenceList } from "@dispute-resolver/core";
import { Attachment } from "../../safe-content";
import { AddressText, EmptyState, Identicon, Notice } from "../../ui";
import { hiddenEvidenceText } from "./hiddenEvidence";

interface EvidenceTimelineProps {
  readonly list: EvidenceList;
  /** The Dispute event's time ("Dispute Raised"), `null` when unknown. */
  readonly raisedAt: number | null;
  /** Each shown as an "Appealed" marker; empty while they load or when they failed. */
  readonly appealDecisions: readonly AppealDecisionEvent[];
  readonly chain: ChainConfig;
}

type TimelineEntry = { readonly kind: "evidence"; readonly item: EvidenceItem } | { readonly kind: "appealed"; readonly decision: AppealDecisionEvent };

function entryBlock(entry: TimelineEntry): bigint {
  return entry.kind === "evidence" ? entry.item.blockNumber : entry.decision.blockNumber;
}

/**
 * Newest block first. The sort is stable and the entries come first, so entries keep core's order, and an appeal in the
 * block of an entry, whose order within the block is not read, is placed below it.
 */
function timelineEntries(items: readonly EvidenceItem[], decisions: readonly AppealDecisionEvent[]): TimelineEntry[] {
  const entries: TimelineEntry[] = items.map((item) => ({ kind: "evidence", item }));
  const markers: TimelineEntry[] = decisions.map((decision) => ({ kind: "appealed", decision }));
  return [...entries, ...markers].sort((a, b) => compareBigint(entryBlock(b), entryBlock(a)));
}

const DOT_CLASS = "absolute -left-[5.5px] size-2.5 rounded-full ring-4 ring-klerosUIComponentsWhiteBackground";

function Timestamp({ value }: { readonly value: number }) {
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return <span>Unknown time</span>;
  return <time dateTime={date.toISOString()}>{date.toUTCString()}</time>;
}

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

function EvidenceEntry({ item, chain }: { readonly item: EvidenceItem; readonly chain: ChainConfig }) {
  return (
    <li className="relative min-w-0 pl-6">
      <span aria-hidden="true" className={`${DOT_CLASS} top-1.5 bg-klerosUIComponentsPrimaryBlue`} />
      <article className="flex min-w-0 flex-col gap-2">
        <h3 className="font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">{item.title}</h3>
        <p className="max-w-[72ch] whitespace-pre-line text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">{item.description}</p>
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm text-klerosUIComponentsSecondaryText">
          <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
            <Identicon address={item.submitter} />
            <span>Submitted by</span>
            <AddressText address={item.submitter} chain={chain} />
          </span>
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

function HiddenCount({ list }: { readonly list: EvidenceList }) {
  const text = hiddenEvidenceText(list);
  if (text === null) return null;
  return <Notice variant="info" title="Hidden evidence" body={`${text}. Only content-addressed evidence in the expected format is shown.`} />;
}

/**
 * Attachments are links, never rendered inline. "Dispute Raised" closes the list only when there is evidence, hidden
 * entries included.
 */
export function EvidenceTimeline({ list, raisedAt, appealDecisions, chain }: EvidenceTimelineProps) {
  const isEmpty = list.items.length === 0 && list.hiddenEvidenceCount === 0;
  const entries = timelineEntries(list.items, appealDecisions);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <HiddenCount list={list} />
      {isEmpty && entries.length === 0 ? null : (
        <ol aria-label="Evidence timeline" className="ml-1.5 flex min-w-0 flex-col gap-6 border-l border-klerosUIComponentsStroke">
          {entries.map((entry) =>
            entry.kind === "evidence" ? (
              <EvidenceEntry key={`evidence:${entry.item.transactionHash}:${entry.item.uri}`} item={entry.item} chain={chain} />
            ) : (
              <TimelineEvent key={`appealed:${entry.decision.blockNumber.toString()}`} label="Appealed" time={entry.decision.appealedAt} />
            ),
          )}
          {isEmpty ? null : <TimelineEvent label="Dispute Raised" time={raisedAt} />}
        </ol>
      )}
      {isEmpty ? <EmptyState title="No evidence submitted yet." /> : null}
    </div>
  );
}
