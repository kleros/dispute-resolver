import { ApiController, ConnectorController, OptionsController } from "@reown/appkit-controllers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildAppConfig } from "../env";
import { installOfflineAppKitEnvironment } from "../test/wallet";
import { APPKIT_FEATURES, createAppKitSetup, isEmbeddedWalletConnector } from "./appKitSetup";
import type { AppKitWalletSetup } from "./types";

// A file of its own: AppKit's controllers are module singletons (see config.remoteSocial.test.ts).

/**
 * What the Reown dashboard returns for a project configured as the app requires: social login (which also carries email),
 * swaps and onramp present but disabled. AppKit adds its embedded-wallet connector only when the remote `email` is on
 * or the remote `socials` list is non-empty (`AppKit.createAuthProvider`, 1.8.24).
 */
const SOCIAL_LOGIN_DISABLED = [
  { id: "social_login", isEnabled: false, config: ["email", "google"] },
  { id: "swap", isEnabled: false, config: ["1inch"] },
  { id: "onramp", isEnabled: false, config: ["meld"] },
];

describe("createAppKitSetup when the Reown dashboard disables social login and email", () => {
  let setup: AppKitWalletSetup;

  beforeAll(async () => {
    installOfflineAppKitEnvironment();
    vi.spyOn(ApiController, "fetchProjectConfig").mockResolvedValue(SOCIAL_LOGIN_DISABLED as Awaited<ReturnType<typeof ApiController.fetchProjectConfig>>);
    setup = createAppKitSetup(buildAppConfig({ REACT_APP_WALLETCONNECT_PROJECT_ID: "c8-test-project" }, { host: "localhost", origin: "http://localhost" }), "c8-test-project");
    await setup.modal.hasEmbeddedWallet();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("the dashboard's disabled settings reach AppKit's remote features", () => {
    expect(OptionsController.state.remoteFeatures?.email).toBe(false);
    expect(OptionsController.state.remoteFeatures?.socials).toBe(false);
    expect(OptionsController.state.remoteFeatures?.swaps).toBe(false);
    expect(OptionsController.state.remoteFeatures?.onramp).toBe(false);
  });

  it("AppKit registers no embedded-wallet connector once the dashboard disables social login and email", () => {
    expect(ConnectorController.state.connectors.length).toBeGreaterThan(0);
    expect(ConnectorController.state.connectors.filter(isEmbeddedWalletConnector)).toEqual([]);
  });

  it("the local features object keeps every optional feature off", () => {
    expect(OptionsController.state.features).toEqual(expect.objectContaining(APPKIT_FEATURES));
  });

  it("the modal reports no embedded wallet, so Connect stays available", async () => {
    await expect(setup.modal.hasEmbeddedWallet()).resolves.toBe(false);
  });
});
