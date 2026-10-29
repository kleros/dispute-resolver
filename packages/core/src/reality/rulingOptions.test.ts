import { describe, expect, it } from "vitest";
import { encodeAnswer, formatRuling } from "../rulings";
import attack from "./__fixtures__/attack-questions.json";
import { deriveRealityRulingOptions, rulingOptionsFromRealityQuestion } from "./rulingOptions";
import type { RealityQuestion } from "./types";

const D = "␟";
const RESERVED = { "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF": "Answered Too Soon" };
const TEMPLATE_BOOL = '{"title": "%s", "type": "bool", "category": "%s", "lang": "%s"}';
const TEMPLATE_SINGLE_SELECT = '{"title": "%s", "type": "single-select", "outcomes": [%s], "category": "%s", "lang": "%s"}';
const TEMPLATE_DESCRIBED = '{"title": "%s", "description": "%s", "type": "bool"}';
const TEMPLATE_UINT_DECIMALS = '{"title": "%s", "type": "uint", "decimals": %s}';
const TEMPLATE_20 = attack.template20.templateText;
const QUESTION_0x7eea = attack.question0x7eea.questionText;

const ENTRY = { answeredTooSoon: true, localizedLang: null, questionOverride: null } as const;

function onChain(templateText: string, questionText: string, templateId = "1"): RealityQuestion {
  return { questionId: `0x${"ab".repeat(32)}`, templateId, templateText, questionText, reality: "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd", realityChainId: 1 };
}

describe("deriveRealityRulingOptions", () => {
  it("derives the bool labels of dispute 1680's template and flags reality-eth-lib's divergent rendering", () => {
    const { rulingOptions, realityQuestion, question } = deriveRealityRulingOptions(onChain(TEMPLATE_20, QUESTION_0x7eea, "20"), ENTRY);
    expect(rulingOptions).toEqual({ type: "single-select", titles: ["No", "Yes"], reserved: RESERVED });
    expect(realityQuestion).toMatchObject({ status: "verified", divergent: true, templateId: "20" });
    expect(realityQuestion.title).toContain('0x1275956c","title":');
    expect(question).toBeUndefined();
  });

  it("reports no divergence for a clean question and overrides the question with its title when asked to", () => {
    const { rulingOptions, realityQuestion, question } = deriveRealityRulingOptions(onChain(TEMPLATE_SINGLE_SELECT, ["Who?", '"A","B"', "misc", "en_US"].join(D)), {
      ...ENTRY,
      questionOverride: "title",
    });
    expect(rulingOptions).toEqual({ type: "single-select", titles: ["A", "B"], reserved: RESERVED });
    expect(realityQuestion).toMatchObject({ status: "verified", divergent: false, title: "Who?" });
    expect(question).toBe("Who?");
  });

  it("omits the reserved answer for Reality.eth v2 arbitrables", () => {
    const question = onChain(TEMPLATE_BOOL, ["Yes?", "misc", "en_US"].join(D));
    expect(deriveRealityRulingOptions(question, { ...ENTRY, answeredTooSoon: false }).rulingOptions).toEqual({ type: "single-select", titles: ["No", "Yes"] });
  });

  it("localizes the labels like the Kleros Moderate script", () => {
    const question = onChain(TEMPLATE_BOOL, ["¿Sí?", "misc", "es"].join(D));
    expect(deriveRealityRulingOptions(question, { ...ENTRY, localizedLang: "es" }).rulingOptions).toEqual({
      type: "single-select",
      titles: ["No", "Sí"],
      reserved: { "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF": "Respondió demasiado pronto" },
    });
    expect(deriveRealityRulingOptions(question, { ...ENTRY, localizedLang: "es" }).realityQuestion.divergent).toBe(false);
  });

  it("uses the best-effort question when a select question misses parameters", () => {
    const { rulingOptions, realityQuestion } = deriveRealityRulingOptions(onChain(TEMPLATE_SINGLE_SELECT, ["Who?", '"A","B"', "misc"].join(D)), ENTRY);
    expect(rulingOptions.titles).toEqual(["A", "B"]);
    expect(realityQuestion).toMatchObject({ status: "malformed", reason: "param-count-mismatch" });
  });

  it("falls back to the template for malformed parameters of a bool question", () => {
    const { rulingOptions, realityQuestion } = deriveRealityRulingOptions(onChain(TEMPLATE_BOOL, ['He said "hi"', "misc", "en_US", "extra"].join(D)), ENTRY);
    expect(rulingOptions.titles).toEqual(["No", "Yes"]);
    expect(realityQuestion.status).toBe("malformed");
  });

  it("offers no options when a select question's outcomes cannot be trusted, and neither flags it divergent nor overrides its question", () => {
    const result = deriveRealityRulingOptions(onChain(TEMPLATE_SINGLE_SELECT, ["Who?", '"A"],"type":"bool","z":["', "misc", "en_US"].join(D)), {
      ...ENTRY,
      questionOverride: "title",
    });
    expect(result.rulingOptions).toEqual({ type: "single-select", titles: [] });
    expect(result.realityQuestion).toMatchObject({ status: "unresolvable", reason: "invalid-outcomes", divergent: false });
    expect(result).not.toHaveProperty("question");
  });

  it("joins the title and the description for the title-description override", () => {
    const question = onChain(TEMPLATE_DESCRIBED, ["Is it?", "Details here."].join(D));
    expect(deriveRealityRulingOptions(question, { ...ENTRY, questionOverride: "title-description" }).question).toBe("Is it?. Details here.");
    expect(deriveRealityRulingOptions(onChain(TEMPLATE_DESCRIBED, ["Is it?", ""].join(D)), { ...ENTRY, questionOverride: "title-description" }).question).toBe("Is it?");
    expect(deriveRealityRulingOptions(onChain(TEMPLATE_DESCRIBED, ["", "Only details."].join(D)), { ...ENTRY, questionOverride: "title-description" }).question).toBe(
      "Only details.",
    );
    expect(deriveRealityRulingOptions(question, { ...ENTRY, questionOverride: "title" }).question).toBe("Is it?");
  });

  it("titles outcomes that String() cannot convert as the meta-evidence sanitizer does", () => {
    const question = { type: "single-select", outcomes: [{ toString: 1 }, "B", 3] };
    expect(rulingOptionsFromRealityQuestion(question, { answeredTooSoon: false })).toEqual({ type: "single-select", titles: ["[object Object]", "B", "3"] });
  });

  it("reports a hostile unsafe rendering as divergent and keeps the safely derived options", () => {
    const hostileLang = 'en", "type": "single-select", "outcomes": [{"toString": 1}], "z": "';
    const { rulingOptions, realityQuestion } = deriveRealityRulingOptions(onChain(TEMPLATE_BOOL, ["Yes?", "misc", hostileLang].join(D)), ENTRY);
    expect(rulingOptions).toEqual({ type: "single-select", titles: ["No", "Yes"], reserved: RESERVED });
    expect(realityQuestion).toMatchObject({ status: "verified", divergent: true });
  });

  it("carries a hexadecimal decimals as the precision reality-eth-lib reads", () => {
    const { rulingOptions, realityQuestion } = deriveRealityRulingOptions(onChain(TEMPLATE_UINT_DECIMALS, ["How many?", '"0x12"'].join(D)), ENTRY);
    expect(rulingOptions.precision).toBe(18);
    expect(realityQuestion).toMatchObject({ status: "verified", divergent: false });
  });

  it("a uint question without decimals has precision 0, so the answer 5 encodes to ruling 6 and ruling 6 reads 5", () => {
    const { rulingOptions } = deriveRealityRulingOptions(onChain('{"title": "%s", "type": "uint"}', "How many?"), ENTRY);
    expect(rulingOptions).toEqual({ type: "uint", precision: 0, reserved: RESERVED });
    expect(encodeAnswer({ type: "uint", value: "5" }, rulingOptions)).toEqual({ ok: true, code: 6n });
    expect(formatRuling(6n, rulingOptions, null)).toBe("5");
  });

  it("stringifies outcomes of the template that are not strings", () => {
    const template = '{"title": "%s", "type": "single-select", "outcomes": ["A", 1, null, {"b": 2}]}';
    expect(deriveRealityRulingOptions(onChain(template, "Which?"), ENTRY).rulingOptions.titles).toEqual(["A", "1", "null", "[object Object]"]);
  });
});
