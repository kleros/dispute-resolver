import { describe, expect, it } from "vitest";
import { hiddenAnswersLine, questionTypeLabel } from "./questionOptions";

describe("question type labels", () => {
  it.each([
    ["single-select", "Multiple choice: single select"],
    ["multiple-select", "Multiple choice: multiple select"],
    ["uint", "Non-negative number"],
    ["int", "Number"],
    ["string", "Text"],
    ["datetime", "Date"],
    ["hash", "Hash"],
  ])("labels %s as %s", (type, label) => {
    expect(questionTypeLabel(type)).toBe(label);
  });

  it("an unknown type has no label", () => {
    expect(questionTypeLabel("bool")).toBeNull();
    expect(questionTypeLabel("")).toBeNull();
  });
});

describe("the line under the voting options for reserved answers left out", () => {
  it.each([
    [1, "The case's description also lists an answer the contract does not accept, so it is not shown."],
    [2, "The case's description also lists 2 answers the contract does not accept, so they are not shown."],
    [5, "The case's description also lists 5 answers the contract does not accept, so they are not shown."],
  ])("names %i left-out answers so", (count, line) => {
    expect(hiddenAnswersLine(count)).toBe(line);
  });
});
