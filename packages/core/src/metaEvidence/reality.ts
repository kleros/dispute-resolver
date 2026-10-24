import type { RealityQuestionInfo } from "../reality/types";
import type { RulingOptions } from "../rulings/types";
import type { RealityNotice, RealityNoticeKind } from "./types";

/**
 * For an unregistered Reality.eth renderer script: one whose question JSON had duplicate keys is `unresolvable` and its
 * ruling options are replaced by an empty single-select; any other is `unverified`, keeping the options it returned.
 */
export function realityFromScript(jsonDuplicateKeys: boolean): { readonly realityQuestion: RealityQuestionInfo; readonly rulingOptions?: RulingOptions } {
  if (jsonDuplicateKeys) return { realityQuestion: { status: "unresolvable" }, rulingOptions: { type: "single-select", titles: [] } };
  return { realityQuestion: { status: "unverified" } };
}

function noticeKind(info: RealityQuestionInfo): RealityNoticeKind {
  if (info.status === "unresolvable") return "unresolvable";
  if (info.status === "unverified") return "unverified";
  if (info.divergent === true) return "divergent";
  return info.status === "malformed" ? "malformed" : "none";
}

/**
 * A single notice, the first match in a fixed priority order: `unresolvable`, `unverified`, `divergent === true`,
 * `malformed`.
 */
export function realityNotice(info: RealityQuestionInfo | null): RealityNotice {
  if (info === null) return { kind: "none", title: null };
  return { kind: noticeKind(info), title: info.title ?? null };
}
