import { encodeExtraData, validateCreateInput, type CanonicalIpfsPath, type CreateDisputeInput } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { TEST_UPLOAD_PATH } from "../../test/atlas";
import {
  addParty,
  canonicalDocument,
  formExtraData,
  initialForm,
  removeParty,
  setOption,
  setOptionCount,
  setParty,
  setQuestionType,
  setText,
  toDraft,
  type CreateForm,
} from "./draft";

const ALICE = "0x1111111111111111111111111111111111111111";
const BOB = "0x2222222222222222222222222222222222222222";

function filled(overrides: Partial<CreateForm> = {}): CreateForm {
  let form = setText(setText(initialForm(), "title", "A dispute"), "question", "Who is right?");
  form = setOption(setOption(form, 0, "title", "Alice"), 1, "title", "Bob");
  return { ...form, ...overrides };
}

function validInput(form: CreateForm): CreateDisputeInput {
  const validation = validateCreateInput(toDraft(form));
  if (!validation.ok) throw new Error(`invalid form: ${JSON.stringify(validation.errors)}`);
  return validation.value;
}

describe("Create form draft", () => {
  it("starts on court 0 with three votes, single select, two options and one party row", () => {
    const form = initialForm();
    expect(toDraft(form)).toEqual({
      courtId: "0",
      votes: "3",
      category: "",
      title: "",
      description: "",
      questionType: "single-select",
      question: "",
      options: [
        { title: "", description: "" },
        { title: "", description: "" },
      ],
      parties: [{ alias: "", address: "" }],
      primaryDocument: null,
    });
  });

  it("choosing a select type sets two options, any other type none", () => {
    const five = setOptionCount(filled(), 5);
    expect(setQuestionType(five, "multiple-select").options).toHaveLength(2);
    expect(setQuestionType(five, "uint").options).toEqual([]);
    expect(setQuestionType(setQuestionType(five, "datetime"), "single-select").options).toHaveLength(2);
  });

  it("option titles are trimmed to the chosen count", () => {
    const form = setOption(setOptionCount(filled(), 3), 2, "title", "Neither");
    const trimmed = setOptionCount(form, 2);
    expect(toDraft(trimmed).options.map((option) => option.title)).toEqual(["Alice", "Bob"]);
    expect(setOptionCount(trimmed, 3).options[2]).toEqual({ title: "", description: "" });
  });

  it("a count outside 2 to 32, or not an integer, leaves the options as they are", () => {
    const form = filled();
    for (const count of [1, 33, 2.5, Number.NaN]) expect(setOptionCount(form, count)).toBe(form);
    expect(setOptionCount(setQuestionType(form, "uint"), 3).options).toEqual([]);
  });

  it("several parties can be added and removed, each keeping its own fields", () => {
    let form = addParty(filled());
    const [first, second] = form.parties;
    if (first === undefined || second === undefined) throw new Error("two rows expected");
    form = setParty(setParty(form, first.key, "alias", "Alice"), first.key, "address", ALICE);
    form = setParty(setParty(form, second.key, "alias", "Bob"), second.key, "address", BOB);
    expect(validInput(form).aliases).toEqual({ [ALICE]: "Alice", [BOB]: "Bob" });
    const withoutFirst = removeParty(form, first.key);
    expect(validInput(withoutFirst).aliases).toEqual({ [BOB]: "Bob" });
    expect(addParty(withoutFirst).parties.map((party) => party.key)).toEqual([second.key, second.key + 1]);
  });

  it("the uploaded path is normalized before it enters the draft, and a path that is not content-addressed is refused", () => {
    expect(canonicalDocument({ path: `${TEST_UPLOAD_PATH}/` as CanonicalIpfsPath, fileName: "rules.pdf" })).toEqual({ path: TEST_UPLOAD_PATH, fileName: "rules.pdf" });
    expect(canonicalDocument({ path: "/ipfs/not-a-cid/rules.pdf", fileName: "rules.pdf" })).toBeNull();
    const form = filled({ primaryDocument: canonicalDocument({ path: `/ipfs/./${TEST_UPLOAD_PATH.slice(6)}` as CanonicalIpfsPath, fileName: "rules.pdf" }) });
    expect(validInput(form).primaryDocument).toBe(TEST_UPLOAD_PATH);
  });

  it("the cost is read only for a court ID and a vote count that are whole numbers, votes at least one", () => {
    expect(formExtraData({ courtId: "2", votes: "5" })).toBe(encodeExtraData(2n, 5n));
    for (const votes of ["", "0", "1.5", "-1", "1e3"]) expect(formExtraData({ courtId: "0", votes })).toBeUndefined();
    expect(formExtraData({ courtId: "", votes: "3" })).toBeUndefined();
    expect(formExtraData({ courtId: "0", votes: (2n ** 256n).toString() })).toBeUndefined();
  });
});
