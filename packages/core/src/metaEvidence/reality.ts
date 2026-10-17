import type { RealityQuestionInfo } from "../reality/types";
import type { RulingOptions } from "../rulings/types";
import type { RealityNotice, RealityNoticeKind } from "./types";

/**
 * The Reality status of an unregistered Reality.eth renderer script (A4, spec 9.1 step 7.6): a script whose question JSON
 * had duplicate keys is `unresolvable` and its ruling options are replaced by an empty single-select; any other is
 * `unverified`, keeping the options it returned.
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
 * The single Reality notice of spec 5.10, first match in a fixed priority order: `unresolvable`, `unverified`,
 * `divergent === true`, `malformed`; `none` otherwise or without a Reality status. The on-chain title is carried.
 */
export function realityNotice(info: RealityQuestionInfo | null): RealityNotice {
  if (info === null) return { kind: "none", title: null };
  return { kind: noticeKind(info), title: info.title ?? null };
}
