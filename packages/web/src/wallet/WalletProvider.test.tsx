import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAppConfig } from "../env";
import { TestDataProvider } from "../test/data";
import { CONNECTED_WAGMI_STORE } from "../test/wallet";
import type { WalletState } from "./types";
import { useWallet } from "./useWallet";
import { WalletProvider } from "./WalletProvider";

// AppKit never loads here: whatever the store holds before the load settles is what the first render sees.
vi.mock("./appKitSetup", () => ({
  createAppKitSetup: () => {
    throw new Error("AppKit is not created in this test.");
  },
}));

const WALLET_STORE_KEY = "wagmi.store";

afterEach(() => {
  window.localStorage.removeItem(WALLET_STORE_KEY);
});

function renderWalletProvider(): WalletState[] {
  const seen: WalletState[] = [];
  function Probe() {
    seen.push(useWallet());
    return null;
  }
  // A new configuration object is a new setup store (`walletSetupStoreFor`).
  const config = buildAppConfig({ REACT_APP_WALLETCONNECT_PROJECT_ID: "c8-test-project" }, { host: "localhost", origin: "http://localhost" });
  render(
    <TestDataProvider>
      <WalletProvider config={config}>
        <Probe />
      </WalletProvider>
    </TestDataProvider>,
  );
  return seen;
}

describe("WalletProvider", () => {
  it("with a stored connection the wallet is connecting until AppKit has loaded", async () => {
    window.localStorage.setItem(WALLET_STORE_KEY, CONNECTED_WAGMI_STORE);
    const seen = renderWalletProvider();
    expect(seen[0]).toEqual({ status: "connecting" });
    await waitFor(() => {
      expect(seen.at(-1)).toEqual({ status: "disconnected" });
    });
  });

  it("without a stored connection the wallet is disconnected from the first render, before AppKit loads", () => {
    const seen = renderWalletProvider();
    expect(seen[0]).toEqual({ status: "disconnected" });
  });
});
