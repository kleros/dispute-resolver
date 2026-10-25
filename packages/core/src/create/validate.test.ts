import { describe, expect, it } from "vitest";
import type { CanonicalIpfsPath } from "../uri/types";
import type { CreateDisputeDraft, CreateDisputeInput, CreateValidationErrors } from "./types";
import { validateCreateInput } from "./index";

const CID = "QmPiLHsHHhzfWDaSYWXjaANAJyY2hU9VBPt7Txc94SCTsA";
const ALICE = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const BOB = "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359";

function draft(overrides: Partial<CreateDisputeDraft> = {}): CreateDisputeDraft {
  return {
    courtId: "0",
    votes: "3",
    category: "",
    title: "A title",
    description: "",
    questionType: "single-select",
    question: "A question?",
    options: [
      { title: "Yes", description: "" },
      { title: "No", description: "" },
    ],
    parties: [{ alias: "", address: "" }],
    primaryDocument: null,
    ...overrides,
  };
}

function accepted(input: CreateDisputeDraft): CreateDisputeInput {
  const validation = validateCreateInput(input);
  if (!validation.ok) throw new Error(`expected a valid draft, got ${JSON.stringify(validation.errors)}`);
  return validation.value;
}

function errors(input: CreateDisputeDraft): CreateValidationErrors {
  const validation = validateCreateInput(input);
  if (validation.ok) throw new Error("expected the draft to be rejected");
  return validation.errors;
}

function options(count: number, title = "Option"): CreateDisputeDraft["options"] {
  return Array.from({ length: count }, (_, index) => ({ title: `${title} ${String(index + 1)}`, description: "" }));
}

describe("validateCreateInput: required fields and integers", () => {
  it("requires exactly the court, votes, title, question, Number of Options and option titles", () => {
    // Question Type is required too, and a draft cannot lack it: it is a `CreateQuestionType`, the dropdown's current choice.
    const blank = draft({
      courtId: "",
      votes: "",
      category: "",
      title: "",
      description: "",
      question: "",
      options: [{ title: "", description: "" }],
      parties: [{ alias: "", address: "" }],
    });
    expect(errors(blank)).toEqual({ courtId: "required", votes: "required", title: "required", question: "required", optionCount: "out-of-range", options: ["required"] });
  });

  it("a complete single-select draft becomes a typed input", () => {
    expect(accepted(draft({ courtId: "12", votes: "5", category: "Other", description: "Details" }))).toEqual({
      courtId: 12n,
      votes: 5n,
      category: "Other",
      title: "A title",
      description: "Details",
      questionType: "single-select",
      question: "A question?",
      options: [
        { title: "Yes", description: "" },
        { title: "No", description: "" },
      ],
      aliases: {},
      primaryDocument: null,
    });
  });

  it("only an empty title or question counts as missing", () => {
    expect(accepted(draft({ title: " ", question: " " }))).toMatchObject({ title: " ", question: " " });
  });

  it("category and description are optional and kept as typed", () => {
    expect(accepted(draft({ category: "", description: "" }))).toMatchObject({ category: "", description: "" });
  });

  it("court and votes must be non-negative decimal integers", () => {
    for (const value of ["3.5", "1e3", "abc", "-1", "+3", " 3", "0x10", "３"]) {
      expect(errors(draft({ courtId: value, votes: value }))).toEqual({ courtId: "not-an-integer", votes: "not-an-integer" });
    }
  });

  it("votes start at 1; court 0 is the general court", () => {
    expect(errors(draft({ votes: "0" }))).toEqual({ votes: "out-of-range" });
    expect(accepted(draft({ courtId: "0", votes: "1" }))).toMatchObject({ courtId: 0n, votes: 1n });
  });

  it("court and votes must fit the uint256 words of extraData", () => {
    const tooLarge = (2n ** 256n).toString();
    expect(errors(draft({ courtId: tooLarge, votes: tooLarge }))).toEqual({ courtId: "out-of-range", votes: "out-of-range" });
    const max = (2n ** 256n - 1n).toString();
    expect(accepted(draft({ courtId: max, votes: max }))).toMatchObject({ courtId: 2n ** 256n - 1n, votes: 2n ** 256n - 1n });
  });

  it("large vote counts keep their exact value", () => {
    expect(accepted(draft({ votes: "9007199254740993" })).votes).toBe(9_007_199_254_740_993n);
  });
});

describe("validateCreateInput: ruling options", () => {
  it("select types need 2 to 32 options", () => {
    for (const questionType of ["single-select", "multiple-select"] as const) {
      expect(errors(draft({ questionType, options: options(1) }))).toEqual({ optionCount: "out-of-range" });
      expect(errors(draft({ questionType, options: options(33) }))).toEqual({ optionCount: "out-of-range" });
      expect(errors(draft({ questionType, options: [] }))).toEqual({ optionCount: "out-of-range" });
      expect(accepted(draft({ questionType, options: options(2) })).options).toHaveLength(2);
      expect(accepted(draft({ questionType, options: options(32) })).options).toHaveLength(32);
    }
  });

  it("every option title is required; descriptions are optional", () => {
    const result = errors(
      draft({
        options: [
          { title: "Yes", description: "" },
          { title: "", description: "Why" },
          { title: "Maybe", description: "" },
        ],
      }),
    );
    expect(result).toEqual({ options: [undefined, "required", undefined] });
  });

  it("the options passed are the ones written, each with its own description", () => {
    const value = accepted(
      draft({
        questionType: "multiple-select",
        options: [
          { title: "A", description: "first" },
          { title: "B", description: "" },
          { title: "C", description: "third" },
        ],
      }),
    );
    expect(value.options).toEqual([
      { title: "A", description: "first" },
      { title: "B", description: "" },
      { title: "C", description: "third" },
    ]);
  });

  it("uint and datetime ignore option rows, so no stale titles or descriptions are written", () => {
    for (const questionType of ["uint", "datetime"] as const) {
      const value = accepted(draft({ questionType, options: [{ title: "", description: "stale" }] }));
      expect(value.options).toEqual([]);
      expect(value.questionType).toBe(questionType);
    }
  });
});

describe("validateCreateInput: parties", () => {
  it("a row with both fields empty is ignored", () => {
    expect(
      accepted(
        draft({
          parties: [
            { alias: "", address: "" },
            { alias: "  ", address: " " },
          ],
        }),
      ).aliases,
    ).toEqual({});
  });

  it("several parties, each alias keyed by its own lowercased address", () => {
    const value = accepted(
      draft({
        parties: [
          { alias: "Alice", address: ALICE },
          { alias: "Bob", address: BOB },
        ],
      }),
    );
    expect(value.aliases).toEqual({ [ALICE.toLowerCase()]: "Alice", [BOB.toLowerCase()]: "Bob" });
  });

  it("names stay paired with their addresses when an earlier row is empty", () => {
    const value = accepted(
      draft({
        parties: [
          { alias: "", address: "" },
          { alias: "Bob", address: BOB },
          { alias: "Alice", address: ALICE },
        ],
      }),
    );
    expect(value.aliases).toEqual({ [BOB.toLowerCase()]: "Bob", [ALICE.toLowerCase()]: "Alice" });
  });

  it("an alias without an address and an address without an alias are rejected on their own rows", () => {
    expect(
      errors(
        draft({
          parties: [
            { alias: "Alice", address: "" },
            { alias: "", address: BOB },
            { alias: "  ", address: ALICE },
          ],
        }),
      ),
    ).toEqual({ parties: ["alias-without-address", "address-without-alias", "address-without-alias"] });
  });

  it("rejects values that are not a 0x-prefixed 40-digit hex address", () => {
    for (const address of ["0x123", "alice.eth", "5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", `0x${"g".repeat(40)}`, `${ALICE}00`]) {
      expect(errors(draft({ parties: [{ alias: "Alice", address }] }))).toEqual({ parties: ["invalid-address"] });
    }
  });

  it("enforces the EIP-55 checksum, so a mistyped digit or a wrong case pattern is rejected", () => {
    const wrongDigit = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAfd";
    const wrongCase = "0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
    for (const address of [wrongDigit, wrongCase]) {
      expect(errors(draft({ parties: [{ alias: "Alice", address }] }))).toEqual({ parties: ["invalid-address"] });
    }
  });

  it("an all-uppercase address is accepted as EIP-55's unchecksummed form and stored lowercase", () => {
    expect(accepted(draft({ parties: [{ alias: "Alice", address: `0x${ALICE.slice(2).toUpperCase()}` }] })).aliases).toEqual({ [ALICE.toLowerCase()]: "Alice" });
  });

  it("a 0X prefix and a mixed-case address with a wrong checksum stay rejected", () => {
    const upperPrefix = `0X${ALICE.slice(2).toUpperCase()}`;
    const wrongCase = "0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
    for (const address of [upperPrefix, wrongCase]) {
      expect(errors(draft({ parties: [{ alias: "Alice", address }] }))).toEqual({ parties: ["invalid-address"] });
    }
  });

  it("an all-uppercase address duplicates its lowercase form", () => {
    expect(
      errors(
        draft({
          parties: [
            { alias: "Alice", address: ALICE.toLowerCase() },
            { alias: "Also Alice", address: `0x${ALICE.slice(2).toUpperCase()}` },
          ],
        }),
      ),
    ).toEqual({ parties: [undefined, "duplicate-address"] });
  });

  it("a lowercase or checksummed address is accepted, and surrounding whitespace is dropped", () => {
    expect(accepted(draft({ parties: [{ alias: "Alice", address: ALICE.toLowerCase() }] })).aliases).toEqual({ [ALICE.toLowerCase()]: "Alice" });
    expect(accepted(draft({ parties: [{ alias: "Alice", address: ` ${ALICE} ` }] })).aliases).toEqual({ [ALICE.toLowerCase()]: "Alice" });
  });

  it("the alias is written as typed", () => {
    expect(accepted(draft({ parties: [{ alias: " Alice (buyer) ", address: ALICE }] })).aliases).toEqual({ [ALICE.toLowerCase()]: " Alice (buyer) " });
  });

  it("duplicate addresses are rejected case-insensitively, on every repeat after the first", () => {
    expect(
      errors(
        draft({
          parties: [
            { alias: "Alice", address: ALICE },
            { alias: "Bob", address: BOB },
            { alias: "Also Alice", address: ALICE.toLowerCase() },
            { alias: "Bob again", address: BOB.toLowerCase() },
          ],
        }),
      ),
    ).toEqual({ parties: [undefined, undefined, "duplicate-address", "duplicate-address"] });
  });
});

describe("validateCreateInput: primary document", () => {
  it("a draft without a document is accepted", () => {
    expect(accepted(draft({ primaryDocument: null })).primaryDocument).toBeNull();
  });

  it("a canonical document path is accepted unchanged", () => {
    const path: CanonicalIpfsPath = `/ipfs/${CID}/contract.pdf`;
    expect(accepted(draft({ primaryDocument: path })).primaryDocument).toBe(path);
  });

  it("a path that is not canonical is refused, never written into the meta-evidence", () => {
    for (const path of [`/ipfs/${CID}/../../ipns/x`, "/ipfs/not-a-cid/file.pdf", `/ipfs/${CID}/a/../b.pdf`, `/ipfs/${CID}/`, "/ipns/example.eth/file.pdf"]) {
      expect(errors(draft({ primaryDocument: path as CanonicalIpfsPath }))).toEqual({ primaryDocument: "not-content-addressed" });
    }
  });
});

describe("validateCreateInput: several errors at once", () => {
  it("every invalid field is reported together", () => {
    expect(
      errors(
        draft({
          courtId: "x",
          votes: "0",
          title: "",
          question: "",
          options: [
            { title: "", description: "" },
            { title: "B", description: "" },
          ],
          parties: [{ alias: "Alice", address: "nope" }],
          primaryDocument: "https://evil.example/doc.pdf" as CanonicalIpfsPath,
        }),
      ),
    ).toEqual({
      courtId: "not-an-integer",
      votes: "out-of-range",
      title: "required",
      question: "required",
      options: ["required", undefined],
      parties: ["invalid-address"],
      primaryDocument: "not-content-addressed",
    });
  });
});
