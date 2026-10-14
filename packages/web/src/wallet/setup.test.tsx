import { CHAINS, type ChainConfig, type Env } from "@dispute-resolver/core";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestDataProvider } from "../test/data";
import { WalletSetupProvider } from "./WalletProvider";
import { buildAppConfig } from "../env";
import { configuredChains, toViemChain } from "./chains";
import { createWalletSetup, walletSetupFor } from "./setup";
import { noRpcConfiguredError, walletTransport } from "./transports";

const LOCATION = { host: "localhost", origin: "http://localhost" };
const SECRET_RPC = "https://mainnet.example.org/v3/secret-key";

function chain(id: number): ChainConfig {
  const config = Object.values(CHAINS).find((candidate) => candidate.id === id);
  if (config === undefined) throw new Error(`Chain ${String(id)} is not configured.`);
  return config;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createWalletSetup without a WalletConnect project ID", () => {
  it("§2.3: boots the unconfigured read-only mode without creating AppKit", () => {
    const setup = createWalletSetup(buildAppConfig({}, LOCATION));
    expect(setup.mode).toBe("unconfigured");
    expect("modal" in setup).toBe(false);
  });

  it("K-02: the wagmi config has no connector", () => {
    expect(createWalletSetup(buildAppConfig({}, LOCATION)).wagmiConfig.connectors).toEqual([]);
  });

  it("K-02: a browser wallet announcing itself through EIP-6963 is not added", async () => {
    const setup = createWalletSetup(buildAppConfig({}, LOCATION));
    // Wagmi adds announced wallets only once WagmiProvider has hydrated its store at mount.
    render(
      <TestDataProvider>
        <WalletSetupProvider setup={setup} />
      </TestDataProvider>,
    );
    await waitFor(() => {
      expect(setup.wagmiConfig.state.status).toBe("disconnected");
    });
    const provider = { request: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: Object.freeze({
          info: { uuid: "4f6d6c1b-8b5b-4a43-9f3a-0d7f5d0c1e2a", name: "Test Wallet", icon: "data:image/svg+xml,<svg/>", rdns: "org.example.wallet" },
          provider,
        }),
      }),
    );
    expect(setup.wagmiConfig.connectors).toEqual([]);
    expect(provider.request).not.toHaveBeenCalled();
  });

  it("§2.3: knows every configured chain, in ascending ID order", () => {
    const ids = createWalletSetup(buildAppConfig({}, LOCATION)).wagmiConfig.chains.map((candidate) => candidate.id);
    expect(ids).toEqual(
      Object.values(CHAINS)
        .map((candidate) => candidate.id)
        .sort((left, right) => left - right),
    );
    expect(ids).toHaveLength(15);
  });
});

describe("walletSetupFor", () => {
  it("§2.3: creates the setup of a configuration once", () => {
    const config = buildAppConfig({}, LOCATION);
    expect(walletSetupFor(config)).toBe(walletSetupFor(config));
  });
});

describe("walletTransport", () => {
  it("D-56: a chain with its RPC variable set uses that RPC", () => {
    const env: Env = { REACT_APP_WEB3_PROVIDER_URL: SECRET_RPC };
    const transport = walletTransport(chain(1), env)({});
    expect(transport.config.type).toBe("http");
    expect(transport.value).toEqual(expect.objectContaining({ url: SECRET_RPC }));
  });

  it("D-56: a chain without an RPC rejects every request instead of using a public default", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const transport = walletTransport(chain(1), {})({});
    expect(transport.config.type).toBe("custom");
    await expect(transport.request({ method: "eth_blockNumber" })).rejects.toThrow(noRpcConfiguredError(1).message);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("D-56: the error names the chain", () => {
    expect(noRpcConfiguredError(100).message).toBe("No RPC configured for chain 100.");
  });

  it("D-56: the unconfigured mode's chain transports follow the same rule (the AppKit adapter adds Reown's fallback, §6.4)", async () => {
    const setup = createWalletSetup(buildAppConfig({}, LOCATION));
    await expect(setup.wagmiConfig.getClient({ chainId: 1 }).request({ method: "eth_blockNumber" })).rejects.toThrow("No RPC configured for chain 1.");
  });
});

describe("toViemChain", () => {
  it("A13: a configured RPC URL never becomes part of a chain definition handed to wallets", () => {
    const setup = createWalletSetup(buildAppConfig({ REACT_APP_WEB3_PROVIDER_URL: SECRET_RPC }, LOCATION));
    expect(JSON.stringify(setup.wagmiConfig.chains)).not.toContain("secret-key");
  });

  it("§2.3: every configured chain has a viem definition with the app's name", () => {
    for (const config of Object.values(CHAINS)) {
      const viemChain = toViemChain(config);
      expect(viemChain.id).toBe(config.id);
      expect(viemChain.name).toBe(config.name);
      expect(viemChain.rpcUrls.default.http.length).toBeGreaterThan(0);
    }
  });

  it("§2.3: a chain viem does not know is defined from the core table without any RPC URL", () => {
    const unknown: ChainConfig = { ...chain(1), id: 999_999_001, name: "Test Chain", currency: "TST", explorerBaseUrl: "https://explorer.example.org" };
    const viemChain = toViemChain(unknown);
    expect(viemChain).toEqual(expect.objectContaining({ id: 999_999_001, name: "Test Chain", nativeCurrency: { name: "TST", symbol: "TST", decimals: 18 } }));
    expect(viemChain.rpcUrls.default.http).toEqual([]);
    expect(viemChain.blockExplorers?.default.url).toBe("https://explorer.example.org");
  });

  it("§2.3: the configured chains start with chain 1", () => {
    expect(configuredChains()[0].id).toBe(1);
  });
});
