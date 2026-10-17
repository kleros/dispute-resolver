import { afterEach, describe, expect, it, vi } from "vitest";
import { readEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("readEnv", () => {
  it("§4: keeps only REACT_APP_* string values", () => {
    const env = readEnv({
      REACT_APP_IPFS_GATEWAY: "https://ipfs.example.org",
      REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example.org/key",
      MODE: "test",
      DEV: true,
      PROD: false,
      SSR: false,
      BASE_URL: "/",
      VITE_OTHER: "x",
      REACT_APP_NOT_A_STRING: 1,
      REACT_APP_FLAG: true,
      REACT_APP_NOTHING: undefined,
    });
    expect(env).toEqual({ REACT_APP_IPFS_GATEWAY: "https://ipfs.example.org", REACT_APP_WEB3_PROVIDER_URL: "https://rpc.example.org/key" });
  });

  it("§4: the result is frozen", () => {
    const env = readEnv({ REACT_APP_IPFS_GATEWAY: "https://ipfs.example.org" });
    expect(Object.isFrozen(env)).toBe(true);
  });

  it("§4: an empty source yields an empty environment", () => {
    expect(readEnv({})).toEqual({});
  });

  it("D-35: per-chain public RPC variables pass through untouched", () => {
    const env = readEnv({ REACT_APP_PUBLIC_RPC_1: "https://public.example.org", REACT_APP_PUBLIC_RPC_100: "" });
    expect(env.REACT_APP_PUBLIC_RPC_1).toBe("https://public.example.org");
    expect(env.REACT_APP_PUBLIC_RPC_100).toBe("");
  });
});

describe("ENV", () => {
  it("§4: is the REACT_APP_* subset of import.meta.env, frozen", async () => {
    vi.stubEnv("REACT_APP_WALLETCONNECT_PROJECT_ID", "stubbed-project-id");
    vi.stubEnv("REACT_APP_PUBLIC_RPC_1", "https://public.example.org");
    const { ENV } = await import("./env");
    expect(ENV.REACT_APP_WALLETCONNECT_PROJECT_ID).toBe("stubbed-project-id");
    expect(ENV.REACT_APP_PUBLIC_RPC_1).toBe("https://public.example.org");
    expect(Object.keys(ENV).filter((key) => !key.startsWith("REACT_APP_"))).toEqual([]);
    expect(Object.isFrozen(ENV)).toBe(true);
  });
});
