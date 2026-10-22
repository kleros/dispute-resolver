import type { ChainId, MetaEvidence, MetaEvidenceResult, Unavailable } from "@dispute-resolver/core";
import { useId } from "react";
import type { CaseSectionProps, SectionData } from "../../data";
import { courtCaseUrl, ExternalLink } from "../../safe-content";
import { LABEL, SectionSkeleton, SectionUnavailable } from "../../ui";
import { questionTypeLabel, votingOptions, type VotingOption } from "./questionOptions";

const SECTION = "Question";

const NO_META_EVIDENCE: Unavailable = {
  code: "not-found",
  message: "This dispute has no meta-evidence, so its question and voting options cannot be shown.",
};

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

const VISIBLE_TEXT = /\S/;

/**
 * The title comes first on screen and the code after it, but the DOM keeps the one-line form "Option {code} - {title}:
 * {description}" with the separators visually hidden, so assistive technology and copying read it in that order.
 */
function AnswerEntry({ option }: { readonly option: VotingOption }) {
  const { description } = option;
  const describedOnScreen = description !== undefined && VISIBLE_TEXT.test(description);
  return (
    <li className="flex flex-col gap-1 text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">
      <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="order-last text-sm leading-5 text-klerosUIComponentsSecondaryText tabular-nums">
          {option.code}
          <span className="sr-only">{" - "}</span>
        </span>
        <span className="text-base leading-6 font-semibold">{option.title}</span>
        {description === undefined || describedOnScreen ? null : (
          <span className="sr-only">
            {": "}
            {description}
          </span>
        )}
      </p>
      {describedOnScreen ? (
        <p className="max-w-[72ch] whitespace-pre-line text-sm leading-5 text-pretty">
          <span className="sr-only">{": "}</span>
          {description}
        </p>
      ) : null}
    </li>
  );
}

interface VotingOptionsListProps {
  readonly options: readonly VotingOption[];
  readonly disputeId: bigint;
  readonly chainId: ChainId;
}

/** The list's empty list-style-type replaces the preflight's `none`, for which WebKit drops the list semantics. */
function VotingOptionsList({ options, disputeId, chainId }: VotingOptionsListProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <h3 id={headingId} className="text-base leading-6 font-semibold text-klerosUIComponentsPrimaryText">
        Voting options
      </h3>
      <ul className="mt-2 flex flex-col gap-4 [list-style-type:'']">
        {options.map((option) => (
          <AnswerEntry key={option.key} option={option} />
        ))}
      </ul>
      <p className={`mt-6 ${LABEL}`}>
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
  const options = rulingOptions === null ? null : votingOptions(rulingOptions);
  return (
    <div className="flex min-w-0 max-w-[72ch] flex-col gap-6">
      {question === null && label === null ? null : (
        <div className="flex flex-col gap-1">
          {question === null ? null : (
            <p className="whitespace-pre-line text-lg leading-7 font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere] text-pretty">
              {question}
            </p>
          )}
          {label === null ? null : <p className={LABEL}>{label}</p>}
        </div>
      )}
      {options === null ? null : <VotingOptionsList options={options} disputeId={disputeId} chainId={chainId} />}
    </div>
  );
}

interface QuestionPanelProps extends CaseSectionProps {
  readonly onRetry?: () => void;
}

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
