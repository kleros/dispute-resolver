import * as fixtures from "./index";
import malformedDispute from "./ongoing/100.malformed.json";

const ENV_KEYS = ["REACT_APP_FIXTURE_VARIANT", "REACT_APP_FIXTURE_FAIL", "REACT_APP_FIXTURE_DELAY_MS"];
let originalEnvironment;

beforeEach(() => {
  originalEnvironment = ENV_KEYS.map(key => process.env[key]);
  ENV_KEYS.forEach(key => delete process.env[key]);
});

afterEach(() => {
  ENV_KEYS.forEach((key, index) => {
    if (originalEnvironment[index] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[index];
  });
});

it("keeps eight Gnosis disputes by default and an empty Mainnet fixture", async () => {
  expect(await fixtures.getOpenDisputesOnCourt("100")).toHaveLength(8);
  expect(await fixtures.getOpenDisputesOnCourt("1")).toEqual([]);
  expect(await fixtures.getMetaEvidence("100", malformedDispute.disputeId)).toBeNull();
});

it("adds the malformed case only to Gnosis when explicitly enabled, without mutating the default fixture", async () => {
  const defaultIDs = await fixtures.getOpenDisputesOnCourt("100");
  process.env.REACT_APP_FIXTURE_VARIANT = "malformed";
  expect(await fixtures.getOpenDisputesOnCourt("100")).toEqual([...defaultIDs, malformedDispute.disputeId]);
  expect(await fixtures.getArbitratorDispute("100", malformedDispute.disputeId)).toEqual(malformedDispute.arbitratorDispute);
  expect(await fixtures.getMetaEvidence("100", malformedDispute.disputeId)).toEqual(malformedDispute.metaEvidence);
  expect(await fixtures.getOpenDisputesOnCourt("1")).toEqual([]);
  delete process.env.REACT_APP_FIXTURE_VARIANT;
  expect(await fixtures.getOpenDisputesOnCourt("100")).toEqual(defaultIDs);
  expect(await fixtures.getArbitratorDispute("100", malformedDispute.disputeId)).toBeNull();
});

it("preserves forced failures when the malformed variant is enabled", async () => {
  process.env.REACT_APP_FIXTURE_VARIANT = "malformed";
  process.env.REACT_APP_FIXTURE_FAIL = "true";
  await expect(fixtures.getOpenDisputesOnCourt("100")).rejects.toThrow("Forced failure");
});
