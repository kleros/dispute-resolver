import { describe, expect, it } from "vitest";
import attack from "./__fixtures__/attack-questions.json";
import { rulingOptionsFromRealityQuestion, rulingOptionsFromTemplate } from "./rulingOptions";
import { safePopulatedJSONForTemplate } from "./safeQuestion";
import type { PopulatedQuestion, SafePopulateResult } from "./types";

const D = "␟";

const RESERVED = { "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF": "Answered Too Soon" };

// Built-in Reality.eth v3 templates.
const TEMPLATE_BOOL = '{"title": "%s", "type": "bool", "category": "%s", "lang": "%s"}';
const TEMPLATE_UINT = '{"title": "%s", "type": "uint", "decimals": 18, "category": "%s", "lang": "%s"}';
const TEMPLATE_SINGLE_SELECT = '{"title": "%s", "type": "single-select", "outcomes": [%s], "category": "%s", "lang": "%s"}';
const TEMPLATE_MULTIPLE_SELECT = '{"title": "%s", "type": "multiple-select", "outcomes": [%s], "category": "%s", "lang": "%s"}';
const TEMPLATE_DATETIME = '{"title": "%s", "type": "datetime", "category": "%s", "lang": "%s"}';

const TEMPLATE_20 = attack.template20.templateText;
const QUESTION_0x7eea = attack.question0x7eea.questionText;
const TEMPLATE_35 = attack.template35.templateText;
const QUESTION_0xdd28 = attack.syntheticFrom0xdd28.questionText;

function populated(result: SafePopulateResult): PopulatedQuestion {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`expected a populated question, got ${result.reason}`);
  return result.question;
}

describe("safePopulatedJSONForTemplate", () => {
  it("does not let question 0x7eea… turn a bool template into a single-select", () => {
    const question = populated(safePopulatedJSONForTemplate(TEMPLATE_20, QUESTION_0x7eea));
    expect(question.type).toBe("bool");
    expect(Object.keys(question)).toEqual(["lang", "type", "category", "title"]);
    expect(question).not.toHaveProperty("outcomes");
    expect(question.title).toMatch(
      /^Did the Snapshot proposal with the id 0x1275956c","title":"Did the Snapshot proposal .*"type":"single-select","outcomes":\["Yes","No"\],"has_invalid":false,"z":" in the 1inch\.eth space pass the execution of the array of Module transactions that have the hash 0xe423d891/,
    );
    expect(rulingOptionsFromRealityQuestion(question)).toEqual({ type: "single-select", titles: ["No", "Yes"], reserved: RESERVED });
  });

  it("does not let question 0xdd28… add title_html", () => {
    const question = populated(safePopulatedJSONForTemplate(TEMPLATE_35, QUESTION_0xdd28));
    expect(question.type).toBe("bool");
    expect(question).not.toHaveProperty("title_html");
    expect(question).not.toHaveProperty("z");
    expect(Object.keys(question)).toEqual(["lang", "type", "category", "title"]);
    expect(question.title).toContain("<img src=x");
    expect(rulingOptionsFromRealityQuestion(question)?.titles).toEqual(["No", "Yes"]);
  });

  it("renders a clean single-select question with escaped quotes in the title", () => {
    const question = `Will \\"Team A\\" win?${D}"A","B"${D}sports${D}en_US`;
    const result = safePopulatedJSONForTemplate(TEMPLATE_SINGLE_SELECT, question);
    expect(result).toEqual({
      ok: true,
      question: {
        title: 'Will "Team A" win?',
        type: "single-select",
        outcomes: ["A", "B"],
        category: "sports",
        lang: "en_US",
      },
    });
    expect(rulingOptionsFromRealityQuestion(populated(result))).toEqual({ type: "single-select", titles: ["A", "B"], reserved: RESERVED });
    expect(populated(safePopulatedJSONForTemplate('{"title": "%s", "type": "single-select", "outcomes": [%s, "C"]}', `T${D}"A"`)).outcomes).toEqual(["A", "C"]);
  });

  it("renders a uint question", () => {
    const result = safePopulatedJSONForTemplate(TEMPLATE_UINT, `How many goals will be scored?${D}sports${D}en_US`);
    const question = populated(result);
    expect(question).toEqual({
      title: "How many goals will be scored?",
      type: "uint",
      decimals: 18,
      category: "sports",
      lang: "en_US",
    });
    expect(rulingOptionsFromRealityQuestion(question)).toEqual({ type: "uint", precision: 18, reserved: RESERVED });
  });

  it("renders a multiple-select question", () => {
    const question = populated(safePopulatedJSONForTemplate(TEMPLATE_MULTIPLE_SELECT, `Which teams will qualify?${D}"Red","Green","Blue"${D}sports${D}en_US`));
    expect(question.type).toBe("multiple-select");
    expect(question.outcomes).toEqual(["Red", "Green", "Blue"]);
    expect(rulingOptionsFromRealityQuestion(question)).toEqual({ type: "multiple-select", titles: ["Red", "Green", "Blue"], reserved: RESERVED });
  });

  it("renders a title containing a raw unescaped quote", () => {
    const result = populated(safePopulatedJSONForTemplate(TEMPLATE_BOOL, `Will "Team A" win?${D}sports${D}en_US`));
    expect(result.title).toBe('Will "Team A" win?');
    expect(result.type).toBe("bool");
  });

  it("escapes backslashes, control characters and invalid escapes in string parameters", () => {
    const result = populated(safePopulatedJSONForTemplate(TEMPLATE_BOOL, `a\\_b\nc\\${D}misc${D}en`));
    expect(result.title).toBe("a\\_b\nc\\");
  });

  it("keeps valid escape sequences", () => {
    const result = populated(safePopulatedJSONForTemplate(TEMPLATE_BOOL, `line\\nbreak \\u00e9${D}misc${D}en`));
    expect(result.title).toBe("line\nbreak é");
  });

  it("rejects outcomes that break out of the array", () => {
    const question = `Title${D}"A"],"type":"bool","x":["B"${D}misc${D}en`;
    expect(safePopulatedJSONForTemplate(TEMPLATE_SINGLE_SELECT, question)).toEqual({ ok: false, reason: "invalid-outcomes" });
  });

  it("rejects non-string outcomes", () => {
    const numbers = safePopulatedJSONForTemplate(TEMPLATE_SINGLE_SELECT, `Title${D}3,4,5${D}misc${D}en`);
    expect(numbers.ok || numbers.reason).toBe("invalid-outcomes");
    const withNull = safePopulatedJSONForTemplate(TEMPLATE_SINGLE_SELECT, `Title${D}"A",null${D}misc${D}en`);
    expect(withNull.ok || withNull.reason).toBe("invalid-outcomes");
  });

  it("reports a parameter count mismatch with a best-effort question", () => {
    expect(safePopulatedJSONForTemplate(TEMPLATE_BOOL, "Title only")).toEqual({
      ok: false,
      reason: "param-count-mismatch",
      bestEffort: true,
      question: { title: "Title only", type: "bool", category: "", lang: "" },
    });
    const extra = safePopulatedJSONForTemplate(TEMPLATE_BOOL, `Title${D}misc${D}en${D}extra`);
    expect(extra.ok || extra.reason).toBe("param-count-mismatch");
    expect(extra.ok ? undefined : extra.question?.lang).toBe("en");
  });

  it("rejects templates that are not valid JSON or have duplicate keys", () => {
    const reason = (template: string) => {
      const result = safePopulatedJSONForTemplate(template, "x");
      return result.ok || result.reason;
    };
    expect(reason('{title: "%s", "type": "bool"}')).toBe("invalid-template");
    expect(reason('{"title": "%s", "type": "bool", "type": "uint"}')).toBe("invalid-template");
    expect(reason('["%s"]')).toBe("invalid-template");
    expect(reason("null")).toBe("invalid-template");
    expect(reason('{"title": "%s", "type": bool}')).toBe("invalid-template");
    expect(reason('{"title": "%s", "type": "bool"} x')).toBe("invalid-template");
    expect(reason('{"title": "%s", "type": trux}')).toBe("invalid-template");
    expect(reason('{"title": "%s", "type": "bool", "x": [1x2]}')).toBe("invalid-template");
    expect(reason('{"title": "%s" x "type": "bool"}')).toBe("invalid-template");
    expect(reason('{"title" x "%s", "type": "bool"}')).toBe("invalid-template");
  });

  it("treats an empty question as no parameters only when the template has no placeholder", () => {
    expect(safePopulatedJSONForTemplate('{"title": "Fixed", "type": "bool"}', "")).toEqual({ ok: true, question: { title: "Fixed", type: "bool" } });
    expect(safePopulatedJSONForTemplate('{"title": "Fixed", "type": "bool"}', "x")).toMatchObject({ ok: false, reason: "param-count-mismatch" });
    expect(populated(safePopulatedJSONForTemplate('{"title": "%s", "type": "bool"}', "")).title).toBe("");
  });

  it("rejects placeholders in object keys", () => {
    const result = safePopulatedJSONForTemplate('{"title": "t", "%s": "x", "type": "bool"}', "title");
    expect(result.ok || result.reason).toBe("unsupported-placeholder");
  });

  it("accepts a single JSON scalar for a bare value placeholder (Kleros Moderate templates)", () => {
    const template = '{"title": "%s", "type": "bool", "askedBy": %s}';
    for (const scalar of ["true", "false", "null", " -1.25e10 ", "2E+21", "1234567890"]) {
      expect(populated(safePopulatedJSONForTemplate(template, `Title${D}${scalar}`)).askedBy).toEqual(JSON.parse(scalar));
    }
    const injected = safePopulatedJSONForTemplate(template, `Title${D}1, "type": 2`);
    expect(injected.ok || injected.reason).toBe("invalid-value");
    const object = safePopulatedJSONForTemplate(template, `Title${D}{"a": 1}`);
    expect(object.ok || object.reason).toBe("invalid-value");
  });

  it("rejects a template whose type comes from a parameter when it would change the type", () => {
    const template = '{"title": "%s", "type": %s}';
    const result = safePopulatedJSONForTemplate(template, `Title${D}"single-select"`);
    expect(result.ok || result.reason).toBe("type-mismatch");
  });

  it("drops title_html and title_text even when the template declares them", () => {
    const template = '{"title": "%s", "type": "bool", "title_html": "<b>%s</b>", "title_text": "x"}';
    const result = safePopulatedJSONForTemplate(template, `Title${D}bold`);
    expect(populated(result)).toEqual({ title: "Title", type: "bool" });
  });
});

describe("rulingOptionsFromRealityQuestion", () => {
  it("returns null for unknown types and invalid input", () => {
    expect(rulingOptionsFromRealityQuestion({ type: "int" })).toBeNull();
    expect(rulingOptionsFromRealityQuestion({ type: "broken-question" })).toBeNull();
    expect(rulingOptionsFromRealityQuestion(undefined as unknown as PopulatedQuestion)).toBeNull();
    expect(rulingOptionsFromRealityQuestion({ type: "single-select" })).toBeNull();
  });
});

describe("rulingOptionsFromTemplate", () => {
  it("derives No/Yes from a bool template regardless of the parameters", () => {
    expect(rulingOptionsFromTemplate(TEMPLATE_20)).toEqual({ type: "single-select", titles: ["No", "Yes"], reserved: RESERVED });
    expect(rulingOptionsFromTemplate(TEMPLATE_BOOL)).toEqual({ type: "single-select", titles: ["No", "Yes"], reserved: RESERVED });
  });

  it("derives uint options only when decimals is a literal number", () => {
    expect(rulingOptionsFromTemplate(TEMPLATE_UINT)).toEqual({ type: "uint", precision: 18, reserved: RESERVED });
    expect(rulingOptionsFromTemplate('{"title": "%s", "type": "uint", "decimals": %s}')).toBeNull();
  });

  it("derives datetime options", () => {
    expect(rulingOptionsFromTemplate(TEMPLATE_DATETIME)).toEqual({ type: "datetime", reserved: RESERVED });
  });

  it("returns null when the answers depend on the parameters or the template is invalid", () => {
    expect(rulingOptionsFromTemplate(TEMPLATE_SINGLE_SELECT)).toBeNull();
    expect(rulingOptionsFromTemplate(TEMPLATE_MULTIPLE_SELECT)).toBeNull();
    expect(rulingOptionsFromTemplate("{title: %s}")).toBeNull();
    expect(rulingOptionsFromTemplate(undefined as unknown as string)).toBeNull();
  });
});

/** A bool template whose `x` key holds `depth` nested arrays. */
function nestedTemplate(depth: number): string {
  return `{"title": "%s", "type": "bool", "x": ${"[".repeat(depth)}${"]".repeat(depth)}}`;
}

describe("hostile templates", () => {
  it("reads a template nested a few levels deep", () => {
    expect(safePopulatedJSONForTemplate(nestedTemplate(10), "a")).toMatchObject({ ok: true, question: { title: "a", type: "bool" } });
  });

  it("rejects a template nested deeper than the parser reads as an invalid template", () => {
    expect(safePopulatedJSONForTemplate(nestedTemplate(100), "a")).toEqual({ ok: false, reason: "invalid-template" });
    expect(safePopulatedJSONForTemplate(nestedTemplate(20_000), "a")).toEqual({ ok: false, reason: "invalid-template" });
  });

  it("reads a template with whitespace around separators and inside brackets", () => {
    const template = '{\n  "title" : "%s",\n  "type": "single-select",\n  "outcomes": [ %s ],\n  "a": [ [ ] , [ ] ],\n  "b": { }\n}\n';
    expect(populated(safePopulatedJSONForTemplate(template, `T${D}"A","B"`))).toEqual({ title: "T", type: "single-select", outcomes: ["A", "B"], a: [[], []], b: {} });
  });

  it("reads token-looking text of a template as plain text and drops NUL characters like reality-eth-lib", () => {
    const template = '{"title": "@@kleros0#0@@ @@kleros1#1@@ %s", "type": "bool", "category": "%s", "lang": "%s"}';
    expect(safePopulatedJSONForTemplate(template, `a${D}b${D}c`)).toMatchObject({ ok: true, question: { title: "@@kleros0#0@@ @@kleros1#1@@ a", category: "b", lang: "c" } });
    expect(safePopulatedJSONForTemplate('{"title": "%s", "type": "bo\u0000ol"}', "x")).toMatchObject({ ok: true, question: { type: "bool" } });
  });
});
