import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Identicon } from "./Identicon";
import { identiconPattern } from "./identiconPattern";

const A = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
const B = "0x0000000000000000000000000000000000000001";

describe("identiconPattern", () => {
  it("11.3: is a 5×5 grid mirrored around the middle column", () => {
    const { cells } = identiconPattern(A);
    expect(cells).toHaveLength(5);
    for (const row of cells) {
      expect(row).toHaveLength(5);
      expect(row[0]).toBe(row[4]);
      expect(row[1]).toBe(row[3]);
    }
  });

  it("11.3: is derived from the address bytes, ignoring case", () => {
    expect(identiconPattern(A)).toEqual(identiconPattern(A.toUpperCase().replace("0X", "0x")));
    expect(identiconPattern(A)).not.toEqual(identiconPattern(B));
  });

  it.each(["", "not an address", "0x12"])("B12: never throws on %j", (value) => {
    expect(() => identiconPattern(value)).not.toThrow();
  });
});

describe("Identicon", () => {
  it("11.3: renders a decorative token-colored SVG", () => {
    const { container } = render(<Identicon address={A} size={32} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "32");
    const filled = container.querySelectorAll("rect[data-cell]");
    expect(filled).toHaveLength(identiconPattern(A).cells.flat().filter(Boolean).length);
    filled.forEach((cell) => {
      expect(cell.getAttribute("class")).toMatch(/^fill-klerosUIComponents/);
    });
  });
});
