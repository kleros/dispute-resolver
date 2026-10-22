import { describe, expect, it } from "vitest";
import { ACCEPTED, collectUntilSettled, createFakeRunnerEnvironment, runRequest } from "../../test/runner";
import { bootstrapRunner } from "./bootstrap";
import { evaluateInGlobalScope, runScriptInGlobalScope } from "./evaluate";

const ANSWERED_TOO_SOON = "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";

// Shaped like the Reality renderer QmQGMR…: a webpack `var` export that splits the question on a literal "␟" delimiter.
// Decoded as windows-1252 instead of UTF-8, the literal no longer matches and the renderer returns {}.
const RENDERER = `
var getMetaEvidence = function () {
  var question = 'Who will win the 2024 US presidential election?␟"Harris","Trump"␟politics␟en_US';
  var outcomes = JSON.parse("[" + question.split("␟")[1] + "]");
  resolveScript({ rulingOptions: { type: "single-select", titles: outcomes, reserved: { "${ANSWERED_TOO_SOON}": "Answered Too Soon" } } });
};`;

// Keep this file to a single test: bootstrapRunner defines non-configurable globals on the real globalThis here, so a
// second run in the same file would fail with "Cannot redefine property".
describe("runner page charset", () => {
  it("a script with a non-ASCII literal round-trips through the runner and its port", async () => {
    const fake = createFakeRunnerEnvironment();
    const channel = new MessageChannel();
    const replies = collectUntilSettled(channel.port1);

    bootstrapRunner({ ...fake.env, globals: globalThis, evaluate: evaluateInGlobalScope, runScript: runScriptInGlobalScope });
    fake.deliver({ ...fake.fromParent(runRequest({ scriptText: RENDERER })), ports: [channel.port2] });

    await expect(replies).resolves.toEqual([
      ACCEPTED,
      {
        type: "dr-runner/result",
        value: { rulingOptions: { type: "single-select", titles: ["Harris", "Trump"], reserved: { [ANSWERED_TOO_SOON]: "Answered Too Soon" } } },
        jsonDuplicateKeys: false,
      },
    ]);
    channel.port1.close();
  });
});
