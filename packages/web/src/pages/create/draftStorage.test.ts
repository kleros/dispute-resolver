import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_UPLOAD_PATH } from "../../test/atlas";
import { addParty, initialForm, setOption, setOptionCount, setParty, setPrimaryDocument, setQuestionType, setText, type CreateForm } from "./draft";
import { clearCreateDraft, isInitialForm, restoreCreateDraft, storeCreateDraft } from "./draftStorage";

const ETHEREUM = 1;
const GNOSIS = 100;
const KEY = "dr-create-draft:1";

const ALICE = "0x1111111111111111111111111111111111111111";

function filledForm(): CreateForm {
  let form = setText(initialForm(), "courtId", "2");
  form = setText(form, "votes", "5");
  form = setText(form, "category", "Rent");
  form = setText(form, "title", "Who keeps the deposit?");
  form = setText(form, "description", "Line one\nLine two");
  form = setText(form, "question", "Which party is right?");
  form = setOptionCount(setQuestionType(form, "multiple-select"), 3);
  form = setOption(setOption(setOption(form, 0, "title", "Alice"), 1, "title", "Bob"), 2, "description", "Neither");
  form = setParty(addParty(form), 1, "address", ALICE);
  form = setParty(form, 0, "alias", "Tenant");
  return setPrimaryDocument(form, { path: TEST_UPLOAD_PATH, fileName: "rules.pdf" });
}

function stored(value: unknown): void {
  window.localStorage.setItem(KEY, JSON.stringify(value));
}

const VALID_STORED = {
  version: 1,
  courtId: "0",
  votes: "3",
  category: "",
  title: "A dispute",
  description: "",
  questionType: "single-select",
  question: "Who is right?",
  options: [
    { title: "Yes", description: "" },
    { title: "No", description: "" },
  ],
  parties: [{ alias: "", address: "" }],
  primaryDocument: null,
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("Create form draft storage", () => {
  it("a saved form comes back the same after a reload", () => {
    const form = filledForm();
    storeCreateDraft(ETHEREUM, form);

    expect(restoreCreateDraft(ETHEREUM)).toEqual(form);
  });

  it("an untouched form stores nothing and removes a stored draft", () => {
    storeCreateDraft(ETHEREUM, filledForm());
    storeCreateDraft(ETHEREUM, initialForm());

    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(isInitialForm(initialForm())).toBe(true);
    expect(isInitialForm(filledForm())).toBe(false);
  });

  it("a draft from another chain is not restored", () => {
    storeCreateDraft(ETHEREUM, filledForm());

    expect(restoreCreateDraft(GNOSIS)).toBeNull();
    expect(restoreCreateDraft(ETHEREUM)).not.toBeNull();
  });

  it("a cleared draft is gone", () => {
    storeCreateDraft(ETHEREUM, filledForm());
    clearCreateDraft(ETHEREUM);

    expect(restoreCreateDraft(ETHEREUM)).toBeNull();
  });

  it("a tampered or outdated draft is dropped and removed", () => {
    for (const tampered of [
      { ...VALID_STORED, version: 0 },
      { ...VALID_STORED, extra: "field" },
      { ...VALID_STORED, questionType: "string" },
      { ...VALID_STORED, title: 42 },
      { ...VALID_STORED, options: Array.from({ length: 33 }, () => ({ title: "", description: "" })) },
      { ...VALID_STORED, parties: [{ key: 0, alias: "", address: "" }] },
      { ...VALID_STORED, primaryDocument: { path: TEST_UPLOAD_PATH, fileName: "rules.pdf", content: "%PDF" } },
    ]) {
      stored(tampered);
      expect(restoreCreateDraft(ETHEREUM)).toBeNull();
      expect(window.localStorage.getItem(KEY)).toBeNull();
    }
    window.localStorage.setItem(KEY, "{not json");
    expect(restoreCreateDraft(ETHEREUM)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("options are resized to the restored question type and party rows get fresh keys", () => {
    stored({ ...VALID_STORED, questionType: "uint" });
    expect(restoreCreateDraft(ETHEREUM)?.options).toEqual([]);

    stored({ ...VALID_STORED, options: [{ title: "Only", description: "" }] });
    expect(restoreCreateDraft(ETHEREUM)?.options).toEqual([
      { title: "Only", description: "" },
      { title: "", description: "" },
    ]);

    stored({
      ...VALID_STORED,
      parties: [
        { alias: "A", address: "" },
        { alias: "B", address: "" },
        { alias: "C", address: ALICE },
      ],
    });
    const restored = restoreCreateDraft(ETHEREUM);
    expect(restored?.parties.map((party) => party.key)).toEqual([0, 1, 2]);
    expect(restored?.parties[2]).toEqual({ key: 2, alias: "C", address: ALICE });
    expect(restored?.nextPartyKey).toBe(3);

    stored({ ...VALID_STORED, parties: [] });
    expect(restoreCreateDraft(ETHEREUM)?.parties).toEqual(initialForm().parties);
    expect(restoreCreateDraft(ETHEREUM)?.nextPartyKey).toBe(1);
  });

  it("a primary document whose path is not a canonical IPFS path restores as none, with no file contents ever stored", () => {
    storeCreateDraft(ETHEREUM, filledForm());
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "null")).toMatchObject({ primaryDocument: { path: TEST_UPLOAD_PATH, fileName: "rules.pdf" } });
    expect(Object.keys((JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as { primaryDocument: object }).primaryDocument)).toEqual(["path", "fileName"]);

    stored({ ...VALID_STORED, primaryDocument: { path: "/ipfs/not-a-cid/rules.pdf", fileName: "rules.pdf" } });
    const restored = restoreCreateDraft(ETHEREUM);
    expect(restored?.primaryDocument).toBeNull();
    expect(restored?.title).toBe("A dispute");
  });

  it("a blocked storage keeps the form for this page only and never throws", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      expect(() => {
        storeCreateDraft(ETHEREUM, filledForm());
        clearCreateDraft(ETHEREUM);
      }).not.toThrow();
      expect(restoreCreateDraft(ETHEREUM)).toBeNull();
    } finally {
      if (original === undefined) Reflect.deleteProperty(window, "localStorage");
      else Object.defineProperty(window, "localStorage", original);
    }
  });
});
