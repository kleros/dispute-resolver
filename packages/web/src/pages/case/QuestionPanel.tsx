import type { ChainId, MetaEvidence, MetaEvidenceResult, RulingOptions, Unavailable } from "@dispute-resolver/core";
import { useId } from "react";
import type { CaseSectionProps, SectionData } from "../../data";
import { rulingOptionsAttributes, testId } from "../../parity";
import { courtCaseUrl, ExternalLink } from "../../safe-content";
import { EYEBROW, SectionSkeleton, SectionUnavailable } from "../../ui";
import { questionTypeLabel, votingOptions } from "./questionOptions";

const SECTION = "Question";

const NO_META_EVIDENCE: Unavailable = {
  code: "not-found",
  message: "This dispute has no meta-evidence, so its question and voting options cannot be shown.",
};

/** The meta-evidence the panel reads: an accepted one, or the "invalid or tampered" placeholder of a rejected one (A2). */
function questionSource(metaEvidence: SectionData<MetaEvidenceResult>): SectionData<MetaEvidence> {
  if (metaEvidence.status !== "ready") return metaEvidence;
  const result = metaEvidence.value;
  switch (result.status) {
    case "ok":
    case "invalid":
      return { status: "ready", value: result.metaEvidence };
    case "missing":
      return { status: "unavailable", error: NO_META_EVIDENCE };
    case "failed":
      return { status: "unavailable", error: result.error };
  }
}

interface VotingOptionsListProps {
  readonly options: RulingOptions;
  readonly disputeId: bigint;
  readonly chainId: ChainId;
}

/** The options of a single- or multiple-select question, for viewing only, and where jurors vote (spec 5.13). */
function VotingOptionsList({ options, disputeId, chainId }: VotingOptionsListProps) {
  const headingId = useId();
  const items = votingOptions(options);
  if (items === null) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId}>Voting options</h3>
      <ul className="flex flex-col divide-y divide-klerosUIComponentsStroke border-y border-klerosUIComponentsStroke">
        {items.map((item) => (
          <li key={item.key} className="py-3 text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">
            <span className="font-semibold">{item.label}</span>
            {item.description === undefined ? null : <span>{`: ${item.description}`}</span>}
          </li>
        ))}
      </ul>
      <p className="text-sm text-klerosUIComponentsSecondaryText">
        Note that you can only view the voting options. Selected jurors can vote using <ExternalLink href={courtCaseUrl(disputeId, chainId)}>Court</ExternalLink>.
      </p>
    </section>
  );
}

interface QuestionContentProps {
  readonly metaEvidence: MetaEvidence;
  readonly disputeId: bigint;
  readonly chainId: ChainId;
}

function QuestionContent({ metaEvidence, disputeId, chainId }: QuestionContentProps) {
  const { question, rulingOptions } = metaEvidence;
  const label = rulingOptions === null ? null : questionTypeLabel(rulingOptions.type);
  const hook =
    rulingOptions === null
      ? {}
      : rulingOptionsAttributes({ type: rulingOptions.type, titles: rulingOptions.titles, reserved: rulingOptions.reserved, precision: rulingOptions.precision });
  return (
    <div {...hook} className="flex min-w-0 flex-col gap-4">
      {label === null ? null : <p className={EYEBROW}>{label}</p>}
      {question === null ? null : (
        <p {...testId("case-question")} className="whitespace-pre-line text-lg font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">
          {question}
        </p>
      )}
      {rulingOptions === null ? null : <VotingOptionsList options={rulingOptions} disputeId={disputeId} chainId={chainId} />}
    </div>
  );
}

interface QuestionPanelProps extends CaseSectionProps {
  /** Loads the meta-evidence again after a failure (D-36). */
  readonly onRetry?: () => void;
}

/**
 * The Question panel of the accordion (spec 5.13): the question type, the question as plain text and, for select
 * questions, the voting options with the note that jurors vote on Court. It reads the meta-evidence alone, so a failed
 * load degrades this panel with its reason (D-36).
 */
export function QuestionPanel({ dispute, chain, onRetry }: QuestionPanelProps) {
  const source = questionSource(dispute.metaEvidence);
  switch (source.status) {
    case "loading":
      return <SectionSkeleton variant="text" lines={3} />;
    case "unavailable":
      return <SectionUnavailable section={SECTION} error={source.error} onRetry={onRetry} />;
    case "ready":
      return <QuestionContent metaEvidence={source.value} disputeId={dispute.disputeId} chainId={chain.id} />;
  }
}
