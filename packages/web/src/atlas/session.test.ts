import { AuthorizationError, Roles, useAtlasProvider } from "@kleros/kleros-app";
import klerosAppPackage from "@kleros/kleros-app/package.json";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { atlasWrapper, installFakeAtlasServer, sessionJwt, settle, testJwt } from "../test/atlas";
import { TEST_WALLET_ACCOUNT, createTestWallet } from "../test/wallet";
import { useAtlasUpload } from "./context";
import { LIBRARY_TOKEN_KEY, clearRejectedToken, isLiveToken, readStoredToken, tokenExpiry } from "./session";

const NOW = 1_800_000_000;

function storageWith(value: string | null): Pick<Storage, "getItem"> {
  return { getItem: () => value };
}

describe("tokenExpiry and isLiveToken", () => {
  it("B16: a token with an exp in the future counts", () => {
    const token = testJwt({ sub: TEST_WALLET_ACCOUNT, exp: NOW + 60 });
    expect(tokenExpiry(token)).toBe(NOW + 60);
    expect(isLiveToken(token, NOW)).toBe(true);
  });

  it("B16: a token without exp is treated as expired", () => {
    expect(isLiveToken(testJwt({ sub: TEST_WALLET_ACCOUNT }), NOW)).toBe(false);
    expect(isLiveToken(testJwt({ sub: TEST_WALLET_ACCOUNT, exp: String(NOW + 60) }), NOW)).toBe(false);
  });

  it("B16: an expired token counts as signed out", () => {
    expect(isLiveToken(testJwt({ sub: TEST_WALLET_ACCOUNT, exp: NOW }), NOW)).toBe(false);
    expect(isLiveToken(testJwt({ sub: TEST_WALLET_ACCOUNT, exp: NOW - 1 }), NOW)).toBe(false);
  });

  it("B16: an undecodable token counts as signed out", () => {
    expect(isLiveToken(null, NOW)).toBe(false);
    expect(isLiveToken("not-a-jwt", NOW)).toBe(false);
    expect(isLiveToken("a.b", NOW)).toBe(false);
    expect(isLiveToken("a.%%%.c", NOW)).toBe(false);
    expect(isLiveToken(`a.${btoa("not json")}.c`, NOW)).toBe(false);
    expect(isLiveToken(`a.${btoa("ÿþ")}.c`, NOW)).toBe(false);
    expect(isLiveToken(testJwt({ exp: NOW + 60 }), NOW)).toBe(false);
  });
});

describe("readStoredToken", () => {
  it("D-20: reads the JSON-encoded token string the library stores", () => {
    expect(readStoredToken(storageWith(JSON.stringify("header.payload.signature")))).toBe("header.payload.signature");
  });

  it("B16: anything else is no token", () => {
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

  it("F2 (A15): removes the stored token Atlas rejected", () => {
    const storage = storageHolding("rejected.token.value");

    clearRejectedToken(storage, "rejected.token.value");

    expect(storage.items.has(LIBRARY_TOKEN_KEY)).toBe(false);
  });

  it("F2 (D-20): keeps a token stored by a newer sign-in", () => {
    const storage = storageHolding("newer.token.value");

    clearRejectedToken(storage, "rejected.token.value");

    expect(readStoredToken(storage)).toBe("newer.token.value");
  });

  it("F2: storage the browser refuses is left alone without throwing", () => {
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

  it("@kleros/kleros-app 3.1.0: is the installed version this coupling was written against", () => {
    expect(klerosAppPackage.version).toBe("3.1.0");
  });

  it('@kleros/kleros-app 3.1.0: after sign-in the token is stored JSON-encoded under sessionStorage "authToken"', async () => {
    const token = sessionJwt(TEST_WALLET_ACCOUNT);
    installFakeAtlasServer({ issueToken: () => token });
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderHook(() => useAtlasUpload(), { wrapper: atlasWrapper(wallet) });
    await waitFor(() => {
      expect(result.current.limits("evidence")).not.toBeNull();
    });

    const outcome = await settle(() => result.current.upload(new File(["%PDF"], "brief.pdf", { type: "application/pdf" }), "evidence"));

    expect(outcome.ok).toBe(true);
    expect(LIBRARY_TOKEN_KEY).toBe("authToken");
    expect(sessionStorage.getItem("authToken")).toBe(JSON.stringify(token));
  });

  it("@kleros/kleros-app 3.1.0: an HTTP 401 from an upload throws AuthorizationError and keeps the stored token in the library", async () => {
    const token = sessionJwt(TEST_WALLET_ACCOUNT);
    installFakeAtlasServer({ uploadResponse: () => new Response(JSON.stringify({ message: "Token revoked" }), { status: 401 }) });
    sessionStorage.setItem("authToken", JSON.stringify(token));
    const wallet = createTestWallet();
    await wallet.connect();
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

  it("@kleros/kleros-app 3.1.0: a token stored that way before mount is the library's verified session", async () => {
    installFakeAtlasServer();
    sessionStorage.setItem("authToken", JSON.stringify(sessionJwt(TEST_WALLET_ACCOUNT)));
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderHook(() => useAtlasUpload(), { wrapper: atlasWrapper(wallet) });

    await waitFor(() => {
      expect(result.current.isSignedIn).toBe(true);
    });
  });
});
