import { optionsWithinChoices, type DisputeLookup, type MetaEvidence } from "@dispute-resolver/core";
import { useId } from "react";
import { metaEvidenceSection, type CaseSectionProps, type SectionData } from "../../data";
import { courtCaseUrl, ExternalLink } from "../../safe-content";
import { LABEL, SectionSkeleton, SectionUnavailable, VotingOptionList, votingOptions, type VotingOption } from "../../ui";
import { hiddenAnswersLine, questionTypeLabel } from "./questionOptions";

const SECTION = "Question";

const NO_META_EVIDENCE = "This dispute has no meta-evidence, so its question and voting options cannot be shown.";

/** `null` until the arbitrator's dispute is read: every answer the meta-evidence lists is then shown. */
function numberOfChoices(lookup: SectionData<DisputeLookup>): bigint | null {
  return lookup.status === "ready" && lookup.value.status === "found" ? lookup.value.dispute.numberOfChoices : null;
}

interface VotingOptionsSectionProps {
  readonly options: readonly VotingOption[];
  readonly hiddenAnswers: number;
  readonly disputeId: bigint;
  readonly chainId: number;
}

function VotingOptionsSection({ options, hiddenAnswers, disputeId, chainId }: VotingOptionsSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <h3 id={headingId} className="text-base leading-6 font-semibold text-klerosUIComponentsPrimaryText">
        Voting options
      </h3>
      <VotingOptionList options={options} className="mt-2" />
      {hiddenAnswers > 0 ? <p className={`mt-4 ${LABEL}`}>{hiddenAnswersLine(hiddenAnswers)}</p> : null}
      <p className={`mt-6 ${LABEL}`}>
        Note that you can only view the voting options. Selected jurors can vote using <ExternalLink href={courtCaseUrl(disputeId, chainId)}>Court</ExternalLink>.
      </p>
    </section>
  );
}

interface QuestionContentProps {
  readonly metaEvidence: MetaEvidence;
  readonly numberOfChoices: bigint | null;
  readonly disputeId: bigint;
  readonly chainId: number;
}

function QuestionContent({ metaEvidence, numberOfChoices, disputeId, chainId }: QuestionContentProps) {
  const { question, rulingOptions } = metaEvidence;
  const label = rulingOptions === null ? null : questionTypeLabel(rulingOptions.type);
  const within = rulingOptions === null ? null : optionsWithinChoices(rulingOptions, numberOfChoices);
  const options = within === null ? null : votingOptions(within.rulingOptions);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {question === null && label === null ? null : (
        <div className="flex flex-col gap-1">
          {question === null ? null : (
            <p className="whitespace-pre-line text-lg leading-7 font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere] text-pretty">{question}</p>
          )}
          {label === null ? null : <p className={LABEL}>{label}</p>}
        </div>
      )}
      {options === null || within === null ? null : <VotingOptionsSection options={options} hiddenAnswers={within.hiddenAnswers} disputeId={disputeId} chainId={chainId} />}
    </div>
  );
}

interface QuestionPanelProps extends CaseSectionProps {
  readonly onRetry?: () => void;
}

export function QuestionPanel({ dispute, chain, onRetry }: QuestionPanelProps) {
  const source = metaEvidenceSection(dispute.metaEvidence, NO_META_EVIDENCE);
  switch (source.status) {
    case "loading":
      return <SectionSkeleton variant="text" lines={3} />;
    case "unavailable":
      return <SectionUnavailable section={SECTION} error={source.error} onRetry={onRetry} />;
    case "ready":
      return <QuestionContent metaEvidence={source.value} numberOfChoices={numberOfChoices(dispute.lookup)} disputeId={dispute.disputeId} chainId={chain.id} />;
  }
}
