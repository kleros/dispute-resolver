import { describe, expect, it } from "vitest";
import attack from "./__fixtures__/attack-questions.json";
import { rulingOptionsFromRealityQuestion, rulingOptionsFromTemplate } from "./rulingOptions";
import { safePopulatedJSONForTemplate } from "./safeQuestion";
import type { PopulatedQuestion, SafePopulateResult } from "./types";

const D = "␟";

/**
 * Same algorithm as reality-eth-lib's populatedJSONForTemplate (vsprintf of the raw parameters into the template, then
 * JSON.parse), minus its post-processing. reality-eth-lib itself is not imported here: this is the reference the safe
 * population is compared against. Its outputs quoted in the tests below were checked against reality-eth-lib 3.4.6 (the
 * version the court used) and 3.4.30.
 */
function naivePopulate(template: string, question: string): Record<string, unknown> {
  const parts = question.split(D);
  let i = 0;
  const interpolated = template.replaceAll("%s", () => (i < parts.length ? (parts[i++] ?? "") : ""));
  try {
    return JSON.parse(interpolated.replaceAll("\0", "")) as Record<string, unknown>;
  } catch {
    return { type: "broken-question" };
  }
}

const RESERVED = { "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF": "Answered Too Soon" };

// Built-in Reality.eth v3 templates.
const TEMPLATE_BOOL = '{"title": "%s", "type": "bool", "category": "%s", "lang": "%s"}';
const TEMPLATE_UINT = '{"title": "%s", "type": "uint", "decimals": 18, "category": "%s", "lang": "%s"}';
const TEMPLATE_SINGLE_SELECT = '{"title": "%s", "type": "single-select", "outcomes": [%s], "category": "%s", "lang": "%s"}';
const TEMPLATE_MULTIPLE_SELECT = '{"title": "%s", "type": "multiple-select", "outcomes": [%s], "category": "%s", "lang": "%s"}';
const TEMPLATE_DATETIME = '{"title": "%s", "type": "datetime", "category": "%s", "lang": "%s"}';

// __fixtures__/attack-questions.json. Question 0x7eea… (template 20, recorded on-chain data): the first parameter closes
// the title string and injects "type":"single-select","outcomes":["Yes","No"]. Question 0xdd28… (template 35, a synthetic
// attack derived from that question, not recorded data): the first parameter injects a "title_html" key with an <img> tag.
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

  it("differs from reality-eth-lib, which is fooled by question 0x7eea… (single-select with Yes/No swapped)", () => {
    const unsafe = naivePopulate(TEMPLATE_20, QUESTION_0x7eea);
    expect(unsafe.type).toBe("single-select");
    expect(unsafe.outcomes).toEqual(["Yes", "No"]);
    // With the unsafe parsing, ruling 1 would read "Yes" instead of "No".
    expect(rulingOptionsFromRealityQuestion(unsafe)?.titles).toEqual(["Yes", "No"]);
  });

  it("does not let question 0xdd28… add title_html", () => {
    const question = populated(safePopulatedJSONForTemplate(TEMPLATE_35, QUESTION_0xdd28));
    expect(question.type).toBe("bool");
    expect(question).not.toHaveProperty("title_html");
    expect(question).not.toHaveProperty("z");
    expect(Object.keys(question)).toEqual(["lang", "type", "category", "title"]);
    expect(question.title).toContain("<img src=x");
    expect(rulingOptionsFromRealityQuestion(question)?.titles).toEqual(["No", "Yes"]);

    const unsafe = naivePopulate(TEMPLATE_35, QUESTION_0xdd28);
    expect(unsafe.title_html).toContain("<img src=x");
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
    const safe = populated(result);
    const unsafe = naivePopulate(TEMPLATE_SINGLE_SELECT, question);
    expect(unsafe.title).toBe(safe.title);
    expect(unsafe.outcomes).toEqual(safe.outcomes);
    expect(rulingOptionsFromRealityQuestion(safe)).toEqual({ type: "single-select", titles: ["A", "B"], reserved: RESERVED });
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

  it("renders a title containing a raw unescaped quote (which reality-eth-lib reports as broken)", () => {
    const question = `Will "Team A" win?${D}sports${D}en_US`;
    const result = populated(safePopulatedJSONForTemplate(TEMPLATE_BOOL, question));
    expect(result.title).toBe('Will "Team A" win?');
    expect(result.type).toBe("bool");
    expect(naivePopulate(TEMPLATE_BOOL, question).type).toBe("broken-question");
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
  });

  it("rejects placeholders in object keys", () => {
    const result = safePopulatedJSONForTemplate('{"title": "t", "%s": "x", "type": "bool"}', "title");
    expect(result.ok || result.reason).toBe("unsupported-placeholder");
  });

  it("accepts a single JSON scalar for a bare value placeholder (Kleros Moderate templates)", () => {
    const template = '{"title": "%s", "type": "bool", "askedBy": %s}';
    expect(populated(safePopulatedJSONForTemplate(template, `Title${D}1234567890`)).askedBy).toBe(1234567890);
    const injected = safePopulatedJSONForTemplate(template, `Title${D}1, "type": "uint"`);
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
  it("maps datetime questions", () => {
    const question = populated(safePopulatedJSONForTemplate(TEMPLATE_DATETIME, `When?${D}misc${D}en`));
    expect(rulingOptionsFromRealityQuestion(question)).toEqual({ type: "datetime", reserved: RESERVED });
  });

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
  it("analyzes a template stuffed with every nonce candidate in linear time", () => {
    const candidates = Array.from({ length: 40_000 }, (_unused, index) => `@@kleros${String(index)}#`);
    const hostile = `{"title": "${candidates.join(" ")}%s", "type": "bool", "category": "%s", "lang": "%s"}`;
    expect(hostile.length).toBeGreaterThan(400_000);

    const started = performance.now();
    const result = safePopulatedJSONForTemplate(hostile, `a${D}b${D}c`);
    const elapsedMs = performance.now() - started;

    expect(result).toMatchObject({ ok: true, question: { type: "bool", category: "b", lang: "c" } });
    expect(elapsedMs).toBeLessThan(500);
  });

  it("reads a template nested a few levels deep", () => {
    expect(safePopulatedJSONForTemplate(nestedTemplate(10), "a")).toMatchObject({ ok: true, question: { title: "a", type: "bool" } });
  });

  it("rejects a template nested deeper than the parser reads as an invalid template", () => {
    expect(safePopulatedJSONForTemplate(nestedTemplate(100), "a")).toEqual({ ok: false, reason: "invalid-template" });
    expect(safePopulatedJSONForTemplate(nestedTemplate(20_000), "a")).toEqual({ ok: false, reason: "invalid-template" });
  });

  it("reads token-looking text of a template as plain text", () => {
    const template = '{"title": "@@kleros0#0@@ @@kleros1#1@@ %s", "type": "bool", "category": "%s", "lang": "%s"}';
    expect(safePopulatedJSONForTemplate(template, `a${D}b${D}c`)).toMatchObject({ ok: true, question: { title: "@@kleros0#0@@ @@kleros1#1@@ a", category: "b", lang: "c" } });
  });
});
