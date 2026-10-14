import { ApiController, ConnectorController, ModalController, OptionsController } from "@reown/appkit-controllers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getChain } from "@dispute-resolver/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildAppConfig } from "../env";
import { installOfflineAppKitEnvironment } from "../test/wallet";
import { APPKIT_FEATURES, EMBEDDED_WALLET_REFUSAL, createWalletSetup, isEmbeddedWalletConnector } from "./setup";
import type { WalletSetup } from "./types";
import { WalletControl } from "./WalletControl";
import { WalletSetupProvider } from "./WalletProvider";

// AppKit's controllers are module singletons, so each remote configuration runs in its own file: the fetch failing
// (config.test.ts), the dashboard enabling social login (this file) and disabling it (config.remoteSocialDisabled.test.ts).

/** What the Reown dashboard returns for a project with social login and email enabled. */
const SOCIAL_LOGIN_ENABLED = [{ id: "social_login", isEnabled: true, config: ["email", "google", "x", "github"] }];

describe("createWalletSetup when the Reown dashboard enables social login", () => {
  let setup: WalletSetup;

  beforeAll(async () => {
    installOfflineAppKitEnvironment();
    vi.spyOn(ApiController, "fetchProjectConfig").mockResolvedValue(SOCIAL_LOGIN_ENABLED as Awaited<ReturnType<typeof ApiController.fetchProjectConfig>>);
    setup = createWalletSetup(buildAppConfig({ REACT_APP_WALLETCONNECT_PROJECT_ID: "c8-test-project" }, { host: "localhost", origin: "http://localhost" }));
    if (setup.mode !== "appkit") throw new Error("Expected the AppKit setup.");
    await setup.modal.ready();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("K-01: the dashboard's settings reach AppKit's remote features (why the dashboard must disable them)", () => {
    expect(OptionsController.state.remoteFeatures?.socials).toEqual(["google", "x", "github"]);
    expect(OptionsController.state.remoteFeatures?.email).toBe(true);
  });

  it("C8 (AppKit 1.8.24): the wagmi config still holds no embedded-wallet connector", () => {
    expect(setup.wagmiConfig.connectors.length).toBeGreaterThan(0);
    expect(setup.wagmiConfig.connectors.filter(isEmbeddedWalletConnector)).toEqual([]);
  });

  it("K-01 (AppKit 1.8.24): AppKit then registers its own embedded-wallet connector after the remote fetch, so the dashboard must disable social login and email", () => {
    // Not a wagmi connector, but the modal can offer it. The local C8 features cannot prevent this; only the Reown
    // project settings can (K-01). A version bump that changes this flips the assertion and re-opens the question.
    expect(ConnectorController.state.connectors.filter(isEmbeddedWalletConnector)).toHaveLength(1);
  });

  it("C8 (AppKit 1.8.24): the local features object stays the C8 one", () => {
    expect(OptionsController.state.features).toEqual(expect.objectContaining(APPKIT_FEATURES));
  });

  it("K-03 (AppKit 1.8.24): the modal reports the embedded wallet and refuses to open the Connect view", async () => {
    if (setup.mode !== "appkit") throw new Error("Expected the AppKit setup.");
    await expect(setup.modal.hasEmbeddedWallet()).resolves.toBe(true);
    await expect(setup.modal.openConnect(1)).rejects.toThrow(EMBEDDED_WALLET_REFUSAL);
    expect(ModalController.state.open).toBe(false);
  });

  it("K-03 (AppKit 1.8.24): WalletControl disables Connect with the misconfiguration message, and the app stays read-only", async () => {
    const chain = getChain(1);
    if (chain === undefined) throw new Error("Chain 1 is not configured.");
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <WalletSetupProvider setup={setup} reconnectOnMount={false}>
          <WalletControl chain={chain} />
        </WalletSetupProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    });
    const button = screen.getByRole("button", { name: "Connect" });
    expect(button).toHaveAccessibleDescription("Wallet connection is misconfigured on this deployment.");
    await userEvent.click(button);
    expect(ModalController.state.open).toBe(false);
    expect(setup.wagmiConfig.state.current).toBeNull();
  });
});
