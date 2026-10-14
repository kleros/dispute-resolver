import { ApiController, ConnectorController, OptionsController } from "@reown/appkit-controllers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildAppConfig } from "../env";
import { installOfflineAppKitEnvironment } from "../test/wallet";
import { APPKIT_FEATURES, createWalletSetup, isEmbeddedWalletConnector } from "./setup";
import type { WalletSetup } from "./types";

// A file of its own: AppKit's controllers are module singletons (see config.remoteSocial.test.tsx).

/**
 * What the Reown dashboard returns for a project configured as K-01 requires: social login (which also carries email),
 * swaps and onramp present but disabled. AppKit adds its embedded-wallet connector only when the remote `email` is on
 * or the remote `socials` list is non-empty (`AppKit.createAuthProvider`, 1.8.24).
 */
const SOCIAL_LOGIN_DISABLED = [
  { id: "social_login", isEnabled: false, config: ["email", "google"] },
  { id: "swap", isEnabled: false, config: ["1inch"] },
  { id: "onramp", isEnabled: false, config: ["meld"] },
];

describe("createWalletSetup when the Reown dashboard disables social login and email (K-01)", () => {
  let setup: WalletSetup;

  beforeAll(async () => {
    installOfflineAppKitEnvironment();
    vi.spyOn(ApiController, "fetchProjectConfig").mockResolvedValue(SOCIAL_LOGIN_DISABLED as Awaited<ReturnType<typeof ApiController.fetchProjectConfig>>);
    setup = createWalletSetup(buildAppConfig({ REACT_APP_WALLETCONNECT_PROJECT_ID: "c8-test-project" }, { host: "localhost", origin: "http://localhost" }));
    if (setup.mode !== "appkit") throw new Error("Expected the AppKit setup.");
    await setup.modal.ready();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("K-01: the dashboard's disabled settings reach AppKit's remote features", () => {
    expect(OptionsController.state.remoteFeatures?.email).toBe(false);
    expect(OptionsController.state.remoteFeatures?.socials).toBe(false);
    expect(OptionsController.state.remoteFeatures?.swaps).toBe(false);
    expect(OptionsController.state.remoteFeatures?.onramp).toBe(false);
  });

  it("C8 (AppKit 1.8.24): the wagmi config holds no embedded-wallet connector", () => {
    expect(setup.wagmiConfig.connectors.length).toBeGreaterThan(0);
    expect(setup.wagmiConfig.connectors.filter(isEmbeddedWalletConnector)).toEqual([]);
  });

  it("C8, K-01 (AppKit 1.8.24): AppKit registers no embedded-wallet connector, the mitigation K-01 relies on", () => {
    expect(ConnectorController.state.connectors.length).toBeGreaterThan(0);
    expect(ConnectorController.state.connectors.filter(isEmbeddedWalletConnector)).toEqual([]);
  });

  it("C8 (AppKit 1.8.24): the local features object stays the C8 one", () => {
    expect(OptionsController.state.features).toEqual(expect.objectContaining(APPKIT_FEATURES));
  });

  it("K-03: the modal reports no embedded wallet, so Connect stays available", async () => {
    if (setup.mode !== "appkit") throw new Error("Expected the AppKit setup.");
    await expect(setup.modal.hasEmbeddedWallet()).resolves.toBe(false);
  });
});
