import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codeRpc, createTestDeps, type RpcHandler } from "../test/data";
import { TEST_WALLET_ADDRESS, createTestWallet, walletWrapper } from "../test/wallet";
import { SmartContractWalletWarning } from "./SmartContractWalletWarning";

const KEY = `@kleros/dispute-resolver/alert/smart-contract-wallet-warning:${TEST_WALLET_ADDRESS}`;
const WARNING = "You are using a smart contract wallet. This is not recommended.";

async function renderWarning(rpc: RpcHandler, connected = true) {
  const wallet = createTestWallet();
  if (connected) await wallet.connect();
  const getCode = vi.fn(rpc);
  render(<SmartContractWalletWarning chainId={1} />, { wrapper: walletWrapper(wallet, createTestDeps({ rpc: getCode })) });
  return getCode;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("SmartContractWalletWarning", () => {
  it("warns when the connected account has contract code", async () => {
    await renderWarning(codeRpc("0x6080604052"));
    expect(await screen.findByText(WARNING)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute("href", "https://docs.kleros.io/welcome/faq#can-i-use-a-smart-contract-account-to-stake-in-the-court");
  });

  it("an EIP-7702 delegated account is not a smart-contract wallet", async () => {
    const getCode = await renderWarning(codeRpc("0xef01000000000000000000000000000000000000000001"));
    await waitFor(() => {
      expect(getCode).toHaveBeenCalled();
    });
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("an account without code is not warned", async () => {
    const getCode = await renderWarning(codeRpc("0x"));
    await waitFor(() => {
      expect(getCode).toHaveBeenCalled();
    });
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("a getCode error hides the warning", async () => {
    const getCode = await renderWarning(() => {
      throw new Error("RPC down");
    });
    await waitFor(() => {
      expect(getCode).toHaveBeenCalled();
    });
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("nothing is read without a connected account", async () => {
    const getCode = await renderWarning(codeRpc("0x6080604052"), false);
    expect(getCode).not.toHaveBeenCalled();
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("dismissal hides the warning and is stored per address under the existing storage key", async () => {
    await renderWarning(codeRpc("0x6080604052"));
    await userEvent.click(await screen.findByRole("button", { name: "Dismiss the smart contract wallet warning" }));
    expect(screen.queryByText(WARNING)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBe("false");
  });

  it("a stored dismissal keeps the warning hidden", async () => {
    window.localStorage.setItem(KEY, "false");
    const getCode = await renderWarning(codeRpc("0x6080604052"));
    await waitFor(() => {
      expect(getCode).toHaveBeenCalled();
    });
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("unreadable storage shows the warning and a failing write still dismisses it for the page", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await renderWarning(codeRpc("0x6080604052"));
    await userEvent.click(await screen.findByRole("button", { name: "Dismiss the smart contract wallet warning" }));
    expect(screen.queryByText(WARNING)).toBeNull();
  });
});
