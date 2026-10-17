import type { RealityProxyEntry } from "../registry/types";
import { parsePrecision, toText } from "../rulings";
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

/** What the entry's registered script reproduces (REALITY_OPS.md, step 5). */
export interface RulingOptionsFlags {
  /** Whether to offer the reserved "Answered Too Soon" answer (Reality.eth v3 only); default true. */
  readonly answeredTooSoon?: boolean;
  /** The language whose labels are translated when the question uses it (Kleros Moderate's script translates to Spanish). */
  readonly localizedLang?: "es" | null;
}

/**
 * Kleros ruling options for a Reality.eth question, as computed by the kleros/realitio-script dynamic script.
 * `null` for an unsupported question type. Outcome titles are read as today's sanitizer reads them (spec 9.1 step 9):
 * `String(title)`, made total by `toText`.
 */
export function rulingOptionsFromRealityQuestion(question: PopulatedQuestion, { answeredTooSoon = true, localizedLang = null }: RulingOptionsFlags = {}): RulingOptions | null {
  if (!isPlainObject(question)) return null;
  const labels = localizedLang !== null && question.lang === localizedLang ? LOCALIZED_LABELS[localizedLang] : undefined;
  const withReserved = (rulingOptions: RulingOptions): RulingOptions =>
    answeredTooSoon ? { ...rulingOptions, reserved: { [ANSWERED_TOO_SOON]: labels?.answeredTooSoon ?? "Answered Too Soon" } } : rulingOptions;
  switch (question.type) {
    case "bool":
      return withReserved({ type: "single-select", titles: ["No", labels?.yes ?? "Yes"] });
    case "uint": {
      const precision = parsePrecision(question.decimals);
      return withReserved(precision === undefined ? { type: "uint" } : { type: "uint", precision });
    }
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
 * Kleros ruling options derived from the template alone, ignoring the question parameters. Only possible for question
 * types whose answers do not depend on the parameters (bool, datetime, and uint when `decimals` is a literal number).
 * Used as a fallback when the question parameters are malformed. `null` when the parameters are needed to know the
 * answers.
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
 * show different options. `null` when that rendering has no options or fails anywhere, parsing or deriving: hostile
 * comparison data then reads as divergent and never aborts the safe derivation (A5).
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

/** The question text a registry entry replaces the meta-evidence question with. */
function questionOverride(question: PopulatedQuestion | undefined, override: NonNullable<RealityProxyEntry["questionOverride"]>): string | undefined {
  if (question === undefined || typeof question.title !== "string") return undefined;
  if (override === "title-description" && typeof question.description === "string" && question.description !== "") {
    return question.title === "" ? question.description : `${question.title}. ${question.description}`;
  }
  return question.title;
}

/**
 * Derives the ruling options of a Reality.eth dispute from its on-chain template and question (spec 9.1 step 8, A5).
 *
 * `realityQuestion.status` is "verified" (question rendered safely), "malformed" (malformed question parameters: the
 * options come from a best-effort rendering or from the template alone) or "unresolvable" (no trustworthy options).
 * `realityQuestion.divergent` is true when reality-eth-lib, used by other interfaces and by the evidence display,
 * renders options that differ from the derived ones. `question` is the meta-evidence question override, if any.
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
