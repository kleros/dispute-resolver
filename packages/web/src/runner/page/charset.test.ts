import { describe, expect, it } from "vitest";
import type { RunnerReplyMessage } from "../types";
import { createFakeRunnerEnvironment, runRequest } from "../../test/runner";
import { bootstrapRunner } from "./bootstrap";
import { evaluateInGlobalScope, runScriptInGlobalScope } from "./evaluate";

const ANSWERED_TOO_SOON = "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";

// Shaped like the Reality renderer QmQGMR…: a webpack `var` export that splits the question on a literal "␟" delimiter.
// Under the old windows-1252 fallback the literal no longer matched and the renderer returned {} (ADR 0004).
const RENDERER = `
var getMetaEvidence = function () {
  var question = 'Who will win the 2024 US presidential election?␟"Harris","Trump"␟politics␟en_US';
  var outcomes = JSON.parse("[" + question.split("␟")[1] + "]");
  resolveScript({ rulingOptions: { type: "single-select", titles: outcomes, reserved: { "${ANSWERED_TOO_SOON}": "Answered Too Soon" } } });
};`;

// Keep this file to a single test: bootstrapRunner defines non-configurable globals on the real globalThis here, so a
// second run in the same file would fail with "Cannot redefine property".
describe("runner page charset (C7)", () => {
  it("C7: a script with a non-ASCII literal round-trips through the runner and its port", async () => {
    const fake = createFakeRunnerEnvironment();
    const channel = new MessageChannel();
    const reply = new Promise<RunnerReplyMessage>((resolve) => {
      channel.port1.onmessage = (event: MessageEvent<RunnerReplyMessage>) => {
        resolve(event.data);
      };
    });

    bootstrapRunner({ ...fake.env, globals: globalThis, evaluate: evaluateInGlobalScope, runScript: runScriptInGlobalScope });
    fake.deliver({ ...fake.fromParent(runRequest({ scriptText: RENDERER })), ports: [channel.port2] });

    await expect(reply).resolves.toEqual({
      type: "dr-runner/result",
      value: { rulingOptions: { type: "single-select", titles: ["Harris", "Trump"], reserved: { [ANSWERED_TOO_SOON]: "Answered Too Soon" } } },
      jsonDuplicateKeys: false,
    });
    channel.port1.close();
  });
});
