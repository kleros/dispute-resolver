import { buildCreatedMetaEvidence, encodeExtraData, numberOfRulingOptions, validateCreateInput, type CanonicalIpfsPath, type CreateDisputeInput } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { TEST_UPLOAD_PATH } from "../../test/atlas";
import { addParty, canonicalDocument, formExtraData, initialForm, removeParty, setOption, setOptionCount, setParty, setQuestionType, setText, toDraft, type CreateForm } from "./draft";

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
  it("spec §4.3: starts on court 0 with three votes, single select, two options and one party row", () => {
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

  it("spec §4.3: choosing a select type sets two options, any other type none", () => {
    const five = setOptionCount(filled(), 5);
    expect(setQuestionType(five, "multiple-select").options).toHaveLength(2);
    expect(setQuestionType(five, "uint").options).toEqual([]);
    expect(setQuestionType(setQuestionType(five, "datetime"), "single-select").options).toHaveLength(2);
  });

  it("D-08: option titles are trimmed to the chosen count", () => {
    const form = setOption(setOptionCount(filled(), 3), 2, "title", "Neither");
    const trimmed = setOptionCount(form, 2);
    expect(toDraft(trimmed).options.map((option) => option.title)).toEqual(["Alice", "Bob"]);
    expect(setOptionCount(trimmed, 3).options[2]).toEqual({ title: "", description: "" });
  });

  it("spec §4.3: a count outside 2 to 32, or not an integer, leaves the options as they are", () => {
    const form = filled();
    for (const count of [1, 33, 2.5, Number.NaN]) expect(setOptionCount(form, count)).toBe(form);
    expect(setOptionCount(setQuestionType(form, "uint"), 3).options).toEqual([]);
  });

  it("D-08: several parties can be added and removed, each keeping its own fields", () => {
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

  it("B20: names stay paired with their addresses when an earlier row has no alias", () => {
    let form = addParty(addParty(filled()));
    const [, second, third] = form.parties;
    if (second === undefined || third === undefined) throw new Error("three rows expected");
    form = setParty(setParty(form, second.key, "alias", "Bob"), second.key, "address", BOB);
    form = setParty(setParty(form, third.key, "alias", "Alice"), third.key, "address", ALICE);
    expect(validInput(form).aliases).toEqual({ [BOB]: "Bob", [ALICE]: "Alice" });
  });

  it("B20: a duplicate address is rejected, whatever its case", () => {
    let form = addParty(filled());
    const [first, second] = form.parties;
    if (first === undefined || second === undefined) throw new Error("two rows expected");
    form = setParty(setParty(form, first.key, "alias", "Alice"), first.key, "address", "0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359");
    form = setParty(setParty(form, second.key, "alias", "Again"), second.key, "address", "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359");
    const validation = validateCreateInput(toDraft(form));
    expect(validation.ok ? null : validation.errors.parties).toEqual([undefined, "duplicate-address"]);
  });

  it("MC-8: an all-uppercase party address is accepted, as core does", () => {
    const [row] = filled().parties;
    if (row === undefined) throw new Error("one row expected");
    const form = setParty(setParty(filled(), row.key, "alias", "Upper"), row.key, "address", "0xFB6916095CA1DF60BB79CE92CE3EA74C37C5D359");
    expect(validInput(form).aliases).toEqual({ "0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359": "Upper" });
  });

  it("B16, WN-2: the uploaded path is normalized before it enters the draft, and a path that is not content-addressed is refused", () => {
    expect(canonicalDocument({ path: `${TEST_UPLOAD_PATH}/` as CanonicalIpfsPath, fileName: "rules.pdf" })).toEqual({ path: TEST_UPLOAD_PATH, fileName: "rules.pdf" });
    expect(canonicalDocument({ path: "/ipfs/not-a-cid/rules.pdf", fileName: "rules.pdf" })).toBeNull();
    const form = filled({ primaryDocument: canonicalDocument({ path: `/ipfs/./${TEST_UPLOAD_PATH.slice(6)}` as CanonicalIpfsPath, fileName: "rules.pdf" }) });
    expect(validInput(form).primaryDocument).toBe(TEST_UPLOAD_PATH);
  });

  it("P-09: descriptions keep their option's index and trailing empty ones are dropped", () => {
    let form = setOptionCount(filled(), 3);
    form = setOption(form, 2, "title", "Neither");
    form = setOption(form, 1, "description", "Bob keeps the deposit");
    const metaEvidence = buildCreatedMetaEvidence(validInput(form));
    expect(metaEvidence.rulingOptions.titles).toEqual(["Alice", "Bob", "Neither"]);
    expect(metaEvidence.rulingOptions.descriptions).toEqual(["", "Bob keeps the deposit"]);
  });

  it("spec §4.5: the number of ruling options for each question type of the Sepolia golden disputes", () => {
    const multiple = setOption(setOptionCount(setQuestionType(filled(), "multiple-select"), 3), 2, "title", "C");
    const withTitles = setOption(setOption(multiple, 0, "title", "A"), 1, "title", "B");
    expect(numberOfRulingOptions(validInput(withTitles))).toBe(8n);
    expect(numberOfRulingOptions(validInput(setQuestionType(filled(), "uint")))).toBe(0n);
    expect(numberOfRulingOptions(validInput(setQuestionType(filled(), "datetime")))).toBe(0n);
    expect(numberOfRulingOptions(validInput(filled()))).toBe(2n);
  });

  it("spec §4.3: the cost is read only for a court ID and a vote count that are whole numbers, votes at least one", () => {
    expect(formExtraData({ courtId: "2", votes: "5" })).toBe(encodeExtraData(2n, 5n));
    for (const votes of ["", "0", "1.5", "-1", "1e3"]) expect(formExtraData({ courtId: "0", votes })).toBeUndefined();
    expect(formExtraData({ courtId: "", votes: "3" })).toBeUndefined();
    expect(formExtraData({ courtId: "0", votes: (2n ** 256n).toString() })).toBeUndefined();
  });
});
