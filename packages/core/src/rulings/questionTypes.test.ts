import { describe, expect, it } from "vitest";
import { asQuestionType, isVariableType } from "./index";

describe("asQuestionType", () => {
  it("§5.13: narrows each question type the app understands", () => {
    for (const type of ["single-select", "multiple-select", "uint", "int", "string", "datetime", "hash"]) {
      expect(asQuestionType(type)).toBe(type);
    }
  });

  it("§5.13: an unknown type string is not a question type", () => {
    expect(asQuestionType("bool")).toBeNull();
    expect(asQuestionType("Single-Select")).toBeNull();
    expect(asQuestionType("")).toBeNull();
    expect(asQuestionType("toString")).toBeNull();
    expect(asQuestionType("__proto__")).toBeNull();
  });
});

describe("isVariableType", () => {
  it("D-04: uint, int, string, datetime and hash are the variable-answer types", () => {
    for (const type of ["uint", "int", "string", "datetime", "hash"]) {
      expect(isVariableType(type)).toBe(true);
    }
  });

  it("D-04: select types and unknown types are not variable-answer types", () => {
    for (const type of ["single-select", "multiple-select", "bool", "", "constructor"]) {
      expect(isVariableType(type)).toBe(false);
    }
  });
});
