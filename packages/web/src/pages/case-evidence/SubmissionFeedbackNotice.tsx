import { Notice } from "../../ui";
import { WriteStatusNotice } from "../../wallet";
import type { SubmissionFeedback } from "./useEvidenceSubmission";

/** The last outcome of a submission: the write flow's notice (with its switch and connect offers) or the upload's. */
export function SubmissionFeedbackNotice({ feedback }: { readonly feedback: SubmissionFeedback }) {
  if (feedback.kind === "write") return <WriteStatusNotice status={feedback.status} />;
  const { variant, title, body } = feedback.notice;
  return (
    <div aria-live="polite">
      <Notice variant={variant} title={title} body={body} />
    </div>
  );
}
