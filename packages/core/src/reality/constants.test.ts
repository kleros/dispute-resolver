import { describe, expect, it } from "vitest";
import { QUESTION_PARAMS_DELIMITER } from "./constants";

describe("the question parameter delimiter", () => {
  it("separates question parameters with U+241F", () => {
    expect(QUESTION_PARAMS_DELIMITER).toBe("␟");
    expect(QUESTION_PARAMS_DELIMITER.codePointAt(0)).toBe(0x241f);
  });
});
