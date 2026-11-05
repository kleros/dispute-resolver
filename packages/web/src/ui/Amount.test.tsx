import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Amount } from "./Amount";
import { formatAmount } from "./amount";
import { testChain } from "../test/data";

const MAINNET = testChain(1);
const GNOSIS = testChain(100);
const SEPOLIA = testChain(11155111);

describe("formatAmount", () => {
  it.each([
    [MAINNET, 10n ** 18n, "1 ETH"],
    [GNOSIS, 15n * 10n ** 17n, "1.5 xDai"],
    [SEPOLIA, 1n, "0.000000000000000001 sETH"],
    [GNOSIS, 0n, "0 xDai"],
  ])("formats the amount with the chain's currency", (chain, wei, expected) => {
    expect(formatAmount(wei, chain)).toBe(expected);
  });
});

describe("Amount", () => {
  it("keeps the exact wei value machine-readable", () => {
    render(<Amount wei={123_456_789n} chain={MAINNET} />);
    const amount = screen.getByText("0.000000000123456789 ETH");
    expect(amount.tagName).toBe("DATA");
    expect(amount).toHaveAttribute("value", "123456789");
  });
});
