import { describe, expect, it } from "vitest";
import type { ScriptReference } from "../enumerate/enumerate";
import type { GateOptions } from "./report";
import { rpcEnvironment, selectReferences } from "./select";

function reference(chainId: number, disputeId: number, cid: string): ScriptReference {
  return { chainId, disputeId, arbitrable: "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf", cid, scriptUri: `/ipfs/${cid}`, metaEvidenceUri: "/ipfs/QmX", metaEvidenceSource: "meta-evidence-api", chainIdFields: {} };
}

const ALL: Pick<GateOptions, "chains" | "disputes" | "cids" | "maxPerCid"> = { chains: [1, 100, 11155111, 10200], disputes: null, cids: null, maxPerCid: null };

const REFERENCES = [reference(1, 10, "QmA"), reference(1, 30, "QmA"), reference(1, 20, "QmA"), reference(100, 5, "QmA"), reference(1, 7, "QmB/bundle.js")];

describe("gate selection", () => {
  it("C6: a full run covers every referencing dispute", () => {
    expect(selectReferences(REFERENCES, ALL)).toHaveLength(5);
  });

  it("keeps the newest disputes of each script per chain when the run is capped", () => {
    expect(selectReferences(REFERENCES, { ...ALL, maxPerCid: 2 }).map((item) => `${String(item.chainId)}:${String(item.disputeId)}`)).toEqual(["1:30", "1:20", "100:5", "1:7"]);
  });

  it("selects scripts by CID, a directory CID selecting its files", () => {
    expect(selectReferences(REFERENCES, { ...ALL, cids: ["QmB"] }).map((item) => item.cid)).toEqual(["QmB/bundle.js"]);
  });

  it("keeps the run's chains only", () => {
    expect(selectReferences(REFERENCES, { ...ALL, chains: [100] }).map((item) => item.disputeId)).toEqual([5]);
  });

  it("selects the named disputes only, by chain and ID", () => {
    const disputes = [
      { chainId: 1, disputeId: 20 },
      { chainId: 100, disputeId: 5 },
      { chainId: 100, disputeId: 20 },
    ];
    expect(selectReferences(REFERENCES, { ...ALL, disputes }).map((item) => `${String(item.chainId)}:${String(item.disputeId)}`)).toEqual(["1:20", "100:5"]);
  });

  it("D-35: passes the new runner only the read and public RPC variables", () => {
    const env = { REACT_APP_WEB3_PROVIDER_URL: "https://a.test", REACT_APP_PUBLIC_RPC_100: "https://b.test", REACT_APP_ATLAS_URI: "https://atlas.test", HOME: "/home" };
    expect(rpcEnvironment(env)).toEqual({ REACT_APP_WEB3_PROVIDER_URL: "https://a.test", REACT_APP_PUBLIC_RPC_100: "https://b.test" });
  });
});
