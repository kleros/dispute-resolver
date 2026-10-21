import { describe, expect, it } from "vitest";
import { z } from "../zod";
import { ARTIFACTS, findBySignature, normalizeAbi } from "../abi/__fixtures__/artifacts";
import verifiedSessions from "./__fixtures__/governor-sessions-abi.json";
import { governorSessionAbi } from "./governor";

const SIGNATURE = "sessions(uint256)";

const VERIFIED_GOVERNORS = z
  .object({ governors: z.array(z.object({ label: z.string(), chainId: z.number(), address: z.string(), abi: z.array(z.unknown()) })) })
  .parse(verifiedSessions).governors;

describe("governor session getter", () => {
  it("F1 D-47: the sessions(uint256) fragment is the published getter and the verified getter of every deployed governor", () => {
    const embedded = findBySignature(normalizeAbi(governorSessionAbi), SIGNATURE, "function");
    expect(embedded).toEqual(findBySignature(ARTIFACTS.klerosGovernor, SIGNATURE, "function"));
    expect(VERIFIED_GOVERNORS.map((governor) => `${String(governor.chainId)}:${governor.address}`)).toEqual([
      "1:0x327a29fce0a6490e4236240be176daa282eccfdf",
      "1:0x7510c77163683448b8dc8fe9e019d9482be1ed2b",
      "100:0xf7de5537ecd69a94695fcf4bcdbdee6329b63322",
      "1:0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4",
    ]);
    for (const governor of VERIFIED_GOVERNORS) expect(embedded).toEqual(findBySignature(normalizeAbi(governor.abi), SIGNATURE, "function"));
  });
});
