import { zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { readProductFunding, readsProductFunding } from "./index";
import type { Hex } from "../types";
import { recordedDetection } from "../test/families/testHelpers";
import { addCalls, editAnswerWord, editArg, editRaw, editValues, editWord, productCase, productRead, type ProductCase, type RecordedCall } from "../test/products/testHelpers";
import { rpcError } from "../test/rpc/testHelpers";

const POH_V1 = productCase("poh-v1 1495");
const POH_V2 = productCase("poh-v2 1660");
const LIGHT = productCase("light 939");
const BINARY_PROXY = productCase("bap 193");
const OTHER = "0x00000000000000000000000000000000000000ee";

async function read(kase: ProductCase) {
  const { client, binding, family } = productRead(kase);
  return readProductFunding(client, binding, family);
}

/** The storage words of a Proof of Humanity v2 read, in the order read. */
const [LENGTH, REQUEST, CHALLENGE, CHALLENGE_DISPUTE, ROUND] = [0, 1, 2, 3, 4];
const setBits = (offset: bigint, width: bigint, value: bigint) => (word: bigint) => (word & ~(((1n << width) - 1n) << offset)) | (value << offset);

/** The round `fn` reads moved to the first one, which holds the deposits and never appeal funding, answered as funded. */
function firstRound(kase: ProductCase, kind: "poh-v1" | "light", values: Readonly<Record<string, unknown>>): ProductCase {
  return editValues(editArg(kase, kind, "getRoundInfo", kind === "poh-v1" ? 3 : 2, "0"), kind, "getRoundInfo", values);
}

/** One past the largest value of the 16-bit fields Proof of Humanity v1 stores, and of a 64-bit array index. */
const [PAST_16_BITS, PAST_64_BITS] = [1n << 16n, 1n << 64n];

/** The binary proxy's dispute stored at local ID `local`, every call naming it answered as recorded. */
function binaryProxyAt(local: bigint): ProductCase {
  const moved = editValues(BINARY_PROXY, "bap", "externalIDtoLocalID", { localId: String(local) });
  return editArg(editArg(moved, "bap", "disputes", 0, String(local)), "bap", "crowdfundingStatus", 0, String(local));
}

/** The Light Curate dispute with its item ID replaced by `key`, every call naming it answered as recorded. */
function lightItem(key: Hex): ProductCase {
  const moved = editValues(LIGHT, "light", "arbitratorDisputeIDToItemID", { key });
  return ["getItemInfo", "getRequestInfo", "getRoundInfo"].reduce((kase, fn) => editArg(kase, "light", fn, 0, key), moved);
}

/** `count` requests of the 1495 submission, the newest `count - 1` of them challenged in other disputes. */
function pohRequests(count: number): ProductCase {
  const submission = POH_V1.calls["poh-v1"]?.[1]?.args[0] ?? "";
  const newer = Array.from({ length: count - 1 }, (_, index): RecordedCall => ({
    fn: "getChallengeInfo",
    args: [submission, String(index + 1), "0"],
    values: { lastRoundID: "1", disputeID: "999" },
  }));
  return addCalls(editValues(POH_V1, "poh-v1", "getSubmissionInfo", { numberOfRequests: String(count) }), "poh-v1", newer);
}

describe("readProductFunding", () => {
  it.each<[string, string, readonly bigint[]]>([
    ["Proof of Humanity v1, the side funded alone after a tie (mainnet 1495)", "poh-v1 1495", [2n]],
    ["Proof of Humanity v1, a challenge of the request below a newer one (mainnet 616)", "poh-v1 616", [2n]],
    ["Proof of Humanity v1, a last round nobody funded (mainnet 554)", "poh-v1 554", []],
    ["Proof of Humanity v2 from its storage (mainnet 1660)", "poh-v2 1660", [2n]],
    ["Proof of Humanity v2, a last round nobody funded (Gnosis 402)", "poh-v2 402", []],
    ["Proof of Humanity v2, the 24th request of a humanity (Sepolia 280)", "poh-v2 280", [1n]],
    ["the T2CR token list, past a newer undisputed request (mainnet 38)", "atl 38", [2n]],
    ["a Generalized TCR, two requests below the newest (mainnet 344)", "gtcr 344", [1n]],
    ["a Light Curate clone (Gnosis 939)", "light 939", [2n]],
    ["the BinaryArbitrableProxy (mainnet 193)", "bap 193", [1n]],
    ["the BinaryArbitrableProxy after three appealed rounds (mainnet 328)", "bap 328", []],
  ])("reads the fully funded rulings of the round its rule() uses: %s", async (_, label, funded) => {
    expect(await read(productCase(label))).toEqual({ ok: true, value: funded });
  });

  it.each<[string, string]>([
    ["an ArbitrableProxy, which answers the binary proxy's first calls (mainnet 1454)", "bap 1454"],
    ["a binary proxy without arbitrator(), whatever its other getters say (mainnet 165)", "bap 165"],
    ["an item the Light Curate clone does not know (Gnosis 553)", "light 553"],
    ["a Proof of Humanity v2 deployment with another storage layout (Sepolia 42)", "poh-v2 42"],
  ])("gives no proof for %s", async (_, label) => {
    expect((await read(productCase(label))).ok).toBe(false);
  });

  it.each<[string, ProductCase, readonly bigint[] | null]>([
    ["Proof of Humanity v1: the requester funded alone wins ruling 1", editValues(POH_V1, "poh-v1", "getRoundInfo", { sideFunded: "1" }), [1n]],
    ["Proof of Humanity v1: the disputed request among the 16 newest is found", pohRequests(16), [2n]],
    ["Proof of Humanity v1: no proof past the 16 newest requests", pohRequests(17), null],
    ["Proof of Humanity v1: no proof without a submission", editValues(POH_V1, "poh-v1", "arbitratorDisputeIDToDisputeData", { submissionID: zeroAddress }), null],
    ["Proof of Humanity v1: no proof for a challenge the request never had", editValues(POH_V1, "poh-v1", "getRequestInfo", { lastChallengeID: "0" }), null],
    ["Proof of Humanity v1: no proof for a challenge count wider than 16 bits", editAnswerWord(POH_V1, "poh-v1", "getRequestInfo", 5, PAST_16_BITS), null],
    [
      "Proof of Humanity v1: no proof for an arbitrator data index wider than 16 bits",
      editArg(editAnswerWord(POH_V1, "poh-v1", "getRequestInfo", 6, PAST_16_BITS), "poh-v1", "arbitratorDataList", 0, String(PAST_16_BITS)),
      null,
    ],
    [
      "Proof of Humanity v1: no proof for a last round wider than 16 bits",
      editArg(editAnswerWord(POH_V1, "poh-v1", "getChallengeInfo", 0, PAST_16_BITS), "poh-v1", "getRoundInfo", 3, String(PAST_16_BITS)),
      null,
    ],
    ["Proof of Humanity v1: no proof when the request names another arbitrator", editValues(POH_V1, "poh-v1", "arbitratorDataList", { arbitrator: OTHER }), null],
    [
      "Proof of Humanity v1: no proof from the challenge deposit round",
      firstRound(editValues(POH_V1, "poh-v1", "getChallengeInfo", { lastRoundID: "0" }), "poh-v1", { sideFunded: "2" }),
      null,
    ],
    ["Proof of Humanity v1: no proof for a funded side that is not a party", editValues(POH_V1, "poh-v1", "getRoundInfo", { sideFunded: "3" }), null],
    ["Proof of Humanity v2: no proof without a humanity", editValues(POH_V2, "poh-v2", "disputeIdToData", { humanityId: zeroAddress }), null],
    ["Proof of Humanity v2: no proof when the request is past the humanity's requests", editWord(POH_V2, LENGTH, () => 0n), null],
    ["Proof of Humanity v2: no proof for a request status out of range", editWord(POH_V2, REQUEST, setBits(8n, 8n, 4n)), null],
    ["Proof of Humanity v2: no proof for a challenge the request never had", editWord(POH_V2, REQUEST, setBits(48n, 16n, 0n)), null],
    ["Proof of Humanity v2: no proof when the request names another arbitrator", editValues(POH_V2, "poh-v2", "arbitratorDataHistory", { arbitrator: OTHER }), null],
    ["Proof of Humanity v2: no proof when the challenge is another dispute's", editWord(POH_V2, CHALLENGE_DISPUTE, (word) => word + 1n), null],
    ["Proof of Humanity v2: no proof when the challenge word has more than its fields", editWord(POH_V2, CHALLENGE, setBits(248n, 8n, 1n)), null],
    ["Proof of Humanity v2: no proof for a stored ruling out of range", editWord(POH_V2, CHALLENGE, setBits(16n, 8n, 3n)), null],
    ["Proof of Humanity v2: no proof for a challenge without a challenger", editWord(POH_V2, CHALLENGE, setBits(24n, 160n, 0n)), null],
    ["Proof of Humanity v2: no proof from the challenge deposit round", editWord(POH_V2, CHALLENGE, setBits(0n, 16n, 0n)), null],
    ["Proof of Humanity v2: no proof for a funded side that is not a party", editWord(POH_V2, ROUND, () => 3n), null],
    ["Curate: a removal request (status 3) still proves its funding", editValues(LIGHT, "light", "getItemInfo", { status: "3" }), [2n]],
    ["Curate: an item ID whose top byte is zero still proves its funding", lightItem(`0x${"0".repeat(63)}1`), [2n]],
    ["Curate: nothing funded in the last round", editValues(LIGHT, "light", "getRoundInfo", { hasPaid: [false, false, false] }), []],
    ["Curate: no proof when Refuse to Arbitrate is marked paid", editValues(LIGHT, "light", "getRoundInfo", { hasPaid: [true, false, true] }), null],
    ["Curate: no proof when both sides are marked paid in the last round", editValues(LIGHT, "light", "getRoundInfo", { hasPaid: [false, true, true] }), null],
    ["Curate: no proof for an item without requests", editValues(LIGHT, "light", "getItemInfo", { numberOfRequests: "0" }), null],
    ["Curate: no proof for a token list status out of range", editValues(productCase("atl 38"), "atl", "getTokenInfo", { status: "4" }), null],
    ["Curate: no proof for a Generalized TCR status out of range", editValues(productCase("gtcr 344"), "gtcr", "getItemInfo", { status: "4" }), null],
    ["Curate: no proof for a Light Curate status out of range", editValues(LIGHT, "light", "getItemInfo", { status: "4" }), null],
    ["Curate: no proof when no request is this dispute", editValues(LIGHT, "light", "getRequestInfo", { disputeID: "940" }), null],
    ["Curate: no proof when the request names another arbitrator", editValues(LIGHT, "light", "getRequestInfo", { arbitrator: OTHER }), null],
    ["Curate: no proof when the request was never disputed", editValues(productCase("atl 38"), "atl", "getRequestInfo", { disputed: false }), null],
    [
      "Curate: no proof for a request without an appeal round",
      firstRound(editValues(LIGHT, "light", "getRequestInfo", { numberOfRounds: "1" }), "light", { hasPaid: [false, false, true] }),
      null,
    ],
    ["binary proxy: no proof when another arbitrator rules it", editValues(BINARY_PROXY, "bap", "arbitrator", { arbitrator: OTHER }), null],
    ["binary proxy: no proof for a local dispute ID wider than 64 bits", binaryProxyAt(PAST_64_BITS), null],
    ["binary proxy: no proof before the dispute is ruled", editValues(BINARY_PROXY, "bap", "disputes", { isRuled: false }), null],
    ["binary proxy: no proof for a stored ruling out of range", editValues(BINARY_PROXY, "bap", "disputes", { ruling: "3" }), null],
    ["binary proxy: no proof when the local dispute is another dispute", editValues(BINARY_PROXY, "bap", "disputes", { disputeIDOnArbitratorSide: "194" }), null],
    ["binary proxy: no proof from a funding status one byte short", editRaw(BINARY_PROXY, "bap", "crowdfundingStatus", (raw) => raw.slice(0, -2) as Hex), null],
    ["binary proxy: no proof from a funding status one word long", editRaw(BINARY_PROXY, "bap", "crowdfundingStatus", (raw) => `${raw}${"00".repeat(32)}`), null],
    ["binary proxy: no proof when Refuse to Arbitrate is marked paid", editValues(BINARY_PROXY, "bap", "crowdfundingStatus", { hasPaid: [true, true, false] }), null],
    ["binary proxy: no proof when both sides are marked paid", editValues(BINARY_PROXY, "bap", "crowdfundingStatus", { hasPaid: [false, true, true] }), null],
  ])("%s", async (_, kase, funded) => {
    const outcome = await read(kase);
    if (funded === null) expect(outcome.ok).toBe(false);
    else expect(outcome).toEqual({ ok: true, value: funded });
  });

  it("gives no proof when two kinds prove funding for the same dispute", async () => {
    const binaryProxy = addCalls(POH_V1, "bap", [
      { fn: "arbitrator", args: [], values: { arbitrator: POH_V1.arbitrator } },
      { fn: "externalIDtoLocalID", args: ["1495"], values: { localId: "0" } },
      { fn: "disputes", args: ["0"], values: { isRuled: true, ruling: "2", disputeIDOnArbitratorSide: "1495" } },
      { fn: "crowdfundingStatus", args: ["0", zeroAddress], values: { hasPaid: [false, false, true] } },
    ]);
    expect((await read(binaryProxy)).ok).toBe(false);
  });

  it("gives no proof on a transport failure, without the node's words", async () => {
    const { client, binding, family } = productRead(POH_V1, { failing: { eth_call: rpcError(-32000, "request to https://rpc.example/key-123 failed") } });
    const outcome = await readProductFunding(client, binding, family);
    expect(outcome.ok).toBe(false);
    expect(JSON.stringify(outcome)).not.toContain("key-123");
  });

  it("reads nothing for a family whose funding the Dispute Resolver reads, or for another arbitrable", async () => {
    const { client, requests, binding } = productRead(BINARY_PROXY);
    const resolver = await recordedDetection(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf");
    expect((await readProductFunding(client, binding, resolver)).ok).toBe(false);
    const legacy = await recordedDetection(1, "0x135c573503f70dc290b1d60fe2e7f7eb114febd6");
    expect((await readProductFunding(client, binding, { ...legacy, chainId: 100 })).ok).toBe(false);
    expect(requests.methods).toEqual([]);
  });
});

describe("readsProductFunding", () => {
  it.each<[string, number, string, boolean]>([
    ["a product the Dispute Resolver only views", 1, "0xebcf3bca271b26ae4b162ba560e243055af0e679", true],
    ["the legacy binary proxy, whose funding it does not support", 1, "0x135c573503f70dc290b1d60fe2e7f7eb114febd6", true],
    ["the ArbitrableProxy", 1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf", false],
    ["a governor", 1, "0x327a29fce0a6490e4236240be176daa282eccfdf", false],
    ["a registered Reality proxy", 100, "0xe04f5791d671d5c4e08ab49b39807087b591ea3e", false],
    ["an escrow", 1, "0xe2dd8cce2c33a04215074adb4b5820b765d8ed9d", false],
  ])("reads a product's own funding only where the Dispute Resolver reads none: %s", async (_, chainId, address, expected) => {
    expect(readsProductFunding(await recordedDetection(chainId, address))).toBe(expected);
  });
});
