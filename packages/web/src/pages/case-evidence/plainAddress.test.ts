import { describe, expect, it } from "vitest";
import { plainAddress, plainHead, plainIsBlank, shortened } from "./plainAddress";

const REPLACEMENT = "\uFFFD";

describe("plainAddress", () => {
  it("shows an ordinary address unchanged", () => {
    expect(plainAddress("https://example.org/evidence.json")).toBe("https://example.org/evidence.json");
  });

  it("an empty address stays empty", () => {
    expect(plainAddress("")).toBe("");
  });

  it("keeps every character of a 300,000-character address", () => {
    const address = `https://example.org/${"a".repeat(300_000)}`;
    expect(plainAddress(address)).toBe(address);
  });

  it("a line break, a tab, or a run of them becomes one space", () => {
    expect(plainAddress("first line\nsecond line")).toBe("first line second line");
    expect(plainAddress("one\r\n\r\ntwo")).toBe("one two");
    expect(plainAddress("a\tb\u2028c\u2029d")).toBe("a b c d");
    expect(plainAddress("a\n\t\u2028\u2029\r\nb")).toBe("a b");
  });

  it("a mark beside a line break is still replaced once the break is a space", () => {
    expect(plainAddress("a\n\u202Eb\u200B\r\n")).toBe(`a ${REPLACEMENT}b${REPLACEMENT} `);
  });

  it("an address full of bidi overrides and isolates shows only replacement characters", () => {
    const overrides = ["\u202A", "\u202B", "\u202C", "\u202D", "\u202E", "\u2066", "\u2067", "\u2068", "\u2069"];
    const address = Array.from({ length: 1_000 }, (_, index) => overrides[index % overrides.length]).join("");
    expect(plainAddress(address)).toBe(REPLACEMENT.repeat(1_000));
  });

  it("controls other than line breaks and tabs, zero-width and other format characters each become a replacement character, in place", () => {
    const marks = [
      "\u0000",
      "\u0007",
      "\u000B",
      "\u000C",
      "\u001F",
      "\u007F",
      "\u0085",
      "\u009F",
      "\u00AD",
      "\u061C",
      "\u200B",
      "\u200D",
      "\u200E",
      "\u200F",
      "\u2060",
      "\uFEFF",
      "\uD800",
    ];
    const shown = plainAddress(`ipfs${marks.join("")}/evidence`);
    expect(shown).toBe(`ipfs${REPLACEMENT.repeat(marks.length)}/evidence`);
    for (const mark of marks) expect(shown).not.toContain(mark);
  });
});

describe("shortened", () => {
  it("text of 200 characters or fewer has no shorter form", () => {
    expect(shortened("")).toBeNull();
    expect(shortened("b".repeat(200))).toBeNull();
  });

  it("text past 200 characters is cut at 200 followed by an ellipsis, however long", () => {
    expect(shortened(`${"b".repeat(200)}c`)).toBe(`${"b".repeat(200)}…`);
    const text = `https://example.org/${"a".repeat(300_000)}`;
    expect(shortened(text)).toBe(`${text.slice(0, 200)}…`);
  });

  it("a character outside the Basic Multilingual Plane counts once and is never split by the cut", () => {
    expect(shortened("𝒜".repeat(300))).toBe(`${"𝒜".repeat(200)}…`);
  });
});

/** A seeded generator, so every run checks the same strings. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const PIECES = [
  "a",
  "Z",
  "/",
  " ",
  "\u00A0",
  "\u3000",
  "\t",
  "\r",
  "\n",
  "\r\n",
  "\u2028",
  "\u2029",
  "\n\n\n\n\n\n\n\n",
  "\u000B",
  "\u000C",
  "\u0000",
  "\u0085",
  "\u00AD",
  "\u200B",
  "\u202E",
  "\u2066",
  "\uFEFF",
  "\uD800",
  "\uDC00",
  "𝒜",
  "😀",
];

function randomAddress(random: () => number): string {
  const lengths = [0, 1, 50, 199, 200, 201, 202, 260, 450];
  const length = lengths[Math.floor(random() * lengths.length)] ?? 0;
  const blankOnly = random() < 0.15;
  const pieces = blankOnly ? [" ", "\u00A0", "\u3000", "\t", "\n", "\r\n", "\u2028"] : PIECES;
  let address = "";
  for (let index = 0; index < length; index += 1) address += pieces[Math.floor(random() * pieces.length)] ?? "";
  return address;
}

describe("the cut view reads only the start of what was submitted", () => {
  it("shows and cuts exactly as the whole text would, for random text with marks, line breaks, spaces and characters outside the Basic Multilingual Plane", () => {
    const random = seeded(305);
    for (let run = 0; run < 3_000; run += 1) {
      const address = randomAddress(random);
      const whole = plainAddress(address);
      const start = plainAddress(plainHead(address));
      expect(shortened(start)).toBe(shortened(whole));
      if (shortened(whole) === null) expect(start).toBe(whole);
      expect(plainIsBlank(address)).toBe(whole.trim() === "");
    }
  });

  it("at the 200-character edge: 200 characters have no more, a 201st character or a line break has more, and line breaks after the 200th character's own break do not", () => {
    for (const [address, more] of [
      ["b".repeat(200), false],
      [`${"b".repeat(200)}c`, true],
      [`${"b".repeat(200)}\n`, true],
      [`${"b".repeat(199)}\n\r\n\t`, false],
      [`${"b".repeat(199)}\n\r\n\tc`, true],
      ["𝒜".repeat(200), false],
      [`${"𝒜".repeat(200)}\uD800`, true],
    ] as const) {
      expect(shortened(plainAddress(plainHead(address))) !== null).toBe(more);
      expect(shortened(plainAddress(plainHead(address)))).toBe(shortened(plainAddress(address)));
    }
  });

  it("never splits a character outside the Basic Multilingual Plane", () => {
    const address = "𝒜".repeat(1_000);
    const head = plainHead(address);
    expect(head).toBe("𝒜".repeat(201));
    expect(plainAddress(head)).not.toContain(REPLACEMENT);
  });

  it("a million characters that are nearly all marks are read only as far as the 201st character", () => {
    const address = `x${"\u202E\u200B\u0000".repeat(333_333)}`;
    expect(plainHead(address)).toHaveLength(201);
  });

  it("a long run of line breaks counts once and is passed over as one space", () => {
    const address = `${"a".repeat(150)}${"\r\n".repeat(500_000)}${"b".repeat(100)}`;
    const head = plainHead(address);
    expect(head).toBe(`${"a".repeat(150)}${"\r\n".repeat(500_000)}${"b".repeat(50)}`);
    expect(plainAddress(head)).toBe(`${"a".repeat(150)} ${"b".repeat(50)}`);
  });

  it("text of only spaces and line breaks is blank however long, while a mark, a byte-order mark or a vertical tab is not", () => {
    expect(plainIsBlank("")).toBe(true);
    expect(plainIsBlank(` \u00A0\u3000\t\r\n\u2028\u2029${" ".repeat(100_000)}`)).toBe(true);
    for (const mark of ["\u000B", "\u000C", "\uFEFF", "\u200B", "\u202E", "x"]) expect(plainIsBlank(`  ${mark}  `)).toBe(false);
  });
});
