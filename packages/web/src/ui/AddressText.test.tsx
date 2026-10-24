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
  it("keeps the first six and last four characters", () => {
    expect(shortenAddress(CHECKSUMMED)).toBe("0x988b…8069");
  });

  it("leaves a short value as is", () => {
    expect(shortenAddress("0x1234")).toBe("0x1234");
  });
});

describe("AddressText", () => {
  it.each([
    [MAINNET, "https://etherscan.io/address/0x988b3a538b618c7a603e1c11ab82cd16dbe28069"],
    [GNOSIS, "https://gnosisscan.io/address/0x988b3a538b618c7a603e1c11ab82cd16dbe28069"],
  ])("links the address to the chain's explorer", (chain, href) => {
    render(<AddressText address={ADDRESS} chain={chain} />);
    const link = screen.getByRole("link", { name: new RegExp(`^0x988b…8069`) });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleName(`0x988b…8069, view on ${chain.name} explorer`);
  });

  it("shows text without a link when the chain has no explorer", () => {
    render(<AddressText address={ADDRESS} chain={NO_EXPLORER} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("0x988b…8069")).toBeInTheDocument();
  });

  it("shows the full checksummed address on hover", () => {
    render(<AddressText address={ADDRESS} chain={MAINNET} />);
    expect(screen.getByTitle(CHECKSUMMED)).toBeInTheDocument();
  });

  it("the copy control has an accessible name and copies the full address", async () => {
    const user = userEvent.setup();
    render(<AddressText address={ADDRESS} chain={MAINNET} />);
    await user.click(screen.getByRole("button", { name: "Copy address" }));
    await expect(navigator.clipboard.readText()).resolves.toBe(CHECKSUMMED);
  });

  it("the link and the copy control are the only Tab stops", () => {
    const { container } = render(<AddressText address={ADDRESS} chain={MAINNET} />);
    const copy = screen.getByRole("button", { name: "Copy address" });
    const stops = [...container.querySelectorAll<HTMLElement>("a, button, [tabindex]")].filter((element) => element.tabIndex >= 0);
    expect(stops).toEqual([screen.getByRole("link"), copy]);
  });

  it("shows the whole checksummed address, still linked and copiable, when asked not to shorten it", () => {
    render(<AddressText address={ADDRESS} chain={MAINNET} full />);
    expect(screen.getByRole("link")).toHaveAccessibleName(`${CHECKSUMMED}, view on ${MAINNET.name} explorer`);
    expect(screen.getByText(CHECKSUMMED)).toHaveClass("font-mono");
    expect(screen.queryByTitle(CHECKSUMMED)).toBeNull();
    expect(screen.getByRole("button", { name: "Copy address" })).toBeInTheDocument();
  });

  it("the copied mark scales in from a blur, and holds still under reduced motion", () => {
    const { container } = render(<AddressText address={ADDRESS} chain={MAINNET} />);
    expect(container.firstElementChild).toHaveClass(
      "[&_.copied-icon]:animate-[t-icon-in_var(--icon-swap-dur)_var(--icon-swap-ease)_backwards]",
      "motion-reduce:[&_.copied-icon]:animate-none",
    );
  });

  it("the copy tooltip grows from its bottom edge after a short delay and fades out quickly", async () => {
    const user = userEvent.setup();
    render(<AddressText address={ADDRESS} chain={MAINNET} />);
    await user.hover(screen.getByRole("button", { name: "Copy address" }));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveClass(
      "origin-bottom",
      "entering:animate-[t-tooltip-in_var(--tt-in-dur)_var(--tt-in-ease)_var(--tt-delay)_backwards]!",
      "exiting:animate-[t-tooltip-out_var(--tt-out-dur)_var(--tt-out-ease)_forwards]!",
    );
  });

  it("renders a malformed address as given without throwing", () => {
    const malformed = "0xnot-an-address" as Address;
    render(<AddressText address={malformed} chain={NO_EXPLORER} />);
    expect(screen.getByText("0xnot-…ress")).toBeInTheDocument();
  });
});
