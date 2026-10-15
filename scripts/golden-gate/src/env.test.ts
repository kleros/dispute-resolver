import { describe, expect, it } from "vitest";
import { createRedactor, redactAlso } from "./env";

const ENV = {
  REACT_APP_WEB3_PROVIDER_URL: "https://eth-mainnet.example.com/v2/abcdefghijklmnopqrstuvwx",
  REACT_APP_WEB3_XDAI_PROVIDER_URL: "https://rpc.gnosis.example/keyed?apikey=0123456789abcdef0123",
  REACT_APP_FLAG: "on",
  PATH: "/usr/bin:/bin",
};

describe("secret redaction (CLAUDE.md: never print a value of .env)", () => {
  it("replaces a whole RPC URL with its variable name", () => {
    const redact = createRedactor(ENV);
    expect(redact("POST https://eth-mainnet.example.com/v2/abcdefghijklmnopqrstuvwx failed")).toBe("POST <REACT_APP_WEB3_PROVIDER_URL> failed");
  });

  it("redacts the key of an RPC URL quoted without its host", () => {
    const redact = createRedactor(ENV);
    expect(redact("key abcdefghijklmnopqrstuvwx and apikey=0123456789abcdef0123")).toBe("key <redacted> and apikey=<redacted>");
  });

  it("leaves short values and variables outside REACT_APP_ alone", () => {
    const redact = createRedactor(ENV);
    expect(redact("on /usr/bin:/bin")).toBe("on /usr/bin:/bin");
  });

  it("no environment value survives in a text built from all of them", () => {
    const redact = createRedactor(ENV);
    const text = redact(JSON.stringify(ENV));
    expect(text).not.toContain("abcdefghijklmnopqrstuvwx");
    expect(text).not.toContain("0123456789abcdef0123");
  });

  it("§9.5: redacts the old runner's redirected URL, read from today's source, and its key quoted alone", () => {
    const legacy = `https://mainnet.infura.io/v3/${"feedface".repeat(4)}`;
    const redact = redactAlso(createRedactor(ENV), legacy, "<legacy Infura URL>");
    expect(redact(`[iframe RPC redirect][XHR] ${legacy} → ${ENV.REACT_APP_WEB3_PROVIDER_URL}`)).toBe("[iframe RPC redirect][XHR] <legacy Infura URL> → <REACT_APP_WEB3_PROVIDER_URL>");
    expect(redact(`key ${"feedface".repeat(4)}`)).toBe("key <redacted>");
  });
});
