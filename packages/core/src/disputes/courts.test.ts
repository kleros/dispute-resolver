import { toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { klerosLiquidAbi, policyRegistryAbi } from "../abi";
import type { Env } from "../types";
import { listCourts } from ".";
import { answer, fakeClient, fakeFetcher, failure, GNOSIS, MAINNET, recordedNode, recordedPolicyBodies, selectorOf } from "../test/disputes/testHelpers";

const ENV: Env = {};
const GET_SUBCOURT = toFunctionSelector("getSubcourt(uint96)").slice(2);
const POLICIES = toFunctionSelector("policies(uint256)").slice(2);

describe("listCourts", () => {
  it("enumerates mainnet's courts until getSubcourt reverts (-32003 InvalidFEOpcode at court 25), with policy names", async () => {
    const { client } = fakeClient(recordedNode(MAINNET));
    const { fetcher } = fakeFetcher(recordedPolicyBodies(MAINNET));
    const courts = await listCourts({ chainId: 1, client, fetcher, env: ENV });
    if (!courts.ok) throw new Error(courts.error.message);
    expect(courts.value).toHaveLength(25);
    expect(courts.value.map((court) => court.id)).toEqual(Array.from({ length: 25 }, (_, index) => BigInt(index)));
    expect(courts.value[0]).toMatchObject({ id: 0n, parent: 0n, name: "General Court", policyUri: "/ipfs/Qmd1TMEbtic3TSonu5dfqa5k3aSrjxRGY8oJH3ruGgazRB" });
    expect(courts.value[23]?.name).toBe("Humanity Court");
    expect(courts.value[22]?.name).toBe("Corte General en Español");
  });

  it("enumerates Gnosis's courts until getSubcourt reverts (code 3 at court 20), court 19 with hidden votes", async () => {
    const { client } = fakeClient(recordedNode(GNOSIS));
    const { fetcher } = fakeFetcher(recordedPolicyBodies(GNOSIS));
    const courts = await listCourts({ chainId: 100, client, fetcher, env: ENV });
    if (!courts.ok) throw new Error(courts.error.message);
    expect(courts.value).toHaveLength(20);
    expect(courts.value[19]).toEqual({
      id: 19n,
      parent: 0n,
      hiddenVotes: true,
      timesPerPeriod: [140400n, 291600n, 145800n, 194400n],
      policyUri: "/ipfs/QmbhNThPBeZU6HxW53xDD6kHy4VabuwNmLCCH6Yc9jJbfd",
      name: "xDai Curation (Hidden Voting)",
    });
    expect(courts.value[18]?.hiddenVotes).toBe(false);
    expect(courts.value[0]?.name).toBe("xDai General Court");
  });

  it("fetches policies through the configured gateway, keeping the path segments", async () => {
    const { client } = fakeClient(recordedNode(GNOSIS));
    const gateway = "https://gateway.example";
    const bodies = Object.fromEntries(Object.entries(GNOSIS.policies).map(([uri, body]) => [`${gateway}${uri}`, body]));
    const { fetcher, urls } = fakeFetcher(bodies);
    const courts = await listCourts({ chainId: 100, client, fetcher, env: { REACT_APP_IPFS_GATEWAY: gateway } });
    expect(courts.ok && courts.value[0]?.name).toBe("xDai General Court");
    expect(urls).toContain(`${gateway}/ipfs/QmTsPLwhozEqjWnYKsnamZiJW47LFT7LzkQhKw5ygQxqyH/xDai-General-Court-Policy.json`);
  });

  it("one failing policy fetch leaves that court's name null and the others named", async () => {
    const { client } = fakeClient(recordedNode(MAINNET));
    const unpinned = `${MAINNET.gateway}/ipfs/QmdJYHubLGQCt2GxpJch2riSYVxZzDC4cBg2mNPXuiY6rX`;
    const bodies: Record<string, string | Error> = Object.fromEntries(Object.entries(recordedPolicyBodies(MAINNET)).filter(([url]) => url !== unpinned));
    bodies[`${MAINNET.gateway}/ipfs/QmYMdCkb7WULmiK6aQrgsayGG3VYisQwsHSLC3TLkzEHCm`] = new Error("network down");
    const { fetcher } = fakeFetcher(bodies);
    const courts = await listCourts({ chainId: 1, client, fetcher, env: ENV });
    if (!courts.ok) throw new Error(courts.error.message);
    expect(courts.value).toHaveLength(25);
    expect(courts.value[1]).toMatchObject({ id: 1n, name: null, policyUri: "/ipfs/QmYMdCkb7WULmiK6aQrgsayGG3VYisQwsHSLC3TLkzEHCm" });
    expect(courts.value[2]).toMatchObject({ id: 2n, name: null });
    expect(courts.value[3]?.name).toBe("Token Listing");
  });

  it("a policy that is not JSON or has no string name leaves the name null", async () => {
    const { client } = fakeClient(recordedNode(MAINNET));
    const bodies: Record<string, string> = recordedPolicyBodies(MAINNET);
    bodies[`${MAINNET.gateway}/ipfs/Qmd1TMEbtic3TSonu5dfqa5k3aSrjxRGY8oJH3ruGgazRB`] = "%PDF-1.4";
    bodies[`${MAINNET.gateway}/ipfs/QmYMdCkb7WULmiK6aQrgsayGG3VYisQwsHSLC3TLkzEHCm`] = JSON.stringify({ name: { toString: "x" } });
    bodies[`${MAINNET.gateway}/ipfs/QmdJYHubLGQCt2GxpJch2riSYVxZzDC4cBg2mNPXuiY6rX`] = JSON.stringify(["name"]);
    const { fetcher } = fakeFetcher(bodies);
    const courts = await listCourts({ chainId: 1, client, fetcher, env: ENV });
    if (!courts.ok) throw new Error(courts.error.message);
    expect(courts.value.slice(0, 3).map((court) => court.name)).toEqual([null, null, null]);
  });

  it("never fetches a policy URI that is neither https nor content-addressed", async () => {
    const arbitrator = MAINNET.arbitrator;
    const node = recordedNode(MAINNET, {
      extraCalls: [
        answer({ to: MAINNET.policyRegistry, abi: policyRegistryAbi, functionName: "policies", args: [0n], result: "http://evil.example/policy.json" }),
        answer({ to: MAINNET.policyRegistry, abi: policyRegistryAbi, functionName: "policies", args: [1n], result: "" }),
        failure({ to: arbitrator, abi: klerosLiquidAbi, functionName: "getSubcourt", args: [2n], error: { code: 3, message: "execution reverted" } }),
      ],
    });
    const { client } = fakeClient(node);
    const { fetcher, urls } = fakeFetcher({});
    const courts = await listCourts({ chainId: 1, client, fetcher, env: ENV });
    if (!courts.ok) throw new Error(courts.error.message);
    expect(courts.value.map((court) => [court.policyUri, court.name])).toEqual([
      ["http://evil.example/policy.json", null],
      [null, null],
    ]);
    expect(urls).toEqual([]);
  });

  it("a failing policies(i) read degrades that court's name only", async () => {
    const node = recordedNode(MAINNET, {
      extraCalls: [failure({ to: MAINNET.policyRegistry, abi: policyRegistryAbi, functionName: "policies", args: [4n], error: { code: -32000, message: "header not found" } })],
    });
    const { client } = fakeClient(node);
    const { fetcher } = fakeFetcher(recordedPolicyBodies(MAINNET));
    const courts = await listCourts({ chainId: 1, client, fetcher, env: ENV });
    if (!courts.ok) throw new Error(courts.error.message);
    expect(courts.value[4]).toMatchObject({ id: 4n, policyUri: null, name: null });
    expect(courts.value[5]?.name).toBe("Marketing Services");
  });

  it("a transport failure of a getSubcourt read fails the list rather than truncating it", async () => {
    const node = recordedNode(MAINNET, {
      extraCalls: [failure({ to: MAINNET.arbitrator, abi: klerosLiquidAbi, functionName: "getSubcourt", args: [12n], error: { code: -32000, message: "header not found" } })],
    });
    const { client } = fakeClient(node);
    const { fetcher } = fakeFetcher(recordedPolicyBodies(MAINNET));
    expect(await listCourts({ chainId: 1, client, fetcher, env: ENV })).toMatchObject({ ok: false, error: { code: "rpc-error" } });
  });

  it("a transport failure of courts(i) fails the list", async () => {
    const node = recordedNode(MAINNET, {
      extraCalls: [failure({ to: MAINNET.arbitrator, abi: klerosLiquidAbi, functionName: "courts", args: [3n], error: { code: -32603, message: "Internal error" } })],
    });
    const { client } = fakeClient(node);
    const { fetcher } = fakeFetcher(recordedPolicyBodies(MAINNET));
    expect(await listCourts({ chainId: 1, client, fetcher, env: ENV })).toMatchObject({ ok: false });
  });

  it("a chain without an arbitrator has no courts to list", async () => {
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    const { fetcher } = fakeFetcher({});
    expect(await listCourts({ chainId: 137, client, fetcher, env: ENV })).toMatchObject({ ok: false, error: { code: "unsupported" } });
    expect(requests.methods).toEqual([]);
  });

  it("without a read RPC the list is unavailable with no-rpc", async () => {
    const { fetcher } = fakeFetcher({});
    const courts = await listCourts({ chainId: 1, client: undefined, fetcher, env: ENV });
    expect(courts).toMatchObject({ ok: false, error: { code: "no-rpc", message: "This network's data is unavailable." } });
    if (!courts.ok) expect(courts.error.message).not.toMatch(/configur|RPC|REACT_APP/i);
  });

  it("reads each getSubcourt(i) and policies(i) once", async () => {
    const { client, requests } = fakeClient(recordedNode(GNOSIS));
    const { fetcher } = fakeFetcher(recordedPolicyBodies(GNOSIS));
    await listCourts({ chainId: 100, client, fetcher, env: ENV });
    const subcourtReads = requests.calls.filter((key) => selectorOf(key) === GET_SUBCOURT);
    expect(new Set(subcourtReads).size).toBe(subcourtReads.length);
    expect(requests.calls.filter((key) => selectorOf(key) === POLICIES)).toHaveLength(20);
  });

  it("passes the caller's abort signal to the policy fetch", async () => {
    const { client } = fakeClient(recordedNode(GNOSIS));
    const { fetcher, inits } = fakeFetcher(recordedPolicyBodies(GNOSIS));
    const controller = new AbortController();
    await listCourts({ chainId: 100, client, fetcher, env: ENV, signal: controller.signal });
    expect(inits.every((init) => init?.signal === controller.signal)).toBe(true);
  });

  it("an aborted enumeration fails before reading any court instead of returning a partial list", async () => {
    const { client, requests } = fakeClient(recordedNode(GNOSIS));
    const controller = new AbortController();
    controller.abort();
    const { fetcher } = fakeFetcher(recordedPolicyBodies(GNOSIS));
    expect(await listCourts({ chainId: 100, client, fetcher, env: ENV, signal: controller.signal })).toMatchObject({ ok: false, error: { code: "rpc-error" } });
    expect(requests.methods).toEqual([]);
  });
});
