import type { RealityProxyEntry } from "../registry/types";
import { parseRealityDecimals, toText } from "../rulings";
import type { RulingOptions } from "../rulings/types";
import { QUESTION_PARAMS_DELIMITER } from "./constants";
import { isPlainObject } from "./jsonParser";
import { analyzedTemplate, safePopulatedJSONForTemplate } from "./safeQuestion";
import type { DerivedRealityOptions, PopulatedQuestion, RealityQuestion, RealityQuestionInfo, RealityStatus } from "./types";

/** The reserved answer Reality.eth v3 uses for "Answered Too Soon". */
const ANSWERED_TOO_SOON = "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";

const LOCALIZED_LABELS = {
  es: { yes: "Sí", answeredTooSoon: "Respondió demasiado pronto" },
} as const;

interface RulingOptionsFlags {
  /** Whether to offer the reserved "Answered Too Soon" answer (Reality.eth v3 only); default true. */
  readonly answeredTooSoon?: boolean;
  /** The language whose labels are translated when the question uses it (Kleros Moderate's script translates to Spanish). */
  readonly localizedLang?: "es" | null;
}

/** Mirrors the kleros/realitio-script dynamic script; `null` for an unsupported question type. */
export function rulingOptionsFromRealityQuestion(question: PopulatedQuestion, { answeredTooSoon = true, localizedLang = null }: RulingOptionsFlags = {}): RulingOptions | null {
  if (!isPlainObject(question)) return null;
  const labels = localizedLang !== null && question.lang === localizedLang ? LOCALIZED_LABELS[localizedLang] : undefined;
  const withReserved = (rulingOptions: RulingOptions): RulingOptions =>
    answeredTooSoon ? { ...rulingOptions, reserved: { [ANSWERED_TOO_SOON]: labels?.answeredTooSoon ?? "Answered Too Soon" } } : rulingOptions;
  switch (question.type) {
    case "bool":
      return withReserved({ type: "single-select", titles: ["No", labels?.yes ?? "Yes"] });
    case "uint":
      return withReserved({ type: "uint", precision: parseRealityDecimals(question.decimals) });
    case "single-select":
    case "multiple-select":
      if (!Array.isArray(question.outcomes)) return null;
      return withReserved({ type: question.type, titles: Array.from(question.outcomes, toText) });
    case "datetime":
      return withReserved({ type: "datetime" });
    default:
      return null;
  }
}

/**
 * The fallback for malformed question parameters. Only bool, datetime, and uint with a literal `decimals` have answers
 * that do not depend on the parameters; `null` otherwise.
 */
export function rulingOptionsFromTemplate(templateText: string, options?: RulingOptionsFlags): RulingOptions | null {
  const template = analyzedTemplate(templateText);
  if (template === null) return null;
  const { type, decimals, lang } = template;
  const known = { type, lang: typeof lang === "string" ? lang : undefined };
  if (type === "bool" || type === "datetime") return rulingOptionsFromRealityQuestion(known, options);
  if (type === "uint" && typeof decimals === "number") return rulingOptionsFromRealityQuestion({ ...known, decimals }, options);
  return null;
}

/**
 * The ruling options of what reality-eth-lib's `populatedJSONForTemplate` yields (raw parameter substitution, then
 * `JSON.parse` where the last duplicate key wins): used only to tell whether other interfaces rendering the question may
 * show different options. `null` when that rendering has no options or fails anywhere, parsing or deriving: comparison
 * data that fails then reads as divergent and never aborts the safe derivation.
 */
function unsafeRulingOptions(templateText: string, questionText: string, flags: RulingOptionsFlags): RulingOptions | null {
  const params = questionText.split(QUESTION_PARAMS_DELIMITER);
  let index = 0;
  const interpolated = templateText.replaceAll("%s", () => (index < params.length ? (params[index++] ?? "") : ""));
  try {
    const unsafe: unknown = JSON.parse(interpolated.replaceAll("\0", ""));
    return isPlainObject(unsafe) ? rulingOptionsFromRealityQuestion(unsafe, flags) : null;
  } catch {
    return null;
  }
}

function sameRulingOptions(a: RulingOptions | null, b: RulingOptions): boolean {
  return a !== null && a.type === b.type && JSON.stringify(a.titles ?? null) === JSON.stringify(b.titles ?? null) && String(a.precision ?? "") === String(b.precision ?? "");
}

function questionOverride(question: PopulatedQuestion | undefined, override: NonNullable<RealityProxyEntry["questionOverride"]>): string | undefined {
  if (question === undefined || typeof question.title !== "string") return undefined;
  if (override === "title-description" && typeof question.description === "string" && question.description !== "") {
    return question.title === "" ? question.description : `${question.title}. ${question.description}`;
  }
  return question.title;
}

/**
 * `realityQuestion.status` is "verified" (question rendered safely), "malformed" (malformed question parameters: the
 * options come from a best-effort rendering or from the template alone) or "unresolvable" (no trustworthy options).
 * `realityQuestion.divergent` is true when reality-eth-lib, used by other interfaces and by the evidence display,
 * renders options that differ from the derived ones.
 */
export function deriveRealityRulingOptions(
  question: RealityQuestion,
  entry: Pick<RealityProxyEntry, "answeredTooSoon" | "localizedLang" | "questionOverride">,
): DerivedRealityOptions {
  const { templateText, questionText, questionId, templateId } = question;
  const flags: RulingOptionsFlags = { answeredTooSoon: entry.answeredTooSoon, localizedLang: entry.localizedLang };
  const safe = safePopulatedJSONForTemplate(templateText, questionText);
  const rendered = safe.ok || safe.bestEffort === true ? safe.question : undefined;

  let rulingOptions = rendered === undefined ? null : rulingOptionsFromRealityQuestion(rendered, flags);
  let status: RealityStatus = safe.ok && rulingOptions !== null ? "verified" : "malformed";
  rulingOptions ??= rulingOptionsFromTemplate(templateText, flags);
  if (rulingOptions === null) {
    status = "unresolvable";
    rulingOptions = { type: "single-select", titles: [] };
  }

  const unsafe = unsafeRulingOptions(templateText, questionText, flags);
  const title = typeof rendered?.title === "string" ? rendered.title : undefined;

  const realityQuestion: RealityQuestionInfo = {
    status,
    ...(safe.ok ? {} : { reason: safe.reason }),
    divergent: status !== "unresolvable" && !sameRulingOptions(unsafe, rulingOptions),
    questionId,
    templateId,
    ...(title === undefined ? {} : { title }),
  };
  const override = entry.questionOverride === null ? undefined : questionOverride(rendered, entry.questionOverride);
  return { rulingOptions, realityQuestion, ...(override === undefined ? {} : { question: override }) };
}
