import { describe, expect, it } from "vitest";
import { questionTypeLabel } from "./questionOptions";

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
