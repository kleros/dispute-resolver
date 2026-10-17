import { describe, expect, it } from "vitest";
import attack from "./__fixtures__/attack-questions.json";
import { deriveRealityRulingOptions, rulingOptionsFromRealityQuestion } from "./rulingOptions";
import type { RealityQuestion } from "./types";

const D = "␟";
const RESERVED = { "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF": "Answered Too Soon" };
const TEMPLATE_BOOL = '{"title": "%s", "type": "bool", "category": "%s", "lang": "%s"}';
const TEMPLATE_SINGLE_SELECT = '{"title": "%s", "type": "single-select", "outcomes": [%s], "category": "%s", "lang": "%s"}';
const TEMPLATE_DESCRIBED = '{"title": "%s", "description": "%s", "type": "bool"}';
const TEMPLATE_20 = attack.template20.templateText;
const QUESTION_0x7eea = attack.question0x7eea.questionText;

/** The registry fields the derivation reads, as `REALITY_PROXIES` sets them for a Reality.eth v3 arbitrable. */
const ENTRY = { answeredTooSoon: true, localizedLang: null, questionOverride: null } as const;

function onChain(templateText: string, questionText: string, templateId = "1"): RealityQuestion {
  return { questionId: `0x${"ab".repeat(32)}`, templateId, templateText, questionText, reality: "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd", realityChainId: 1 };
}

describe("deriveRealityRulingOptions", () => {
  it("A5: derives the bool labels of dispute 1680's template and flags the divergent rendering of reality-eth-lib", () => {
    const { rulingOptions, realityQuestion, question } = deriveRealityRulingOptions(onChain(TEMPLATE_20, QUESTION_0x7eea, "20"), ENTRY);
    expect(rulingOptions).toEqual({ type: "single-select", titles: ["No", "Yes"], reserved: RESERVED });
    expect(realityQuestion).toMatchObject({ status: "verified", divergent: true, templateId: "20" });
    expect(realityQuestion.title).toContain('0x1275956c","title":');
    expect(question).toBeUndefined();
  });

  it("A5: reports no divergence for a clean question and overrides the question with its title when asked to", () => {
    const { rulingOptions, realityQuestion, question } = deriveRealityRulingOptions(onChain(TEMPLATE_SINGLE_SELECT, ["Who?", '"A","B"', "misc", "en_US"].join(D)), {
      ...ENTRY,
      questionOverride: "title",
    });
    expect(rulingOptions).toEqual({ type: "single-select", titles: ["A", "B"], reserved: RESERVED });
    expect(realityQuestion).toMatchObject({ status: "verified", divergent: false, title: "Who?" });
    expect(question).toBe("Who?");
  });

  it("A5: omits the reserved answer for Reality.eth v2 arbitrables", () => {
    const question = onChain(TEMPLATE_BOOL, ["Yes?", "misc", "en_US"].join(D));
    expect(deriveRealityRulingOptions(question, { ...ENTRY, answeredTooSoon: false }).rulingOptions).toEqual({ type: "single-select", titles: ["No", "Yes"] });
  });

  it("A5: localizes the labels like the Kleros Moderate script", () => {
    const question = onChain(TEMPLATE_BOOL, ["¿Sí?", "misc", "es"].join(D));
    expect(deriveRealityRulingOptions(question, { ...ENTRY, localizedLang: "es" }).rulingOptions).toEqual({
      type: "single-select",
      titles: ["No", "Sí"],
      reserved: { "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF": "Respondió demasiado pronto" },
    });
    expect(deriveRealityRulingOptions(question, { ...ENTRY, localizedLang: "es" }).realityQuestion.divergent).toBe(false);
  });

  it("A5: uses the best-effort question when a select question misses parameters", () => {
    const { rulingOptions, realityQuestion } = deriveRealityRulingOptions(onChain(TEMPLATE_SINGLE_SELECT, ["Who?", '"A","B"', "misc"].join(D)), ENTRY);
    expect(rulingOptions.titles).toEqual(["A", "B"]);
    expect(realityQuestion).toMatchObject({ status: "malformed", reason: "param-count-mismatch" });
  });

  it("A5: falls back to the template for malformed parameters of a bool question", () => {
    const { rulingOptions, realityQuestion } = deriveRealityRulingOptions(onChain(TEMPLATE_BOOL, ['He said "hi"', "misc", "en_US", "extra"].join(D)), ENTRY);
    expect(rulingOptions.titles).toEqual(["No", "Yes"]);
    expect(realityQuestion.status).toBe("malformed");
  });

  it("A5: offers no options when a select question's outcomes cannot be trusted", () => {
    const { rulingOptions, realityQuestion } = deriveRealityRulingOptions(onChain(TEMPLATE_SINGLE_SELECT, ["Who?", '"A"],"type":"bool","z":["', "misc", "en_US"].join(D)), ENTRY);
    expect(rulingOptions).toEqual({ type: "single-select", titles: [] });
    expect(realityQuestion).toMatchObject({ status: "unresolvable", reason: "invalid-outcomes" });
  });

  it("§10.4: an unresolvable question is not flagged divergent and has no question override", () => {
    const result = deriveRealityRulingOptions(onChain(TEMPLATE_SINGLE_SELECT, ["Who?", '"A"],"type":"bool","z":["', "misc", "en_US"].join(D)), {
      ...ENTRY,
      questionOverride: "title",
    });
    expect(result.realityQuestion.divergent).toBe(false);
    expect(result).not.toHaveProperty("question");
  });

  it("§10.4: the title-description override joins the title and the description", () => {
    const question = onChain(TEMPLATE_DESCRIBED, ["Is it?", "Details here."].join(D));
    expect(deriveRealityRulingOptions(question, { ...ENTRY, questionOverride: "title-description" }).question).toBe("Is it?. Details here.");
    expect(deriveRealityRulingOptions(onChain(TEMPLATE_DESCRIBED, ["Is it?", ""].join(D)), { ...ENTRY, questionOverride: "title-description" }).question).toBe("Is it?");
    expect(deriveRealityRulingOptions(onChain(TEMPLATE_DESCRIBED, ["", "Only details."].join(D)), { ...ENTRY, questionOverride: "title-description" }).question).toBe(
      "Only details.",
    );
    expect(deriveRealityRulingOptions(question, { ...ENTRY, questionOverride: "title" }).question).toBe("Is it?");
  });

  it("R2 A5 §9.1: outcomes that String() cannot convert are titled as the meta-evidence sanitizer titles them", () => {
    const question = { type: "single-select", outcomes: [{ toString: 1 }, "B", 3] };
    expect(rulingOptionsFromRealityQuestion(question, { answeredTooSoon: false })).toEqual({ type: "single-select", titles: ["[object Object]", "B", "3"] });
  });

  it("R2 A5 §9.1: a hostile unsafe rendering is reported as divergent and never discards the safely derived options", () => {
    const hostileLang = 'en", "type": "single-select", "outcomes": [{"toString": 1}], "z": "';
    const { rulingOptions, realityQuestion } = deriveRealityRulingOptions(onChain(TEMPLATE_BOOL, ["Yes?", "misc", hostileLang].join(D)), ENTRY);
    expect(rulingOptions).toEqual({ type: "single-select", titles: ["No", "Yes"], reserved: RESERVED });
    expect(realityQuestion).toMatchObject({ status: "verified", divergent: true });
  });

  it("A5: carries decimals as the precision reality-eth-lib reads, so the precision shown is the one encoded", () => {
    const template = '{"title": "%s", "type": "uint", "decimals": %s}';
    const precisionOf = (decimals: string) => deriveRealityRulingOptions(onChain(template, ["How many?", decimals].join(D)), ENTRY).rulingOptions.precision;
    expect(precisionOf("18")).toBe(18);
    expect(precisionOf("0")).toBe(0);
    expect(precisionOf('"6"')).toBe(6);
    expect(precisionOf("true")).toBe(0);
    expect(precisionOf('"1e2"')).toBe(1);
    expect(precisionOf("2.7")).toBe(2);
    expect(precisionOf("-3")).toBe(0);
  });

  it("R1 A5 D-15: carries a hexadecimal decimals as the precision reality-eth-lib reads", () => {
    const template = '{"title": "%s", "type": "uint", "decimals": %s}';
    const { rulingOptions, realityQuestion } = deriveRealityRulingOptions(onChain(template, ["How many?", '"0x12"'].join(D)), ENTRY);
    expect(rulingOptions.precision).toBe(18);
    expect(realityQuestion).toMatchObject({ status: "verified", divergent: false });
  });

  it("A5: drops a decimals that today's app encodes with the default 18 (not a finite number, or null, false or empty)", () => {
    const template = '{"title": "%s", "type": "uint", "decimals": %s}';
    const precisionOf = (decimals: string) => deriveRealityRulingOptions(onChain(template, ["How many?", decimals].join(D)), ENTRY).rulingOptions.precision;
    expect(precisionOf("null")).toBeUndefined();
    expect(precisionOf("false")).toBeUndefined();
    expect(precisionOf('""')).toBeUndefined();
    expect(precisionOf('"1_000"')).toBeUndefined();
    expect(precisionOf('"abc"')).toBeUndefined();
  });

  it("A5: stringifies outcomes of the template that are not strings", () => {
    const template = '{"title": "%s", "type": "single-select", "outcomes": ["A", 1, null, {"b": 2}]}';
    expect(deriveRealityRulingOptions(onChain(template, "Which?"), ENTRY).rulingOptions.titles).toEqual(["A", "1", "null", "[object Object]"]);
  });
});
