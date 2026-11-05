import { Notice } from "../../ui";
import { WriteStatusNotice } from "../../wallet";
import type { SubmissionFeedback } from "./useEvidenceSubmission";

/**
 * The last outcome of a submission: the write flow's notice (with its switch and connect offers) or the upload's. The
 * upload's outcome rises into view as it is set; it is keyed by what it says, so a different outcome plays it again.
 */
export function SubmissionFeedbackNotice({ feedback }: { readonly feedback: SubmissionFeedback }) {
  if (feedback.kind === "write") return <WriteStatusNotice status={feedback.status} />;
  const { variant, title, body } = feedback.notice;
  return (
    <div aria-live="polite">
      <Notice key={`${variant}\n${title}\n${body}`} variant={variant} title={title} body={body} reveal />
    </div>
  );
}
