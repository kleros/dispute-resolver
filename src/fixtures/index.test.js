import * as fixtures from "./index";
import ongoingGnosis from "./ongoing/100.json";
import ongoingMainnet from "./ongoing/1.json";
import casesGnosis from "./cases/100.json";
import casesMainnet from "./cases/1.json";
import handmadeGnosis from "./cases/100.handmade.json";
import malformedDispute from "./ongoing/100.malformed.json";
import courtsGnosis from "./courts/100.json";
import courtsMainnet from "./courts/1.json";

const ENV_KEYS = [
  "REACT_APP_USE_FIXTURES",
  "REACT_APP_FIXTURE_CHAIN_ID",
  "REACT_APP_FIXTURE_VARIANT",
  "REACT_APP_FIXTURE_FAIL",
  "REACT_APP_FIXTURE_FAIL_READS",
  "REACT_APP_FIXTURE_DELAY_MS",
  "REACT_APP_FIXTURE_SIGNED_IN",
  "REACT_APP_FIXTURE_WRITES",
];
let originalEnvironment;

beforeEach(() => {
  originalEnvironment = ENV_KEYS.map(key => process.env[key]);
  ENV_KEYS.forEach(key => delete process.env[key]);
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  ENV_KEYS.forEach((key, index) => {
    if (originalEnvironment[index] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[index];
  });
  jest.restoreAllMocks();
});

const GNOSIS_DISPUTES = ["1005", "1007", "1008", "1009", "1010", "1011", "1012", "1013"];
const HANDMADE_DISPUTES = ["900001", "900002", "900003"];
const CURATE_ARBITRABLE = "0xAe6aaed5434244be3699c56E7Ebc828194F26dc3";

describe("ongoing disputes", () => {
  it("keeps eight Gnosis disputes by default and an empty Mainnet fixture", async () => {
    expect(await fixtures.getOpenDisputesOnCourt("100")).toEqual(GNOSIS_DISPUTES);
    expect(await fixtures.getOpenDisputesOnCourt("1")).toEqual([]);
  });

  it("lists the malformed case only on Gnosis and only when explicitly enabled, without mutating the default fixture", async () => {
    process.env.REACT_APP_FIXTURE_VARIANT = "malformed";
    expect(await fixtures.getOpenDisputesOnCourt("100")).toEqual([...GNOSIS_DISPUTES, malformedDispute.disputeId]);
    expect(await fixtures.getOpenDisputesOnCourt("1")).toEqual([]);
    delete process.env.REACT_APP_FIXTURE_VARIANT;
    expect(await fixtures.getOpenDisputesOnCourt("100")).toEqual(GNOSIS_DISPUTES);
  });

  it("never lists the hand-made cases", async () => {
    process.env.REACT_APP_FIXTURE_VARIANT = "malformed";
    const listed = await fixtures.getOpenDisputesOnCourt("100");
    HANDMADE_DISPUTES.forEach(id => expect(listed).not.toContain(id));
  });

  it("preserves forced failures when the malformed variant is enabled", async () => {
    process.env.REACT_APP_FIXTURE_VARIANT = "malformed";
    process.env.REACT_APP_FIXTURE_FAIL = "true";
    await expect(fixtures.getOpenDisputesOnCourt("100")).rejects.toThrow("Forced failure");
  });
});

describe("one block for the Ongoing and case fixtures", () => {
  it("captured both Gnosis fixtures at block 48403425 and both Mainnet fixtures at block 26042422", () => {
    expect(ongoingGnosis.capturedAtBlock).toBe(48403425);
    expect(casesGnosis.capturedAtBlock).toBe(48403425);
    expect(ongoingMainnet.capturedAtBlock).toBe(26042422);
    expect(casesMainnet.capturedAtBlock).toBe(26042422);
  });

  it("has a case record for every open dispute of the Ongoing fixture", () => {
    expect(Object.keys(casesGnosis.disputes).sort()).toEqual([...ongoingGnosis.openDisputeIDs].sort());
    expect(Object.keys(casesMainnet.disputes)).toEqual(ongoingMainnet.openDisputeIDs);
  });

  it("uses the timestamp of the captured block as the fixed now of fixture mode", () => {
    process.env.REACT_APP_USE_FIXTURES = "true";
    process.env.REACT_APP_FIXTURE_CHAIN_ID = "100";
    expect(fixtures.getNow()).toBe(casesGnosis.capturedAtTimestamp * 1000);
    expect(fixtures.getNow()).toBe(fixtures.getNow());

    process.env.REACT_APP_FIXTURE_CHAIN_ID = "1";
    expect(fixtures.getNow()).toBe(casesMainnet.capturedAtTimestamp * 1000);
  });

  it("uses the real clock outside fixture mode", () => {
    const before = Date.now();
    const now = fixtures.getNow();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe("case reads restore the types production uses", () => {
  it("returns the dispute struct with BigInt numbers, a string address and a boolean ruled flag", async () => {
    const dispute = await fixtures.getArbitratorDispute("100", "1005");
    expect(dispute).toEqual({
      subcourtID: 14n,
      arbitrated: CURATE_ARBITRABLE,
      numberOfChoices: 2n,
      period: 3n,
      lastPeriodChange: 1789936805n,
      drawsInRound: 3n,
      commitsInRound: 0n,
      ruled: false,
    });
  });

  it("resolves null for a dispute that does not exist", async () => {
    expect(await fixtures.getArbitratorDispute("100", "123456789")).toBeNull();
    expect(await fixtures.getMetaEvidence("100", "123456789")).toBeNull();
    expect(await fixtures.getArbitrableDisputeID("100", CURATE_ARBITRABLE, "123456789")).toBeNull();
    expect(await fixtures.getArbitratorDisputeDetails("100", "123456789")).toBeNull();
    expect(await fixtures.getArbitratorDispute("1", "1005")).toBeNull();
  });

  it("returns BigInt contract values and untouched event data for a captured dispute", async () => {
    const record = casesGnosis.disputes["1005"];
    expect(await fixtures.getArbitrableDisputeID("100", CURATE_ARBITRABLE, "1005")).toBeNull();
    expect(await fixtures.getArbitratorDisputeDetails("100", "1005")).toEqual({
      votesLengths: [3n],
      tokensAtStakePerJuror: record.disputeDetails.tokensAtStakePerJuror.map(BigInt),
      totalFeesForJurors: record.disputeDetails.totalFeesForJurors.map(BigInt),
      votesInEachRound: record.disputeDetails.votesInEachRound.map(BigInt),
      repartitionsInEachRound: record.disputeDetails.repartitionsInEachRound.map(BigInt),
      penaltiesInEachRound: record.disputeDetails.penaltiesInEachRound.map(BigInt),
    });
    expect(await fixtures.getCurrentRuling("100", "1005")).toBe(2n);
    expect(await fixtures.getAppealCost("100", "1005")).toBe(231000000000000000000n);
    expect(await fixtures.getAppealPeriod("100", "1005")).toEqual({ start: 1789936805n, end: 1790228405n });
    expect(await fixtures.getMultipliers("100", CURATE_ARBITRABLE)).toEqual({
      winnerStakeMultiplier: 10000n,
      loserStakeMultiplier: 20000n,
      loserAppealPeriodMultiplier: 5000n,
      denominator: 10000n,
    });
    expect(await fixtures.getDisputeEvent("100", CURATE_ARBITRABLE, "1005")).toEqual(record.disputeEvent);
    expect(await fixtures.getEvidences("100", CURATE_ARBITRABLE, "1005")).toEqual(record.evidences);
    expect(await fixtures.getRuling("100", CURATE_ARBITRABLE, "1005")).toBeNull();
    expect(await fixtures.getAppealDecisions("100", "1005")).toEqual([]);
    expect(await fixtures.getMultipliers("100", "0x0000000000000000000000000000000000000000")).toBeNull();
  });

  it("reads contributions, funded rulings and the withdrawable amount per arbitrable and local dispute ID", async () => {
    const arbitrated = handmadeGnosis.disputes["900001"].arbitratorDispute.arbitrated;
    expect(await fixtures.getContributions("100", 41n, 0, arbitrated)).toEqual(handmadeGnosis.disputes["900001"].contributions);
    expect(await fixtures.getRulingFunded("100", 41n, 0, arbitrated)).toEqual(["1"]);
    expect(await fixtures.getContributions("100", 41n, 1, arbitrated)).toEqual({});
    expect(await fixtures.getRulingFunded("100", 41n, 1, arbitrated)).toEqual([]);
    expect(await fixtures.getContributions("100", null, 0, CURATE_ARBITRABLE)).toEqual({});
    expect(await fixtures.getRulingFunded("100", null, 0, CURATE_ARBITRABLE)).toEqual([]);
    expect(await fixtures.getTotalWithdrawableAmount("100", 41n, ["1", "3", "4"], arbitrated)).toEqual({ amount: 0n, ruling: null });
  });
});

describe("hand-made cases", () => {
  it("opens the multi-select, free-value and missing meta-evidence cases by ID", async () => {
    for (const id of HANDMADE_DISPUTES) {
      const { arbitratorDispute } = handmadeGnosis.disputes[id];
      expect(await fixtures.getArbitratorDispute("100", id)).toEqual({
        ...arbitratorDispute,
        subcourtID: BigInt(arbitratorDispute.subcourtID),
        numberOfChoices: BigInt(arbitratorDispute.numberOfChoices),
        period: BigInt(arbitratorDispute.period),
        lastPeriodChange: BigInt(arbitratorDispute.lastPeriodChange),
        drawsInRound: BigInt(arbitratorDispute.drawsInRound),
        commitsInRound: BigInt(arbitratorDispute.commitsInRound),
      });
    }
    expect((await fixtures.getMetaEvidence("100", "900001")).rulingOptions).toEqual(handmadeGnosis.disputes["900001"].metaEvidence.rulingOptions);
    expect((await fixtures.getMetaEvidence("100", "900002")).rulingOptions.type).toBe("uint");
    expect(await fixtures.getMetaEvidence("100", "900003")).toBeNull();
    expect(await fixtures.getArbitrableDisputeID("100", handmadeGnosis.disputes["900001"].arbitratorDispute.arbitrated, "900001")).toBe(41n);
  });

  it("opens the malformed case by ID without the malformed variant and passes its bad values through", async () => {
    expect(await fixtures.getArbitratorDispute("100", malformedDispute.disputeId)).toEqual({
      ...malformedDispute.arbitratorDispute,
      subcourtID: 0n,
      numberOfChoices: 0n,
      period: 0n,
      lastPeriodChange: 1758610000n,
      drawsInRound: 0n,
      commitsInRound: 0n,
    });
    expect(await fixtures.getMetaEvidence("100", malformedDispute.disputeId)).toEqual(malformedDispute.metaEvidence);
    expect(await fixtures.getArbitratorDisputeDetails("100", malformedDispute.disputeId)).toBeNull();
    expect(await fixtures.getAppealCost("100", malformedDispute.disputeId)).toBeNull();
    const disputeEvent = await fixtures.getDisputeEvent("100", malformedDispute.arbitratorDispute.arbitrated, malformedDispute.disputeId);
    expect(disputeEvent.createdAt).toBe("not a timestamp");
  });
});

describe("forced failures", () => {
  it("fails every read with REACT_APP_FIXTURE_FAIL", async () => {
    process.env.REACT_APP_FIXTURE_FAIL = "true";
    await expect(fixtures.getArbitratorDispute("100", "1005")).rejects.toThrow("Forced failure");
    await expect(fixtures.getSubcourtData("100")).rejects.toThrow("Forced failure");
    await expect(fixtures.getEvidences("100", CURATE_ARBITRABLE, "1005")).rejects.toThrow("Forced failure");
  });

  it("fails only the reads named in REACT_APP_FIXTURE_FAIL_READS", async () => {
    process.env.REACT_APP_FIXTURE_FAIL_READS = "evidences, multipliers";
    await expect(fixtures.getEvidences("100", CURATE_ARBITRABLE, "1005")).rejects.toThrow("evidences read");
    await expect(fixtures.getMultipliers("100", CURATE_ARBITRABLE)).rejects.toThrow("multipliers read");
    expect(await fixtures.getCurrentRuling("100", "1005")).toBe(2n);
    expect((await fixtures.getArbitratorDispute("100", "1005")).period).toBe(3n);
  });
});

describe("signed-in flag and write stubs", () => {
  it("is signed in only in fixture mode with the flag set", () => {
    expect(fixtures.isSignedIn()).toBe(false);
    process.env.REACT_APP_FIXTURE_SIGNED_IN = "true";
    expect(fixtures.isSignedIn()).toBe(false);
    process.env.REACT_APP_USE_FIXTURES = "true";
    expect(fixtures.isSignedIn()).toBe(true);
    expect(fixtures.getSignedInAddress()).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("reports success by default the way the App handlers do", async () => {
    const receipt = await fixtures.appeal("0xarbitrable", 41n, 4, "3.0");
    expect(receipt.status).toBe(1);
    expect(receipt.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect((await fixtures.withdraw("0xarbitrable", 41n, ["4"], "0xarbitrable")).status).toBe(1);
    expect((await fixtures.submitEvidence("0xarbitrable", { disputeID: 41n, evidenceTitle: "t" })).status).toBe(1);
    expect(await fixtures.publish("evidence.pdf", { size: 3 })).toBe("/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/evidence.pdf");
    await expect(fixtures.signIn()).resolves.toBeUndefined();
  });

  it("reports failure per action with REACT_APP_FIXTURE_WRITES=failure: appeal and withdrawal resolve null, the rest reject", async () => {
    process.env.REACT_APP_FIXTURE_WRITES = "failure";
    expect(await fixtures.appeal("0xarbitrable", 41n, 4, "3.0")).toBeNull();
    expect(await fixtures.withdraw("0xarbitrable", 41n, ["4"], "0xarbitrable")).toBeNull();
    await expect(fixtures.submitEvidence("0xarbitrable", { disputeID: 41n })).rejects.toThrow("Forced failure");
    await expect(fixtures.publish("evidence.pdf", { size: 3 })).rejects.toThrow("Forced failure");
    await expect(fixtures.signIn()).rejects.toThrow("Forced failure");
  });

  it("does not change the fixture after a successful write", async () => {
    const before = await fixtures.getContributions("100", 41n, 0, handmadeGnosis.disputes["900001"].arbitratorDispute.arbitrated);
    await fixtures.appeal(handmadeGnosis.disputes["900001"].arbitratorDispute.arbitrated, 41n, 4, "3.0");
    expect(await fixtures.getContributions("100", 41n, 0, handmadeGnosis.disputes["900001"].arbitratorDispute.arbitrated)).toEqual(before);
  });
});

describe("Create page reads and the dispute creation stub", () => {
  it("multiplies the court's juror fee by the number of votes and formats it in ether, like the App handler", async () => {
    expect(await fixtures.getArbitrationCost("100", "0", "3")).toBe("36.0");
    expect(await fixtures.getArbitrationCost("100", 1, 4)).toBe("28.8");
    expect(await fixtures.getArbitrationCost("1", "0", 3)).toBe("0.0162");
  });

  it("captured one fee per court of the Ongoing fixture, at the same block", () => {
    expect(courtsGnosis.feeForJuror).toHaveLength(ongoingGnosis.subcourtDetails.length);
    expect(courtsMainnet.feeForJuror).toHaveLength(ongoingMainnet.subcourtDetails.length);
    expect(courtsGnosis.capturedAtBlock).toBe(ongoingGnosis.capturedAtBlock);
    expect(courtsMainnet.capturedAtBlock).toBe(ongoingMainnet.capturedAtBlock);
  });

  it("fails the cost read when it is named in REACT_APP_FIXTURE_FAIL_READS or the court is unknown", async () => {
    process.env.REACT_APP_FIXTURE_FAIL_READS = "arbitrationCost";
    await expect(fixtures.getArbitrationCost("100", "0", 3)).rejects.toThrow("arbitrationCost");
    delete process.env.REACT_APP_FIXTURE_FAIL_READS;
    await expect(fixtures.getArbitrationCost("100", "99", 3)).rejects.toThrow("No court 99");
  });

  it("reports the newest open dispute of the fixture chain as created, or null with REACT_APP_FIXTURE_WRITES=failure", async () => {
    process.env.REACT_APP_FIXTURE_CHAIN_ID = "100";
    const options = { title: "Late delivery of the website" };
    await expect(fixtures.createDispute(options)).resolves.toEqual({ receipt: { status: 1, hash: expect.stringMatching(/^0x/), blockNumber: null }, disputeID: "1013" });
    process.env.REACT_APP_FIXTURE_CHAIN_ID = "1";
    await expect(fixtures.createDispute(options)).resolves.toMatchObject({ disputeID: "1" });
    process.env.REACT_APP_FIXTURE_WRITES = "failure";
    await expect(fixtures.createDispute(options)).resolves.toBeNull();
  });
});
