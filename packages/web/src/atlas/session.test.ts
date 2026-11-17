import { AuthorizationError, Roles, useAtlasProvider } from "@kleros/kleros-app";
import klerosAppPackage from "@kleros/kleros-app/package.json";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { atlasWrapper, installFakeAtlasServer, jwtSubject, sessionJwt, settle, testJwt } from "../test/atlas";
import { TEST_WALLET_ACCOUNT, TEST_WALLET_SECOND_ACCOUNT, createConnectedTestWallet } from "../test/wallet";
import { useAtlasUpload } from "./context";
import { LIBRARY_TOKEN_KEY, clearRejectedToken, isLiveToken, readStoredToken, tokenExpiry } from "./session";

const NOW = 1_800_000_000;

function storageWith(value: string | null): Pick<Storage, "getItem"> {
  return { getItem: () => value };
}

describe("tokenExpiry and isLiveToken", () => {
  it("counts a token with an exp in the future", () => {
    const token = testJwt({ sub: TEST_WALLET_ACCOUNT, exp: NOW + 60 });
    expect(tokenExpiry(token)).toBe(NOW + 60);
    expect(isLiveToken(token, NOW)).toBe(true);
  });

  it.each<[string, string | null]>([
    ["a token without exp", testJwt({ sub: TEST_WALLET_ACCOUNT })],
    ["a token whose exp is a string", testJwt({ sub: TEST_WALLET_ACCOUNT, exp: String(NOW + 60) })],
    ["a token that expires now", testJwt({ sub: TEST_WALLET_ACCOUNT, exp: NOW })],
    ["an expired token", testJwt({ sub: TEST_WALLET_ACCOUNT, exp: NOW - 1 })],
    ["no token", null],
    ["a string that is not a JWT", "not-a-jwt"],
    ["a token with two parts", "a.b"],
    ["a token whose payload is not base64", "a.%%%.c"],
    ["a token whose payload is padded base64, not base64url", `a.${btoa("not json")}.c`],
    ["a token whose payload holds characters outside base64url", `a.${btoa("ÿþ")}.c`],
    ["a token without a subject", testJwt({ exp: NOW + 60 })],
  ])("%s is not a live token", (_name, token) => {
    expect(isLiveToken(token, NOW)).toBe(false);
  });
});

describe("readStoredToken", () => {
  it("reads the JSON-encoded token string the library stores", () => {
    expect(readStoredToken(storageWith(JSON.stringify("header.payload.signature")))).toBe("header.payload.signature");
  });

  it("reads anything else as no token", () => {
    expect(readStoredToken(null)).toBeNull();
    expect(readStoredToken(storageWith(null))).toBeNull();
    expect(readStoredToken(storageWith("header.payload.signature"))).toBeNull();
    expect(readStoredToken(storageWith("42"))).toBeNull();
    const throwing = {
      getItem: () => {
        throw new DOMException("Access denied", "SecurityError");
      },
    };
    expect(readStoredToken(throwing)).toBeNull();
  });
});

describe("clearRejectedToken", () => {
  function storageHolding(token: string) {
    const items = new Map([[LIBRARY_TOKEN_KEY, JSON.stringify(token)]]);
    return {
      items,
      getItem: (key: string) => items.get(key) ?? null,
      removeItem: (key: string) => {
        items.delete(key);
      },
    };
  }

  it("removes the stored token Atlas rejected", () => {
    const storage = storageHolding("rejected.token.value");

    clearRejectedToken(storage, "rejected.token.value");

    expect(storage.items.has(LIBRARY_TOKEN_KEY)).toBe(false);
  });

  it("keeps a token stored by a newer sign-in", () => {
    const storage = storageHolding("newer.token.value");

    clearRejectedToken(storage, "rejected.token.value");

    expect(readStoredToken(storage)).toBe("newer.token.value");
  });

  it("leaves storage the browser refuses alone without throwing", () => {
    const refusing = {
      getItem: () => JSON.stringify("rejected.token.value"),
      removeItem: () => {
        throw new DOMException("Access denied", "SecurityError");
      },
    };

    expect(() => {
      clearRejectedToken(refusing, "rejected.token.value");
    }).not.toThrow();
    expect(() => {
      clearRejectedToken(null, "rejected.token.value");
    }).not.toThrow();
  });
});

describe("@kleros/kleros-app 3.1.0 session storage coupling", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("is the installed version this coupling was written against", () => {
    expect(klerosAppPackage.version).toBe("3.1.0");
  });

  it('stores the token JSON-encoded under sessionStorage "authToken" after sign-in', async () => {
    const token = sessionJwt(TEST_WALLET_ACCOUNT);
    installFakeAtlasServer({ issueToken: () => token });
    const wallet = await createConnectedTestWallet();
    const { result } = renderHook(() => useAtlasUpload(), { wrapper: atlasWrapper(wallet) });
    await waitFor(() => {
      expect(result.current.limits("evidence")).not.toBeNull();
    });

    const outcome = await settle(() => result.current.upload(new File(["%PDF"], "brief.pdf", { type: "application/pdf" }), "evidence"));

    expect(outcome.ok).toBe(true);
    expect(LIBRARY_TOKEN_KEY).toBe("authToken");
    expect(sessionStorage.getItem("authToken")).toBe(JSON.stringify(token));
  });

  it("throws AuthorizationError on an HTTP 401 from an upload and keeps the stored token in the library", async () => {
    const token = sessionJwt(TEST_WALLET_ACCOUNT);
    installFakeAtlasServer({ uploadResponse: () => new Response(JSON.stringify({ message: "Token revoked" }), { status: 401 }) });
    sessionStorage.setItem("authToken", JSON.stringify(token));
    const wallet = await createConnectedTestWallet();
    const { result } = renderHook(() => useAtlasProvider(), { wrapper: atlasWrapper(wallet) });
    await waitFor(() => {
      expect(result.current.isVerified).toBe(true);
    });
    await waitFor(() => {
      expect(result.current.roleRestrictions).toBeDefined();
    });

    const outcome = await settle(() => result.current.uploadFile(new File(["%PDF"], "brief.pdf", { type: "application/pdf" }), Roles.Evidence).catch((error: unknown) => error));

    expect(outcome).toBeInstanceOf(AuthorizationError);
    await waitFor(() => {
      expect(result.current.isVerified).toBe(false);
    });
    expect(sessionStorage.getItem("authToken")).toBe(JSON.stringify(token));
  });

  it("signs in with an EIP-4361 message for this host, the server nonce and the wallet's chain, expiring in 10 minutes", async () => {
    const server = installFakeAtlasServer();
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const { result } = renderHook(() => useAtlasUpload(), { wrapper: atlasWrapper(wallet) });
    await waitFor(() => {
      expect(result.current.limits("evidence")).not.toBeNull();
    });

    const outcome = await settle(() => result.current.upload(new File(["%PDF"], "brief.pdf", { type: "application/pdf" }), "evidence"));

    expect(outcome.ok).toBe(true);
    const [signature] = server.signatures;
    expect(signature?.account.toLowerCase()).toBe(TEST_WALLET_ACCOUNT.toLowerCase());
    const message = signature?.message ?? "";
    const lines = message.split("\n");
    expect(lines.slice(0, 5)).toEqual([
      `${window.location.host} wants you to sign in with your Ethereum account:`,
      TEST_WALLET_ACCOUNT,
      "",
      "Sign In to Kleros with Ethereum.",
      "",
    ]);
    expect(lines).toEqual(expect.arrayContaining([`URI: ${window.location.origin}`, "Version: 1", "Chain ID: 100", "Nonce: testnonce12345678"]));
    const field = (name: string) => Date.parse(lines.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2) ?? "");
    expect(field("Expiration Time") - field("Issued At")).toBeGreaterThanOrEqual(10 * 60 * 1000 - 1000);
    expect(field("Expiration Time") - field("Issued At")).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
    expect(server.graphql.find(({ kind }) => kind === "nonce")?.variables).toEqual({ address: TEST_WALLET_ACCOUNT });
    expect(server.graphql.find(({ kind }) => kind === "login")?.variables).toMatchObject({ message });
    expect(jwtSubject(server.uploads[0]?.authorization)?.toLowerCase()).toBe(TEST_WALLET_ACCOUNT.toLowerCase());
  });

  it("treats a stored token as a verified session only for the account in its sub", async () => {
    installFakeAtlasServer();
    sessionStorage.setItem("authToken", JSON.stringify(sessionJwt(TEST_WALLET_SECOND_ACCOUNT)));
    const wallet = await createConnectedTestWallet();
    const { result } = renderHook(() => ({ uploader: useAtlasUpload(), library: useAtlasProvider() }), { wrapper: atlasWrapper(wallet) });
    await waitFor(() => {
      expect(result.current.library.roleRestrictions).toBeDefined();
    });
    expect(result.current.library.isVerified).toBe(false);
    expect(result.current.uploader.isSignedIn).toBe(false);

    act(() => {
      wallet.changeAccount(TEST_WALLET_SECOND_ACCOUNT);
    });

    await waitFor(() => {
      expect(result.current.library.isVerified).toBe(true);
    });
    expect(result.current.uploader.isSignedIn).toBe(true);
  });
});
