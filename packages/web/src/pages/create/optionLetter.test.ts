import { CREATE_LIMITS } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { optionLetter } from "./QuestionSection";

describe("optionLetter", () => {
  it("letters run A to Z, then AA to AF for 32 options", () => {
    const [, most] = CREATE_LIMITS.optionRange;
    const letters = Array.from({ length: most }, (_, index) => optionLetter(index));
    expect(most).toBe(32);
    expect(letters.join(" ")).toBe("A B C D E F G H I J K L M N O P Q R S T U V W X Y Z AA AB AC AD AE AF");
  });
});
