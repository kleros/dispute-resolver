import { describe, expect, it } from "vitest";
import { asSentence } from "./sentence";

describe("asSentence", () => {
  it.each([
    ["text without a full stop gets one", "Internal error", "Internal error."],
    ["a full stop is kept", "HTTP request failed.", "HTTP request failed."],
    ["a question mark is kept", "Did the wallet reject it?", "Did the wallet reject it?"],
    ["an exclamation mark is kept", "Rejected by the user!", "Rejected by the user!"],
    ["text cut short with an ellipsis gets no full stop after it", "The contract said: out of gas in…", "The contract said: out of gas in…"],
    ["a full stop from another script is kept", "请稍后重试。", "请稍后重试。"],
    ["a sentence ending inside closing quotes is kept", "The node said “Try later.”", "The node said “Try later.”"],
    ["a sentence ending inside closing guillemets is kept", "«Réessayez.»", "«Réessayez.»"],
    ["a sentence ending inside French guillemets set with spaces is kept", "« Réessayez. »", "« Réessayez. »"],
    ["a sentence ending inside German quotes is kept", "„Bitte erneut versuchen.“", "„Bitte erneut versuchen.“"],
    ["a sentence ending inside straight quotes is kept", 'The node said "Try later."', 'The node said "Try later."'],
    ["a sentence ending inside a closing bracket is kept", "Request failed (see the docs.)", "Request failed (see the docs.)"],
    ["a closing bracket after a word still gets a full stop", "Request failed (timeout)", "Request failed (timeout)."],
    ["surrounding whitespace is dropped", "  Internal error \n", "Internal error."],
  ])("%s", (_, text, sentence) => {
    expect(asSentence(text)).toBe(sentence);
  });
});
