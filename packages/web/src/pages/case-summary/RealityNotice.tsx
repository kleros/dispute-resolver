import { realityNotice, type RealityNoticeKind } from "@dispute-resolver/core";
import { Notice, type NoticeVariant } from "../../ui";
import type { CaseSectionProps } from "../../data";

interface NoticeCopy {
  readonly variant: NoticeVariant;
  readonly title: string;
  readonly body: string;
}

const NOTICES: Readonly<Record<Exclude<RealityNoticeKind, "none">, NoticeCopy>> = {
  unresolvable: {
    variant: "error",
    title: "The answer options of this question could not be determined",
    body: "The question recorded on-chain is malformed. If in doubt, refuse to arbitrate.",
  },
  unverified: {
    variant: "warning",
    title: "The answer options of this question could not be verified",
    body: "The resolver interface could not independently verify the answer options of this Reality.eth question. Read the question and the arbitrable application's data carefully before voting.",
  },
  divergent: {
    variant: "warning",
    title: "Other interfaces may show different answer options for this question",
    body: "The question recorded on-chain is displayed with different answer options by interfaces that render it with the reality.eth library, including the evidence display. The options shown here were derived by the resolver from the on-chain question and its template: vote according to them.",
  },
  malformed: {
    variant: "info",
    title: "The question parameters are malformed",
    body: "The answer options shown here were derived from the question template only. Read the question carefully before voting.",
  },
};

export function RealityNotice({ dispute }: CaseSectionProps) {
  const { metaEvidence } = dispute;
  if (metaEvidence.status !== "ready" || metaEvidence.value.status !== "ok") return null;
  const notice = realityNotice(metaEvidence.value.metaEvidence.realityQuestion);
  if (notice.kind === "none") return null;
  const { variant, title, body } = NOTICES[notice.kind];
  const text = notice.title ? `${body}\n\nQuestion recorded on-chain: ${notice.title}` : body;
  return <Notice variant={variant} title={title} body={text} />;
}
