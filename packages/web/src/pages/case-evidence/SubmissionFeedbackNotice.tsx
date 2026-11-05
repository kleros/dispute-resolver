import { Notice } from "../../ui";
import type { SubmissionNotice } from "./useEvidenceSubmission";

/**
 * What stopped a submission before its write: it rises into view as it is set, and it is keyed by what it says, so a
 * different notice plays it again.
 */
export function SubmissionFeedbackNotice({ notice }: { readonly notice: SubmissionNotice }) {
  const { variant, title, body } = notice;
  return (
    <div aria-live="polite">
      <Notice key={`${variant}\n${title}\n${body}`} variant={variant} title={title} body={body} reveal />
    </div>
  );
}
