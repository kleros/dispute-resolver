import { buildEvidenceDocument } from "@dispute-resolver/core";
import { useAtlasProvider } from "@kleros/kleros-app";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_ATLAS_URI,
  TEST_UPLOAD_CID,
  TEST_UPLOAD_PATH,
  atlasWrapper,
  installFakeAtlasServer,
  jwtSubject,
  sessionJwt,
  settle,
  testJwt,
  type FakeAtlasServer,
  type FakeAtlasServerOptions,
} from "../test/atlas";
import { TEST_WALLET_ACCOUNT, TEST_WALLET_SECOND_ACCOUNT, createTestWallet, type TestWallet } from "../test/wallet";
import { useAtlasUpload } from "./context";
import type { UploadResult } from "./types";

const MIB = 1024 * 1024;

function pdf(name = "brief.pdf"): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

interface Setup {
  readonly connected?: boolean;
  /** `false`: a deployment without Atlas (D-21). */
  readonly configured?: boolean;
  readonly server?: FakeAtlasServerOptions;
}

async function renderUploader({ connected = true, configured = true, server: serverOptions }: Setup = {}) {
  const server = installFakeAtlasServer(serverOptions);
  const wallet: TestWallet = createTestWallet();
  if (connected) await wallet.connect();
  const wrapper: (props: { readonly children?: ReactNode }) => ReactNode = atlasWrapper(wallet, configured ? TEST_ATLAS_URI : null);
  const hook = renderHook(() => useAtlasUpload(), { wrapper });
  if (configured) {
    await waitFor(() => {
      expect(server.count("roles")).toBe(1);
    });
  }
  return { server, wallet, result: hook.result };
}

async function renderReady(setup: Setup = {}) {
  const rendered = await renderUploader(setup);
  await waitFor(() => {
    expect(rendered.result.current.limits("evidence")).not.toBeNull();
  });
  return rendered;
}

const GRAPHQL_OPERATIONS = { roles: /\broles\s*\(/, nonce: /\bnonce\s*\(/ } as const;

/** Holds the next `operation` request until `release()`, so the test can change the wallet while an upload waits on it. */
function holdNextRequest(operation: keyof typeof GRAPHQL_OPERATIONS) {
  const serve = globalThis.fetch;
  const gate: { release?: () => void } = {};
  const opened = new Promise<void>((resolve) => {
    gate.release = resolve;
  });
  let held = false;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    if (!held && typeof init?.body === "string" && GRAPHQL_OPERATIONS[operation].test(init.body)) {
      held = true;
      return opened.then(() => serve(input, init));
    }
    return serve(input, init);
  });
  return {
    isHeld: () => held,
    release: () => {
      gate.release?.();
    },
  };
}

/** Starts an upload inside `act` and returns it without waiting. */
function startUpload(start: () => Promise<UploadResult>): Promise<UploadResult> {
  const started: { promise?: Promise<UploadResult> } = {};
  act(() => {
    started.promise = start();
  });
  if (started.promise === undefined) throw new Error("The upload did not start.");
  return started.promise;
}

function signInAndUploadRequests(server: FakeAtlasServer): number {
  return server.count("nonce") + server.count("sign") + server.count("login") + server.count("upload");
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("useAtlasUpload outside AtlasGate", () => {
  it("throws outside AtlasGate", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // React reports the render error to the window as well; jsdom would print it.
    const silence = (event: ErrorEvent) => {
      event.preventDefault();
    };
    window.addEventListener("error", silence);
    try {
      expect(() => renderHook(() => useAtlasUpload())).toThrow("useAtlasUpload must be used inside AtlasGate.");
    } finally {
      window.removeEventListener("error", silence);
    }
  });
});

describe("AtlasGate", () => {
  it("D-21: without REACT_APP_ATLAS_URI uploads are unavailable and nothing is requested", async () => {
    const { server, result } = await renderUploader({ configured: false });

    expect(result.current.availability).toBe("unconfigured");
    expect(result.current.limits("evidence")).toBeNull();
    const outcome = await settle(() => result.current.upload(pdf(), "evidence"));
    expect(outcome).toMatchObject({ ok: false, error: "unconfigured" });
    const json = await settle(() => result.current.uploadJson("evidence.json", buildEvidenceDocument({ name: "n", description: "d", fileUri: null }), "policy"));
    expect(json).toMatchObject({ ok: false, error: "unconfigured" });
    expect(server.requests).toEqual([]);
  });

  it("D-20: the only request at load is the unauthenticated roles(CourtV1) query", async () => {
    const { server, result } = await renderReady();

    expect(result.current.availability).toBe("ready");
    expect(server.requests).toEqual(["roles"]);
    expect(server.graphql).toEqual([{ kind: "roles", variables: { product: "CourtV1" }, authorization: null }]);
  });

  it("A15: no signature is requested before the user's first upload action", async () => {
    const { server, result } = await renderReady();

    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.phase).toBe("idle");
    expect(server.count("nonce") + server.count("sign") + server.count("login")).toBe(0);
  });
});

describe("upload", () => {
  it("D-52: one upload action signs in, then uploads", async () => {
    const token = sessionJwt(TEST_WALLET_ACCOUNT);
    const { server, result } = await renderReady({ server: { issueToken: () => token } });

    const outcome = await settle(() => result.current.upload(pdf(), "evidence"));

    expect(outcome).toEqual({ ok: true, path: TEST_UPLOAD_PATH });
    expect(server.requests.filter((kind) => kind !== "user")).toEqual(["roles", "nonce", "sign", "login", "upload"]);
    expect(server.uploads[0]?.authorization).toBe(`Bearer ${token}`);
    await waitFor(() => {
      expect(result.current.isSignedIn).toBe(true);
    });
    expect(result.current.phase).toBe("idle");
  });

  it("D-20: a signed-in session uploads again without a new signature", async () => {
    const { server, result } = await renderReady();
    await settle(() => result.current.upload(pdf(), "evidence"));

    const second = await settle(() => result.current.upload(pdf("second.pdf"), "evidence"));

    expect(second.ok).toBe(true);
    expect(server.count("sign")).toBe(1);
    expect(server.count("upload")).toBe(2);
  });

  it("§2.9 isAuthenticated, §8.3, D-20, A15: an account switch makes the session unverified, so the next upload signs in again from the new account", async () => {
    const server = installFakeAtlasServer();
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderHook(() => ({ uploader: useAtlasUpload(), library: useAtlasProvider() }), { wrapper: atlasWrapper(wallet) });
    await waitFor(() => {
      expect(result.current.uploader.limits("evidence")).not.toBeNull();
    });
    expect((await settle(() => result.current.uploader.upload(pdf(), "evidence"))).ok).toBe(true);
    await waitFor(() => {
      expect(result.current.uploader.isSignedIn).toBe(true);
    });

    act(() => {
      wallet.changeAccount(TEST_WALLET_SECOND_ACCOUNT);
    });

    await waitFor(() => {
      expect(result.current.library.isVerified).toBe(false);
    });
    expect(result.current.uploader.isSignedIn).toBe(false);
    const outcome = await settle(() => result.current.uploader.upload(pdf("second.pdf"), "evidence"));

    expect(outcome).toEqual({ ok: true, path: TEST_UPLOAD_PATH });
    expect(server.signatures.map(({ account }) => account.toLowerCase())).toEqual([TEST_WALLET_ACCOUNT.toLowerCase(), TEST_WALLET_SECOND_ACCOUNT.toLowerCase()]);
    expect(server.uploads.map(({ authorization }) => jwtSubject(authorization)?.toLowerCase())).toEqual([
      TEST_WALLET_ACCOUNT.toLowerCase(),
      TEST_WALLET_SECOND_ACCOUNT.toLowerCase(),
    ]);
    await waitFor(() => {
      expect(result.current.uploader.isSignedIn).toBe(true);
    });
  });

  it("A16: user files are uploaded for CourtV1 under the evidence role", async () => {
    const { server, result } = await renderReady();

    await settle(() => result.current.upload(pdf("brief.pdf"), "evidence"));

    expect(server.uploads).toHaveLength(1);
    expect(server.uploads[0]).toMatchObject({ product: "CourtV1", role: "evidence", name: "brief.pdf" });
  });

  it("A16: uploadJson sends the document as an application/json file under the policy role", async () => {
    const { server, result } = await renderReady();
    const document = buildEvidenceDocument({ name: "Title", description: "Why", fileUri: TEST_UPLOAD_PATH });

    const outcome = await settle(() => result.current.uploadJson("evidence.json", document, "policy"));

    expect(outcome).toEqual({ ok: true, path: TEST_UPLOAD_PATH });
    const [uploaded] = server.uploads;
    expect(uploaded).toMatchObject({ role: "policy", name: "evidence.json" });
    expect(uploaded?.file.type).toBe("application/json");
    expect(JSON.parse(await (uploaded?.file.text() ?? Promise.resolve("null")))).toEqual(document);
  });

  it("no-wallet: without a connected wallet nothing is signed or uploaded", async () => {
    const { server, result } = await renderReady({ connected: false });

    const outcome = await settle(() => result.current.upload(pdf(), "evidence"));

    expect(outcome).toMatchObject({ ok: false, error: "no-wallet" });
    expect(server.requests).toEqual(["roles"]);
  });

  it("B16: a type the role does not allow is refused before anything is signed", async () => {
    const { server, result } = await renderReady();

    const outcome = await settle(() => result.current.upload(new File(["<script>"], "page.html", { type: "text/html" }), "evidence"));

    expect(outcome).toMatchObject({ ok: false, error: "mime-not-allowed" });
    expect(server.requests).toEqual(["roles"]);
  });

  it("B16: a file over the role's maxSize is refused before anything is signed", async () => {
    const { server, result } = await renderReady();

    const big = new File([new Uint8Array(MIB + 1)], "big.json", { type: "application/json" });
    const outcome = await settle(() => result.current.upload(big, "policy"));

    expect(outcome).toMatchObject({ ok: false, error: "too-large", message: "The file is larger than the 1 MB limit." });
    expect(server.requests).toEqual(["roles"]);
  });

  it("B16: nothing is uploaded without the server's limits", async () => {
    const { server, result } = await renderUploader({ server: { roles: "fail" } });

    expect(result.current.limits("evidence")).toBeNull();
    const outcome = await settle(() => result.current.upload(pdf(), "evidence"));

    expect(outcome).toMatchObject({ ok: false, error: "limits-unavailable" });
    // The upload asks for the limits once more before refusing, and only once.
    expect(server.count("roles")).toBe(2);
    expect(server.count("sign")).toBe(0);
    expect(server.count("upload")).toBe(0);
  });

  it("B16: limits that failed to load at first are fetched again by the next upload, which then proceeds", async () => {
    const { server, result } = await renderUploader({ server: { roles: "fail-once" } });

    expect(result.current.limits("evidence")).toBeNull();
    const outcome = await settle(() => result.current.upload(pdf(), "evidence"));

    expect(outcome).toEqual({ ok: true, path: TEST_UPLOAD_PATH });
    expect(server.count("roles")).toBe(2);
    expect(server.count("upload")).toBe(1);
    await waitFor(() => {
      expect(result.current.limits("evidence")).not.toBeNull();
    });
  });

  it("B16: a recovered roles query still refuses a file its limits do not allow, before anything is signed", async () => {
    const { server, result } = await renderUploader({ server: { roles: "fail-once" } });

    const outcome = await settle(() => result.current.upload(new File(["x"], "notes.txt", { type: "text/plain" }), "evidence"));

    expect(outcome).toMatchObject({ ok: false, error: "mime-not-allowed" });
    expect(server.count("roles")).toBe(2);
    expect(server.count("sign")).toBe(0);
  });

  it("asks for no signature when the wallet disconnects while the role limits are being fetched", async () => {
    const { server, wallet, result } = await renderUploader({ server: { roles: "fail-once" } });
    const roles = holdNextRequest("roles");
    const upload = startUpload(() => result.current.upload(pdf(), "evidence"));
    await waitFor(() => {
      expect(roles.isHeld()).toBe(true);
    });

    await act(() => wallet.disconnect());
    roles.release();
    const outcome = await settle(() => upload);

    expect(outcome).toMatchObject({ ok: false, error: "no-wallet" });
    expect(signInAndUploadRequests(server)).toBe(0);
  });

  it("asks for no signature when the wallet changes chain before the sign-in", async () => {
    const { server, wallet, result } = await renderUploader({ server: { roles: "fail-once" } });
    const roles = holdNextRequest("roles");
    const upload = startUpload(() => result.current.upload(pdf(), "evidence"));
    await waitFor(() => {
      expect(roles.isHeld()).toBe(true);
    });

    await act(() => wallet.changeChain(100));
    roles.release();
    const outcome = await settle(() => upload);

    expect(outcome).toMatchObject({ ok: false, error: "upload-failed", message: expect.stringContaining("chain") as unknown });
    expect(signInAndUploadRequests(server)).toBe(0);
  });

  it("asks for no signature when the wallet changes chain while Atlas issues the sign-in nonce", async () => {
    const { server, wallet, result } = await renderReady();
    const nonce = holdNextRequest("nonce");
    const upload = startUpload(() => result.current.upload(pdf(), "evidence"));
    await waitFor(() => {
      expect(nonce.isHeld()).toBe(true);
    });

    await act(() => wallet.changeChain(100));
    nonce.release();
    const outcome = await settle(() => upload);

    expect(outcome).toMatchObject({ ok: false, error: "upload-failed", message: expect.stringContaining("chain") as unknown });
    expect(server.count("sign")).toBe(0);
    expect(server.count("login")).toBe(0);
    expect(server.count("upload")).toBe(0);
    expect(result.current.phase).toBe("idle");
  });

  it("B16: a stored token without exp is treated as expired, so the upload signs in again", async () => {
    sessionStorage.setItem("authToken", JSON.stringify(testJwt({ sub: TEST_WALLET_ACCOUNT })));
    const token = sessionJwt(TEST_WALLET_ACCOUNT);
    const server = installFakeAtlasServer({ issueToken: () => token });
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderHook(() => ({ uploader: useAtlasUpload(), library: useAtlasProvider() }), { wrapper: atlasWrapper(wallet) });
    await waitFor(() => {
      expect(result.current.library.isVerified).toBe(true);
    });
    await waitFor(() => {
      expect(result.current.uploader.limits("evidence")).not.toBeNull();
    });
    expect(result.current.uploader.isSignedIn).toBe(false);

    const outcome = await settle(() => result.current.uploader.upload(pdf(), "evidence"));

    expect(outcome.ok).toBe(true);
    expect(server.count("sign")).toBe(1);
    expect(server.uploads[0]?.authorization).toBe(`Bearer ${token}`);
  });

  it("B16: an expired stored token makes the upload sign in again", async () => {
    sessionStorage.setItem("authToken", JSON.stringify(sessionJwt(TEST_WALLET_ACCOUNT, -60)));
    const { server, result } = await renderReady();

    const outcome = await settle(() => result.current.upload(pdf(), "evidence"));

    expect(outcome.ok).toBe(true);
    expect(server.count("sign")).toBe(1);
  });

  it("B16: a returned path that is not content-addressed never reaches the caller", async () => {
    const { result } = await renderReady({ server: { uploadResponse: () => new Response("../../ipns/attacker.eth") } });

    const outcome = await settle(() => result.current.upload(pdf(), "evidence"));

    expect(outcome).toMatchObject({ ok: false, error: "not-content-addressed" });
  });

  it("D-52: a declined signature is reported neutrally and nothing is uploaded", async () => {
    const { server, result } = await renderReady({ server: { signature: "reject" } });

    const outcome = await settle(() => result.current.upload(pdf(), "evidence"));

    expect(outcome).toMatchObject({ ok: false, error: "sign-in-rejected", message: "Signature declined. Nothing was uploaded." });
    expect(server.count("upload")).toBe(0);
    expect(result.current.phase).toBe("idle");
    expect(result.current.isSignedIn).toBe(false);
  });

  it("sign-in-failed: a failed sign-in is shown and nothing is signed or uploaded", async () => {
    const { server, result } = await renderReady({ server: { nonce: "fail" } });

    const outcome = await settle(() => result.current.upload(pdf(), "evidence"));

    expect(outcome).toMatchObject({ ok: false, error: "sign-in-failed" });
    expect(outcome.ok ? "" : outcome.message).toContain("Nonce unavailable");
    expect(server.count("sign")).toBe(0);
    expect(server.count("upload")).toBe(0);
  });

  it("upload-failed: the server's error is shown, and after an authorization failure the next upload signs in again", async () => {
    let uploads = 0;
    const uploadResponse = () => {
      uploads += 1;
      return uploads === 1
        ? new Response(JSON.stringify({ message: "Token revoked" }), { status: 401, headers: { "content-type": "application/json" } })
        : new Response(TEST_UPLOAD_CID);
    };
    const { server, result } = await renderReady({ server: { uploadResponse } });

    const first = await settle(() => result.current.upload(pdf(), "evidence"));
    expect(first).toMatchObject({ ok: false, error: "upload-failed" });
    expect(first.ok ? "" : first.message).toContain("Token revoked");
    await waitFor(() => {
      expect(result.current.isSignedIn).toBe(false);
    });

    const second = await settle(() => result.current.upload(pdf(), "evidence"));

    expect(second).toEqual({ ok: true, path: TEST_UPLOAD_PATH });
    expect(server.count("sign")).toBe(2);
  });

  it("F2 (§6.4, A15): an authorization failure ends the session for the tab, so a reload signs in again", async () => {
    let uploads = 0;
    const uploadResponse = () => {
      uploads += 1;
      return uploads === 2
        ? new Response(JSON.stringify({ message: "Token revoked" }), { status: 401, headers: { "content-type": "application/json" } })
        : new Response(TEST_UPLOAD_CID);
    };
    const server = installFakeAtlasServer({ uploadResponse });
    const wallet = createTestWallet();
    await wallet.connect();
    const renderTab = async () => {
      const hook = renderHook(() => ({ uploader: useAtlasUpload(), library: useAtlasProvider() }), { wrapper: atlasWrapper(wallet) });
      await waitFor(() => {
        expect(hook.result.current.uploader.limits("evidence")).not.toBeNull();
      });
      return hook;
    };
    const firstTab = await renderTab();
    expect((await settle(() => firstTab.result.current.uploader.upload(pdf(), "evidence"))).ok).toBe(true);

    const rejected = await settle(() => firstTab.result.current.uploader.upload(pdf(), "evidence"));
    expect(rejected).toMatchObject({ ok: false, error: "upload-failed" });
    firstTab.unmount();

    const reloaded = await renderTab();
    expect(reloaded.result.current.library.isVerified).toBe(false);
    expect(reloaded.result.current.uploader.isSignedIn).toBe(false);
    const outcome = await settle(() => reloaded.result.current.uploader.upload(pdf(), "evidence"));

    expect(outcome).toEqual({ ok: true, path: TEST_UPLOAD_PATH });
    expect(server.count("sign")).toBe(2);
    expect(server.uploads[2]?.authorization).not.toBe(server.uploads[1]?.authorization);
  });

  it("F2 (D-20): an upload failure that is not an authorization failure keeps the session", async () => {
    let uploads = 0;
    const uploadResponse = () => {
      uploads += 1;
      return uploads === 2
        ? new Response(JSON.stringify({ message: "Storage unavailable" }), { status: 500, headers: { "content-type": "application/json" } })
        : new Response(TEST_UPLOAD_CID);
    };
    const { server, result } = await renderReady({ server: { uploadResponse } });
    expect((await settle(() => result.current.upload(pdf(), "evidence"))).ok).toBe(true);

    const failed = await settle(() => result.current.upload(pdf(), "evidence"));
    expect(failed).toMatchObject({ ok: false, error: "upload-failed" });
    expect(result.current.isSignedIn).toBe(true);

    const retried = await settle(() => result.current.upload(pdf(), "evidence"));
    expect(retried.ok).toBe(true);
    expect(server.count("sign")).toBe(1);
  });

  it("D-52: reports signing-in, then uploading, then idle", async () => {
    // A slow answer, as over a network, so the uploading phase renders on its own.
    installFakeAtlasServer({
      uploadResponse: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(new Response(TEST_UPLOAD_CID));
          }, 50);
        }),
    });
    const wallet = createTestWallet();
    await wallet.connect();
    const phases: string[] = [];
    const { result } = renderHook(
      () => {
        const uploader = useAtlasUpload();
        if (phases.at(-1) !== uploader.phase) phases.push(uploader.phase);
        return uploader;
      },
      { wrapper: atlasWrapper(wallet) },
    );
    await waitFor(() => {
      expect(result.current.limits("evidence")).not.toBeNull();
    });

    await settle(() => result.current.upload(pdf(), "evidence"));

    expect(phases).toEqual(["idle", "signing-in", "uploading", "idle"]);
  });
});
