import { ApiController, ChainController, ConnectorController, OptionsController } from "@reown/appkit-controllers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildAppConfig } from "../env";
import { installOfflineAppKitEnvironment } from "../test/wallet";
import { APPKIT_FEATURES, createAppKitSetup, isEmbeddedWalletConnector } from "./appKitSetup";
import type { AppKitWalletSetup } from "./types";

// AppKit's controllers are module singletons, so the runs with the Reown dashboard enabling social login
// (config.remoteSocial.test.tsx) and disabling it (config.remoteSocialDisabled.test.ts) live in their own files: vitest
// isolates files, not tests.

describe("createAppKitSetup with a WalletConnect project ID, remote project configuration unreachable", () => {
  let setup: AppKitWalletSetup;

  beforeAll(async () => {
    installOfflineAppKitEnvironment();
    vi.spyOn(ApiController, "fetchProjectConfig").mockRejectedValue(new Error("Unit tests have no network (project config)."));
    setup = createAppKitSetup(buildAppConfig({ REACT_APP_WALLETCONNECT_PROJECT_ID: "c8-test-project" }, { host: "localhost", origin: "http://localhost" }), "c8-test-project");
    await setup.modal.ready();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("§2.3: a project ID selects the AppKit mode", () => {
    expect(setup.mode).toBe("appkit");
  });

  it("C8 (AppKit 1.8.24): the wagmi config holds no embedded-wallet connector once AppKit is ready", () => {
    expect(setup.wagmiConfig.connectors.length).toBeGreaterThan(0);
    expect(setup.wagmiConfig.connectors.filter(isEmbeddedWalletConnector)).toEqual([]);
  });

  it("C8 (AppKit 1.8.24): AppKit registers no embedded-wallet connector", () => {
    expect(ConnectorController.state.connectors.filter(isEmbeddedWalletConnector)).toEqual([]);
  });

  it("C8 (AppKit 1.8.24): AppKit keeps the C8 features object", () => {
    expect(OptionsController.state.features).toEqual(expect.objectContaining(APPKIT_FEATURES));
    expect(OptionsController.state.features?.socials).toEqual([]);
  });

  it("K-03: the modal reports no embedded wallet, so Connect stays available", async () => {
    await expect(setup.modal.hasEmbeddedWallet()).resolves.toBe(false);
  });

  it("D-06: no connector is connected and nothing prompts at load", () => {
    expect(setup.wagmiConfig.state.status).not.toBe("connected");
    expect(setup.wagmiConfig.state.current).toBeNull();
  });

  it("§2.3: Connect first makes the page chain AppKit's active network, so a WalletConnect session starts there", async () => {
    await setup.modal.openConnect(100);
    expect(ChainController.state.activeCaipNetwork?.id).toBe(100);
  });

  it("A20: the modal uses the app's font, so AppKit preloads no third-party font", () => {
    const preloads = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]')].map((link) => link.href);
    expect(preloads).toEqual([]);
  });
});
