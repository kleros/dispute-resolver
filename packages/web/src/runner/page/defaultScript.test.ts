import { describe, expect, it } from "vitest";
import type { RunnerReplyMessage } from "../types";
import { createFakeRunnerEnvironment, runRequest } from "../../test/runner";
import { bootstrapRunner } from "./bootstrap";
import { evaluateInGlobalScope, runScriptInGlobalScope } from "./evaluate";

// The full text of the default script /ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj (golden cases mainnet 1454,
// 505, 912 and Gnosis 431, 0). Its entry point is a `const`, which only the same evaluation can see.
const DEFAULT_SCRIPT = `const getMetaEvidence = () => {
  resolveScript({
    arbitrableInterfaceURI: \`https://resolve.kleros.io/interact/\${scriptParameters.disputeID}\`,
  });
};
`;

// Keep this file to a single test: bootstrapRunner defines non-configurable globals on the real globalThis here, so a
// second run in the same file would fail with "Cannot redefine property".
describe("runner page with the default script (spec §9.5)", () => {
  it("§7.2: the default script, whose getMetaEvidence is a const, resolves through the port", async () => {
    const fake = createFakeRunnerEnvironment();
    const channel = new MessageChannel();
    const reply = new Promise<RunnerReplyMessage>((resolve) => {
      channel.port1.onmessage = (event: MessageEvent<RunnerReplyMessage>) => {
        resolve(event.data);
      };
    });

    bootstrapRunner({ ...fake.env, globals: globalThis, evaluate: evaluateInGlobalScope, runScript: runScriptInGlobalScope });
    fake.deliver({ ...fake.fromParent(runRequest({ scriptText: DEFAULT_SCRIPT })), ports: [channel.port2] });

    await expect(reply).resolves.toEqual({
      type: "dr-runner/result",
      value: { arbitrableInterfaceURI: "https://resolve.kleros.io/interact/1650" },
      jsonDuplicateKeys: false,
    });
    channel.port1.close();
  });
});
