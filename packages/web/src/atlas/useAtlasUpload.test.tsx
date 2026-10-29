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
  startInAct,
  testJwt,
  testPdf,
  type FakeAtlasServer,
  type FakeAtlasServerOptions,
} from "../test/atlas";
import { expectRenderErrors } from "../test/shell";
import { TEST_WALLET_ACCOUNT, TEST_WALLET_SECOND_ACCOUNT, createConnectedTestWallet, createTestWallet, type TestWallet } from "../test/wallet";
import { useAtlasUpload } from "./context";

const MIB = 1024 * 1024;

interface Setup {
  readonly connected?: boolean;
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

async function renderWithLibrary(wallet: TestWallet) {
  const hook = renderHook(() => ({ uploader: useAtlasUpload(), library: useAtlasProvider() }), { wrapper: atlasWrapper(wallet) });
  await waitFor(() => {
    expect(hook.result.current.uploader.limits("evidence")).not.toBeNull();
  });
  return hook;
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

function signInAndUploadRequests(server: FakeAtlasServer): number {
  return server.count("nonce") + server.count("sign") + server.count("login") + server.count("upload");
}

/** An upload answer that fails the `failingIndex`th upload (from 1) with `status` and Atlas's JSON `message`. */
function failingUpload(failingIndex: number, status: number, message: string) {
  let uploads = 0;
  return () => {
    uploads += 1;
    return uploads === failingIndex ? new Response(JSON.stringify({ message }), { status, headers: { "content-type": "application/json" } }) : new Response(TEST_UPLOAD_CID);
  };
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
    expectRenderErrors();
    expect(() => renderHook(() => useAtlasUpload())).toThrow("useAtlasUpload must be used inside AtlasGate.");
  });
});

describe("AtlasGate", () => {
  it("requests nothing without an Atlas URI, and an upload reports a plain upload failure", async () => {
    const { server, result } = await renderUploader({ configured: false });

    expect(result.current.availability).toBe("unconfigured");
    expect(result.current.limits("evidence")).toBeNull();
    const outcome = await settle(() => result.current.upload(testPdf(), "evidence"));
    expect(outcome).toMatchObject({ ok: false, error: "upload-failed", message: "An error occurred while uploading the file. Please try again." });
    const json = await settle(() => result.current.uploadJson("evidence.json", buildEvidenceDocument({ name: "n", description: "d", fileUri: null }), "policy"));
    expect(json).toMatchObject({ ok: false, error: "upload-failed", message: "An error occurred while uploading the file. Please try again." });
    expect(server.requests).toEqual([]);
  });

  it("requests only the unauthenticated roles(CourtV1) query at load and asks for no signature before the first upload action", async () => {
    const { server, result } = await renderReady();

    expect(result.current.availability).toBe("ready");
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.phase).toBe("idle");
    expect(server.requests).toEqual(["roles"]);
    expect(server.graphql).toEqual([{ kind: "roles", variables: { product: "CourtV1" }, authorization: null }]);
  });
});

describe("upload", () => {
  it("signs in, then uploads, in one upload action", async () => {
    const token = sessionJwt(TEST_WALLET_ACCOUNT);
    const { server, result } = await renderReady({ server: { issueToken: () => token } });

    const outcome = await settle(() => result.current.upload(testPdf(), "evidence"));

    expect(outcome).toEqual({ ok: true, path: TEST_UPLOAD_PATH });
    expect(server.requests.filter((kind) => kind !== "user")).toEqual(["roles", "nonce", "sign", "login", "upload"]);
    expect(server.uploads[0]?.authorization).toBe(`Bearer ${token}`);
    expect(server.uploads[0]).toMatchObject({ product: "CourtV1", role: "evidence", name: "brief.pdf" });
    await waitFor(() => {
      expect(result.current.isSignedIn).toBe(true);
    });
    expect(result.current.phase).toBe("idle");
  });

  it("makes the session unverified on an account switch, so the next upload signs in again from the new account", async () => {
    const server = installFakeAtlasServer();
    const wallet = await createConnectedTestWallet();
    const { result } = await renderWithLibrary(wallet);
    expect((await settle(() => result.current.uploader.upload(testPdf(), "evidence"))).ok).toBe(true);
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
    const outcome = await settle(() => result.current.uploader.upload(testPdf("second.pdf"), "evidence"));

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

  it("sends the uploadJson document as an application/json file under the policy role", async () => {
    const { server, result } = await renderReady();
    const document = buildEvidenceDocument({ name: "Title", description: "Why", fileUri: TEST_UPLOAD_PATH });

    const outcome = await settle(() => result.current.uploadJson("evidence.json", document, "policy"));

    expect(outcome).toEqual({ ok: true, path: TEST_UPLOAD_PATH });
    const [uploaded] = server.uploads;
    expect(uploaded).toMatchObject({ role: "policy", name: "evidence.json" });
    expect(uploaded?.file.type).toBe("application/json");
    expect(JSON.parse(await (uploaded?.file.text() ?? Promise.resolve("null")))).toEqual(document);
  });

  it("signs and uploads nothing without a connected wallet", async () => {
    const { server, result } = await renderReady({ connected: false });

    const outcome = await settle(() => result.current.upload(testPdf(), "evidence"));

    expect(outcome).toMatchObject({ ok: false, error: "no-wallet" });
    expect(server.requests).toEqual(["roles"]);
  });

  it("refuses a type the role does not allow before anything is signed, and says what would be accepted", async () => {
    const { server, result } = await renderReady();

    const outcome = await settle(() => result.current.upload(new File(["<script>"], "page.html", { type: "text/html" }), "evidence"));

    expect(outcome).toMatchObject({
      ok: false,
      error: "mime-not-allowed",
      message: "This file type can't be uploaded. Choose a PDF or an image, up to 20 MB.",
    });
    expect(server.requests).toEqual(["roles"]);
  });

  it("refuses a file over the role's size limit before anything is signed, and says what would be accepted", async () => {
    const { server, result } = await renderReady();

    const big = new File([new Uint8Array(MIB + 1)], "big.json", { type: "application/json" });
    const outcome = await settle(() => result.current.upload(big, "policy"));

    expect(outcome).toMatchObject({ ok: false, error: "too-large", message: "This file is too large. Choose a JSON file, up to 1 MB." });
    expect(server.requests).toEqual(["roles"]);
  });

  it("uploads nothing without the server's limits", async () => {
    const { server, result } = await renderUploader({ server: { roles: "fail" } });

    expect(result.current.limits("evidence")).toBeNull();
    const outcome = await settle(() => result.current.upload(testPdf(), "evidence"));

    expect(outcome).toMatchObject({ ok: false, error: "limits-unavailable" });
    // The upload asks for the limits once more before refusing, and only once.
    expect(server.count("roles")).toBe(2);
    expect(server.count("sign")).toBe(0);
    expect(server.count("upload")).toBe(0);
  });

  it("fetches limits that failed to load at first again on the next upload, which then proceeds", async () => {
    const { server, result } = await renderUploader({ server: { roles: "fail-once" } });

    expect(result.current.limits("evidence")).toBeNull();
    const outcome = await settle(() => result.current.upload(testPdf(), "evidence"));

    expect(outcome).toEqual({ ok: true, path: TEST_UPLOAD_PATH });
    expect(server.count("roles")).toBe(2);
    expect(server.count("upload")).toBe(1);
    await waitFor(() => {
      expect(result.current.limits("evidence")).not.toBeNull();
    });
  });

  it.each([
    ["disconnects", (wallet: TestWallet) => wallet.disconnect(), { ok: false, error: "no-wallet" }],
    ["changes chain", (wallet: TestWallet) => wallet.changeChain(100), { ok: false, error: "upload-failed", message: expect.stringContaining("chain") as unknown }],
  ])("asks for no signature when the wallet %s while the role limits are being fetched", async (_label, change, expected) => {
    const { server, wallet, result } = await renderUploader({ server: { roles: "fail-once" } });
    const roles = holdNextRequest("roles");
    const upload = startInAct(() => result.current.upload(testPdf(), "evidence"));
    await waitFor(() => {
      expect(roles.isHeld()).toBe(true);
    });

    await act(() => change(wallet));
    roles.release();
    const outcome = await settle(() => upload);

    expect(outcome).toMatchObject(expected);
    expect(signInAndUploadRequests(server)).toBe(0);
  });

  it("asks for no signature when the wallet changes chain while Atlas issues the sign-in nonce", async () => {
    const { server, wallet, result } = await renderReady();
    const nonce = holdNextRequest("nonce");
    const upload = startInAct(() => result.current.upload(testPdf(), "evidence"));
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

  it("treats a stored token without exp as expired, so the upload signs in again", async () => {
    sessionStorage.setItem("authToken", JSON.stringify(testJwt({ sub: TEST_WALLET_ACCOUNT })));
    const token = sessionJwt(TEST_WALLET_ACCOUNT);
    const server = installFakeAtlasServer({ issueToken: () => token });
    const wallet = await createConnectedTestWallet();
    const { result } = await renderWithLibrary(wallet);
    await waitFor(() => {
      expect(result.current.library.isVerified).toBe(true);
    });
    expect(result.current.uploader.isSignedIn).toBe(false);

    const outcome = await settle(() => result.current.uploader.upload(testPdf(), "evidence"));

    expect(outcome.ok).toBe(true);
    expect(server.count("sign")).toBe(1);
    expect(server.uploads[0]?.authorization).toBe(`Bearer ${token}`);
  });

  it("never passes a returned path that is not content-addressed to the caller", async () => {
    const { result } = await renderReady({ server: { uploadResponse: () => new Response("../../ipns/attacker.eth") } });

    const outcome = await settle(() => result.current.upload(testPdf(), "evidence"));

    expect(outcome).toMatchObject({ ok: false, error: "not-content-addressed" });
  });

  it("reports a declined signature neutrally and uploads nothing", async () => {
    const { server, result } = await renderReady({ server: { signature: "reject" } });

    const outcome = await settle(() => result.current.upload(testPdf(), "evidence"));

    expect(outcome).toMatchObject({ ok: false, error: "sign-in-rejected", message: "Signature declined. Nothing was uploaded." });
    expect(server.count("upload")).toBe(0);
    expect(result.current.phase).toBe("idle");
    expect(result.current.isSignedIn).toBe(false);
  });

  it("shows a failed sign-in and signs and uploads nothing", async () => {
    const { server, result } = await renderReady({ server: { nonce: "fail" } });

    const outcome = await settle(() => result.current.upload(testPdf(), "evidence"));

    expect(outcome).toMatchObject({ ok: false, error: "sign-in-failed" });
    expect(outcome.ok ? "" : outcome.message).toContain("Nonce unavailable");
    expect(server.count("sign")).toBe(0);
    expect(server.count("upload")).toBe(0);
  });

  it("shows the server's upload error, and signs in again on the next upload after an authorization failure", async () => {
    const { server, result } = await renderReady({ server: { uploadResponse: failingUpload(1, 401, "Token revoked") } });

    const first = await settle(() => result.current.upload(testPdf(), "evidence"));
    expect(first).toMatchObject({ ok: false, error: "upload-failed" });
    expect(first.ok ? "" : first.message).toContain("Token revoked");
    await waitFor(() => {
      expect(result.current.isSignedIn).toBe(false);
    });

    const second = await settle(() => result.current.upload(testPdf(), "evidence"));

    expect(second).toEqual({ ok: true, path: TEST_UPLOAD_PATH });
    expect(server.count("sign")).toBe(2);
  });

  it("ends the session for the tab on an authorization failure, so a reload signs in again", async () => {
    const server = installFakeAtlasServer({ uploadResponse: failingUpload(2, 401, "Token revoked") });
    const wallet = await createConnectedTestWallet();
    const firstTab = await renderWithLibrary(wallet);
    expect((await settle(() => firstTab.result.current.uploader.upload(testPdf(), "evidence"))).ok).toBe(true);

    const rejected = await settle(() => firstTab.result.current.uploader.upload(testPdf(), "evidence"));
    expect(rejected).toMatchObject({ ok: false, error: "upload-failed" });
    firstTab.unmount();

    const reloaded = await renderWithLibrary(wallet);
    expect(reloaded.result.current.library.isVerified).toBe(false);
    expect(reloaded.result.current.uploader.isSignedIn).toBe(false);
    const outcome = await settle(() => reloaded.result.current.uploader.upload(testPdf(), "evidence"));

    expect(outcome).toEqual({ ok: true, path: TEST_UPLOAD_PATH });
    expect(server.count("sign")).toBe(2);
    expect(server.uploads[2]?.authorization).not.toBe(server.uploads[1]?.authorization);
  });

  it("keeps the session after an upload failure that is not an authorization failure", async () => {
    const { server, result } = await renderReady({ server: { uploadResponse: failingUpload(2, 500, "Storage unavailable") } });
    expect((await settle(() => result.current.upload(testPdf(), "evidence"))).ok).toBe(true);

    const failed = await settle(() => result.current.upload(testPdf(), "evidence"));
    expect(failed).toMatchObject({ ok: false, error: "upload-failed" });
    expect(result.current.isSignedIn).toBe(true);

    const retried = await settle(() => result.current.upload(testPdf(), "evidence"));
    expect(retried.ok).toBe(true);
    expect(server.count("sign")).toBe(1);
  });

  it("reports signing-in, then uploading, then idle", async () => {
    // A slow answer, as over a network, so the uploading phase renders on its own.
    installFakeAtlasServer({
      uploadResponse: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(new Response(TEST_UPLOAD_CID));
          }, 50);
        }),
    });
    const wallet = await createConnectedTestWallet();
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

    await settle(() => result.current.upload(testPdf(), "evidence"));

    expect(phases).toEqual(["idle", "signing-in", "uploading", "idle"]);
  });
});
