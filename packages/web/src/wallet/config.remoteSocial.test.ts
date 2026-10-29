import { ApiController, ConnectorController, ModalController, OptionsController } from "@reown/appkit-controllers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildAppConfig } from "../env";
import { installOfflineAppKitEnvironment } from "../test/wallet";
import { APPKIT_FEATURES, EMBEDDED_WALLET_REFUSAL, createAppKitSetup, isEmbeddedWalletConnector } from "./appKitSetup";
import type { AppKitWalletSetup } from "./types";

// A file of its own: AppKit's controllers are module singletons (see config.test.ts).

/** What the Reown dashboard returns for a project with social login and email enabled. */
const SOCIAL_LOGIN_ENABLED = [{ id: "social_login", isEnabled: true, config: ["email", "google", "x", "github"] }];

describe("createAppKitSetup when the Reown dashboard enables social login", () => {
  let setup: AppKitWalletSetup;

  beforeAll(async () => {
    installOfflineAppKitEnvironment();
    vi.spyOn(ApiController, "fetchProjectConfig").mockResolvedValue(SOCIAL_LOGIN_ENABLED as Awaited<ReturnType<typeof ApiController.fetchProjectConfig>>);
    setup = createAppKitSetup(buildAppConfig({ REACT_APP_WALLETCONNECT_PROJECT_ID: "c8-test-project" }, { host: "localhost", origin: "http://localhost" }), "c8-test-project");
    await setup.modal.hasEmbeddedWallet();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("the dashboard's enabled social login and email reach AppKit's remote features", () => {
    expect(OptionsController.state.remoteFeatures?.socials).toEqual(["google", "x", "github"]);
    expect(OptionsController.state.remoteFeatures?.email).toBe(true);
  });

  it("the wagmi config still holds no embedded-wallet connector", () => {
    expect(setup.wagmiConfig.connectors.length).toBeGreaterThan(0);
    expect(setup.wagmiConfig.connectors.filter(isEmbeddedWalletConnector)).toEqual([]);
  });

  it("AppKit 1.8.24 registers its own embedded-wallet connector after the remote fetch, so the dashboard must disable social login and email", () => {
    // Not a wagmi connector, but the modal can offer it. The local features cannot prevent this; only the Reown project
    // settings can. A version bump that changes this flips the assertion and re-opens the question.
    expect(ConnectorController.state.connectors.filter(isEmbeddedWalletConnector)).toHaveLength(1);
  });

  it("the local features object keeps every optional feature off", () => {
    expect(OptionsController.state.features).toEqual(expect.objectContaining(APPKIT_FEATURES));
  });

  it("the modal reports the embedded wallet and refuses to open the Connect view", async () => {
    await expect(setup.modal.hasEmbeddedWallet()).resolves.toBe(true);
    await expect(setup.modal.openConnect(1)).rejects.toThrow(EMBEDDED_WALLET_REFUSAL);
    expect(ModalController.state.open).toBe(false);
  });
});
