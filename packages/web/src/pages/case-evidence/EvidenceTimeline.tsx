import type { ChainConfig, EvidenceItem, EvidenceList, UnixSeconds } from "@dispute-resolver/core";
import { evidenceItemAttributes, hiddenEvidenceCountAttributes, testId } from "../../parity";
import { Attachment } from "../../safe-content";
import { AddressText, EmptyState, Identicon, Notice } from "../../ui";
import { hiddenEvidenceText } from "./hiddenEvidence";

export interface EvidenceTimelineProps {
  readonly list: EvidenceList;
  /** The Dispute event's time ("Dispute Raised"), `null` when unknown. */
  readonly raisedAt: UnixSeconds | null;
  readonly chain: ChainConfig;
}

const DOT_CLASS = "absolute -left-[6px] size-2.5 rounded-full";

/** Today's "submission time as a UTC string" (spec 5.14), inside a machine-readable `<time>`. */
function Timestamp({ value }: { readonly value: UnixSeconds }) {
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return <span>Unknown time</span>;
  return <time dateTime={date.toISOString()}>{date.toUTCString()}</time>;
}

function EvidenceEntry({ item, chain }: { readonly item: EvidenceItem; readonly chain: ChainConfig }) {
  return (
    <li {...evidenceItemAttributes({ submitter: item.submitter, timestamp: item.timestamp })} className="relative min-w-0 pl-5">
      <span aria-hidden="true" className={`${DOT_CLASS} top-5 bg-klerosUIComponentsPrimaryBlue`} />
      <article className="flex min-w-0 flex-col gap-3 rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-4 shadow-default">
        <h3 {...testId("evidence-title")} className="font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">
          {item.title}
        </h3>
        <p {...testId("evidence-description")} className="whitespace-pre-line text-klerosUIComponentsSecondaryText [overflow-wrap:anywhere]">
          {item.description}
        </p>
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-klerosUIComponentsStroke pt-3 text-sm text-klerosUIComponentsSecondaryText">
          <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
            <Identicon address={item.submitter} />
            <span>Submitted by</span>
            <AddressText address={item.submitter} chain={chain} />
          </span>
          <Timestamp value={item.timestamp} />
          {item.attachment === null ? null : (
            <span className="min-w-0 sm:ml-auto">
              <Attachment attachment={item.attachment} testId="evidence-attachment" />
            </span>
          )}
        </footer>
      </article>
    </li>
  );
}

/** The count of entries core hid (D-22); always present as a parity hook, visible only when something is hidden. */
function HiddenCount({ list }: { readonly list: EvidenceList }) {
  const text = hiddenEvidenceText(list);
  if (text === null) return <div {...hiddenEvidenceCountAttributes(0)} hidden />;
  return (
    <div {...hiddenEvidenceCountAttributes(list.hiddenEvidenceCount)}>
      <Notice variant="info" title="Hidden evidence" body={`${text}. Only content-addressed evidence in the expected format is shown.`} />
    </div>
  );
}

/**
 * The evidence list of spec 5.14: valid entries newest first, each with its title, plain-text description, submitter,
 * UTC time and attachment link (never rendered inline, A17), then "Dispute Raised" when the evidence array is not
 * empty, or "No evidence submitted yet." when it is. Entries core hid are counted visibly (D-22).
 */
export function EvidenceTimeline({ list, raisedAt, chain }: EvidenceTimelineProps) {
  const isEmpty = list.items.length === 0 && list.hiddenEvidenceCount === 0;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <HiddenCount list={list} />
      {isEmpty ? (
        <EmptyState title="No evidence submitted yet." />
      ) : (
        <ol aria-label="Evidence timeline" className="ml-1.5 flex min-w-0 flex-col gap-4 border-l-2 border-klerosUIComponentsStroke">
          {list.items.map((item) => (
            <EvidenceEntry key={`${item.transactionHash}:${item.uri}`} item={item} chain={chain} />
          ))}
          <li className="relative pl-5">
            <span aria-hidden="true" className={`${DOT_CLASS} top-1.5 bg-klerosUIComponentsSecondaryPurple`} />
            <p className="font-semibold text-klerosUIComponentsPrimaryText">Dispute Raised</p>
            {raisedAt === null ? null : (
              <small className="text-klerosUIComponentsSecondaryText">
                <Timestamp value={raisedAt} />
              </small>
            )}
          </li>
        </ol>
      )}
    </div>
  );
}
