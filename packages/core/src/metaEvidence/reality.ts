import type { RealityQuestionInfo } from "../reality/types";
import type { RealityNotice, RealityNoticeKind } from "./types";

function noticeKind(info: RealityQuestionInfo): RealityNoticeKind {
  if (info.status === "unresolvable") return "unresolvable";
  if (info.status === "unverified") return "unverified";
  if (info.divergent === true) return "divergent";
  return info.status === "malformed" ? "malformed" : "none";
}

export function realityNotice(info: RealityQuestionInfo | null): RealityNotice {
  if (info === null) return { kind: "none", title: null };
  return { kind: noticeKind(info), title: info.title ?? null };
}
