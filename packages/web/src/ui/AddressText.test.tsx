import type { Address, ChainConfig } from "@dispute-resolver/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AddressText } from "./AddressText";
import { shortenAddress } from "./address";

const ADDRESS: Address = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
const CHECKSUMMED = "0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069";

const MAINNET: ChainConfig = { id: 1, name: "Ethereum Mainnet", currency: "ETH", isTestnet: false, maxLookback: 1_000_000, explorerBaseUrl: "https://etherscan.io" };
const GNOSIS: ChainConfig = { id: 100, name: "Gnosis Chain", currency: "xDai", isTestnet: false, maxLookback: 1_000_000, explorerBaseUrl: "https://gnosisscan.io" };
const NO_EXPLORER: ChainConfig = { id: 1301, name: "Unichain Sepolia", currency: "ETH", isTestnet: true, maxLookback: 50_000 };

describe("shortenAddress", () => {
  it("11.3: keeps the first six and last four characters", () => {
    expect(shortenAddress(CHECKSUMMED)).toBe("0x988b…8069");
  });

  it("11.3: leaves a short value as is", () => {
    expect(shortenAddress("0x1234")).toBe("0x1234");
  });
});

describe("AddressText", () => {
  it.each([
    [MAINNET, "https://etherscan.io/address/0x988b3a538b618c7a603e1c11ab82cd16dbe28069"],
    [GNOSIS, "https://gnosisscan.io/address/0x988b3a538b618c7a603e1c11ab82cd16dbe28069"],
  ])("D-40: links the address to the chain's explorer", (chain, href) => {
    render(<AddressText address={ADDRESS} chain={chain} />);
    const link = screen.getByRole("link", { name: new RegExp(`^0x988b…8069`) });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleName(`0x988b…8069, view on ${chain.name} explorer`);
  });

  it("D-40: shows text without a link when the chain has no explorer", () => {
    render(<AddressText address={ADDRESS} chain={NO_EXPLORER} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("0x988b…8069")).toBeInTheDocument();
  });

  it("11.4: shows the full checksummed address on hover", () => {
    render(<AddressText address={ADDRESS} chain={MAINNET} />);
    expect(screen.getByTitle(CHECKSUMMED)).toBeInTheDocument();
  });

  it("11.4: the copy control has an accessible name and copies the full address", async () => {
    const user = userEvent.setup();
    render(<AddressText address={ADDRESS} chain={MAINNET} />);
    await user.click(screen.getByRole("button", { name: "Copy address" }));
    await expect(navigator.clipboard.readText()).resolves.toBe(CHECKSUMMED);
  });

  it("B12: a malformed address renders as given, never throws", () => {
    const malformed = "0xnot-an-address" as Address;
    render(<AddressText address={malformed} chain={NO_EXPLORER} />);
    expect(screen.getByText("0xnot-…ress")).toBeInTheDocument();
  });
});
