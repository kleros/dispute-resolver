import type { ChainConfig } from "@dispute-resolver/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Amount } from "./Amount";
import { formatAmount } from "./amount";

const MAINNET: ChainConfig = { id: 1, name: "Ethereum Mainnet", currency: "ETH", isTestnet: false, maxLookback: 1_000_000 };
const GNOSIS: ChainConfig = { id: 100, name: "Gnosis Chain", currency: "xDai", isTestnet: false, maxLookback: 1_000_000 };
const SEPOLIA: ChainConfig = { id: 11155111, name: "Sepolia", currency: "sETH", isTestnet: true, maxLookback: 50_000 };

describe("formatAmount", () => {
  it.each([
    [MAINNET, 10n ** 18n, "1 ETH"],
    [GNOSIS, 15n * 10n ** 17n, "1.5 xDai"],
    [SEPOLIA, 1n, "0.000000000000000001 sETH"],
    [GNOSIS, 0n, "0 xDai"],
  ])("D-10: formats the amount with the chain's currency", (chain, wei, expected) => {
    expect(formatAmount(wei, chain)).toBe(expected);
  });
});

describe("Amount", () => {
  it("D-10: a Gnosis amount says xDai, never ETH", () => {
    render(<Amount wei={2n * 10n ** 18n} chain={GNOSIS} />);
    const amount = screen.getByText("2 xDai");
    expect(amount).not.toHaveTextContent("ETH");
  });

  it("D-10: keeps the exact wei value machine-readable", () => {
    render(<Amount wei={123_456_789n} chain={MAINNET} />);
    const amount = screen.getByText("0.000000000123456789 ETH");
    expect(amount.tagName).toBe("DATA");
    expect(amount).toHaveAttribute("value", "123456789");
  });
});
