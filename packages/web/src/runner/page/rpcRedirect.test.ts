import { describe, expect, it } from "vitest";
import { SAMPLE_REDIRECTS, createFakeRunnerEnvironment } from "../../test/runner";
import { installRpcRedirect, redirectTarget } from "./rpcRedirect";

const TARGET = "https://rpc.example/mainnet";

describe("redirectTarget (D-25)", () => {
  it("D-25: redirects any key on a known provider host, not only the legacy URL", () => {
    expect(redirectTarget(SAMPLE_REDIRECTS, "https://mainnet.infura.io/v3/668b3268d5b241b5bab5c6cb886e4c61")).toBe(TARGET);
    expect(redirectTarget(SAMPLE_REDIRECTS, "https://mainnet.infura.io/v3/0123456789abcdef0123456789abcdef")).toBe(TARGET);
    expect(redirectTarget(SAMPLE_REDIRECTS, "https://MAINNET.infura.io/v3/key")).toBe(TARGET);
  });

  it("D-25: leaves every other URL alone", () => {
    const plainHttp = new URL("https://mainnet.infura.io/v3/key");
    plainHttp.protocol = "http:";
    for (const url of [
      plainHttp.href,
      "wss://mainnet.infura.io/ws/v3/key",
      "https://mainnet.infura.io/v2/key",
      "https://mainnet.infura.io:8443/v3/key",
      "https://sepolia.infura.io/v3/key",
      "https://evil-mainnet.infura.io/v3/key",
      "https://mainnet.infura.io.evil.example/v3/key",
      "https://ipfs.kleros.io/ipfs/Qm",
      "/v3/key",
      "not a url",
    ]) {
      expect(redirectTarget(SAMPLE_REDIRECTS, url)).toBeUndefined();
    }
  });

  it("D-25: redirects nothing when the host sent no rules", () => {
    expect(redirectTarget([], "https://mainnet.infura.io/v3/key")).toBeUndefined();
  });
});

describe("installRpcRedirect (D-25)", () => {
  it("D-25: rewrites a matching fetch given as a string, a URL or a Request", async () => {
    const fake = createFakeRunnerEnvironment();
    installRpcRedirect(fake.env.network, SAMPLE_REDIRECTS);

    await fake.fetch("https://mainnet.infura.io/v3/key");
    await fake.fetch(new URL("https://mainnet.infura.io/v3/key"));
    await fake.fetch(new Request("https://mainnet.infura.io/v3/key", { method: "POST", body: "{}" }));

    const [first, second, third] = fake.requests;
    expect(first?.input).toBe(TARGET);
    expect(second?.input).toBe(TARGET);
    expect(third?.input).toBeInstanceOf(Request);
    expect((third?.input as Request).url).toBe(TARGET);
    expect((third?.input as Request).method).toBe("POST");
    await expect((third?.input as Request).text()).resolves.toBe("{}");
  });

  it("D-25: passes a non-matching fetch through untouched", async () => {
    const fake = createFakeRunnerEnvironment();
    installRpcRedirect(fake.env.network, SAMPLE_REDIRECTS);
    const request = new Request("https://cdn.kleros.link/ipfs/Qm");
    await fake.fetch(request);
    expect(fake.requests[0]?.input).toBe(request);
  });

  it("D-25: rewrites a matching XMLHttpRequest and keeps the other arguments exactly as given", () => {
    const fake = createFakeRunnerEnvironment();
    installRpcRedirect(fake.env.network, SAMPLE_REDIRECTS);

    fake.xhrOpen("POST", "https://mainnet.infura.io/v3/key");
    fake.xhrOpen("POST", new URL("https://mainnet.infura.io/v3/key"), true, null, null);
    fake.xhrOpen("GET", "https://cdn.kleros.link/ipfs/Qm", true);

    expect(fake.requests).toEqual([
      { via: "xhr", input: TARGET, rest: [] },
      { via: "xhr", input: TARGET, rest: [true, null, null] },
      { via: "xhr", input: "https://cdn.kleros.link/ipfs/Qm", rest: [true] },
    ]);
  });

  it("D-25: wraps nothing when there are no rules", async () => {
    const fake = createFakeRunnerEnvironment();
    let wrapped = 0;
    installRpcRedirect(
      {
        wrapFetch: () => {
          wrapped += 1;
        },
        wrapXhrOpen: () => {
          wrapped += 1;
        },
      },
      [],
    );
    await fake.fetch("https://mainnet.infura.io/v3/key");
    expect(wrapped).toBe(0);
    expect(fake.requests[0]?.input).toBe("https://mainnet.infura.io/v3/key");
  });
});
