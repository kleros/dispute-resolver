import { REGISTRY } from "@dispute-resolver/core";
import type { Env } from "@dispute-resolver/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAppConfig } from "./config";
import type { AppLocation } from "./types";

const LOCATION: AppLocation = { host: "deploy-preview-12--dr.netlify.app", origin: "https://deploy-preview-12--dr.netlify.app" };

const configure = (env: Env) => buildAppConfig(env, LOCATION);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("buildAppConfig", () => {
  it("passes the environment through to core calls unchanged", () => {
    const env: Env = Object.freeze({ REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example.org/key" });
    expect(configure(env).env).toBe(env);
  });

  it("the config is frozen", () => {
    const config = configure({});
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.selfHosts)).toBe(true);
  });

  describe("walletConnectProjectId", () => {
    it("a configured project ID is trimmed", () => {
      expect(configure({ REACT_APP_WALLETCONNECT_PROJECT_ID: "  abc123  " }).walletConnectProjectId).toBe("abc123");
    });

    it.each([undefined, "", "   ", "\t\n"])("%j means unconfigured (null)", (value) => {
      expect(configure({ REACT_APP_WALLETCONNECT_PROJECT_ID: value }).walletConnectProjectId).toBeNull();
    });
  });

  describe("atlasUri", () => {
    it.each(["", "   ", "not a url", "atlas.example.org", "//atlas.example.org", "http://atlas.example.org", "javascript:alert(1)", "ftp://atlas.example.org", "https://"])(
      "%j is not an https URL, so uploads are unavailable (null)",
      (value) => {
        expect(configure({ REACT_APP_ATLAS_URI: value }).atlasUri).toBeNull();
      },
    );

    it.each(["https://user:secret@atlas.example.org", "https://atlas.example.org?x=1", "https://atlas.example.org/#frag"])(
      "%j cannot carry the appended endpoint paths, so it is unconfigured (null)",
      (value) => {
        expect(configure({ REACT_APP_ATLAS_URI: value }).atlasUri).toBeNull();
      },
    );

    it.each([
      ["https://atlas.example.org", "https://atlas.example.org"],
      ["  https://atlas.example.org/  ", "https://atlas.example.org"],
      ["https://atlas.example.org///", "https://atlas.example.org"],
      ["https://atlas.example.org/api/", "https://atlas.example.org/api"],
      ["HTTPS://Atlas.Example.ORG", "https://atlas.example.org"],
    ])("%j is accepted as %j: trimmed, without a trailing slash, its path kept for /graphql and /ipfs/file, its host lowercase", (value, expected) => {
      expect(configure({ REACT_APP_ATLAS_URI: value }).atlasUri).toBe(expected);
    });
  });

  describe("gateway", () => {
    it("is core's resolveGateway of the environment", () => {
      expect(configure({ REACT_APP_IPFS_GATEWAY: "https://ipfs.example.org/" }).gateway).toBe("https://ipfs.example.org");
    });
  });

  it("selfHosts are the running app's host plus the registry's canonical hosts", () => {
    expect(configure({}).selfHosts).toEqual({ appHost: LOCATION.host, canonicalHosts: REGISTRY.canonicalHosts });
  });

  it("appOrigin is the page origin", () => {
    expect(configure({}).appOrigin).toBe(LOCATION.origin);
  });
});

describe("APP_CONFIG", () => {
  it("is built once from the real environment and window.location", async () => {
    vi.stubEnv("REACT_APP_WALLETCONNECT_PROJECT_ID", "stubbed-project-id");
    vi.stubEnv("REACT_APP_ATLAS_URI", "https://atlas.example.org/");
    const { APP_CONFIG } = await import("./config");
    expect(APP_CONFIG.walletConnectProjectId).toBe("stubbed-project-id");
    expect(APP_CONFIG.atlasUri).toBe("https://atlas.example.org");
    expect(APP_CONFIG.appOrigin).toBe(window.location.origin);
    expect(APP_CONFIG.selfHosts.appHost).toBe(window.location.host);
  });

  it("boots with the Atlas URI and the project ID unset", async () => {
    vi.stubEnv("REACT_APP_WALLETCONNECT_PROJECT_ID", undefined);
    vi.stubEnv("REACT_APP_ATLAS_URI", undefined);
    const { APP_CONFIG } = await import("./config");
    expect(APP_CONFIG.walletConnectProjectId).toBeNull();
    expect(APP_CONFIG.atlasUri).toBeNull();
  });
});
