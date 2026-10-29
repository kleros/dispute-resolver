import { describe, expect, it } from "vitest";
import { REGISTRY } from "../registry";
import { describeAppealRules } from "./index";
import type { AppealRules } from "./types";
import { recordedDetection } from "../test/families/testHelpers";

describe("describeAppealRules", () => {
  it.each<[string, number, string, AppealRules]>([
    ["an old Reality proxy without an appeal function cannot be appealed", 1, "0x594ec762b59978c97c82bc36ab493ed8b1f1f368", { route: "none", tie: null, noun: "answer" }],
    [
      "a registered Reality proxy with appeals crowdfunds answers, Refuse to Arbitrate winning a tie",
      100,
      "0xe04f5791d671d5c4e08ab49b39807087b591ea3e",
      { route: "crowdfunding", tie: "refuse-is-winner", noun: "answer" },
    ],
    ["the ArbitrableProxy crowdfunds options", 1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf", { route: "crowdfunding", tie: "refuse-is-winner", noun: "option" }],
    [
      "a governor crowdfunds lists and shares one deposit in a tie",
      1,
      "0x327a29fce0a6490e4236240be176daa282eccfdf",
      { route: "crowdfunding", tie: "shared-full-period", noun: "list" },
    ],
    ["Unslashed's tie makes every option a winner", 1, "0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38", { route: "crowdfunding", tie: "all-winner", noun: "option" }],
    ["Escrow V1 appeals by paying the cost", 1, "0xe2dd8cce2c33a04215074adb4b5820b765d8ed9d", { route: "escrow", tie: null, noun: "option" }],
    ["a view-only contract appeals in its own application", 1, "0xebcf3bca271b26ae4b162ba560e243055af0e679", { route: "arbitrable", tie: null, noun: "option" }],
    ["the legacy resolver proxy's funding is not supported here", 1, "0x135c573503f70dc290b1d60fe2e7f7eb114febd6", { route: "unsupported", tie: null, noun: "option" }],
  ])("%s", async (_, chainId, address, expected) => {
    expect(describeAppealRules(REGISTRY, await recordedDetection(chainId, address))).toEqual(expected);
  });
});
