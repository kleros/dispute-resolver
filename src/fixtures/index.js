//Fixture mode renders the Ongoing Disputes page, the case page and the Create page from the JSON files in ./ongoing, ./cases
//and ./courts instead of the network. It is off unless REACT_APP_USE_FIXTURES=true. See README.md for the other variables.
import { ethers } from "ethers";

const DEFAULT_FIXTURE_CHAIN_ID = "1";

//Both fixtures of a chain were captured at the same block. Its timestamp (seconds) is the fixed "now" of fixture mode,
//so periods and countdowns are the same on every load. index.test.js checks these against capturedAtTimestamp in the JSON files.
const CAPTURED_AT_TIMESTAMP = {
  1: 1790193647,
  100: 1790193640,
};

//The account shown as connected and signed in when REACT_APP_FIXTURE_SIGNED_IN=true. No wallet is involved.
const SIGNED_IN_ADDRESS = "0x1111111111111111111111111111111111111111";
const WRITE_TRANSACTION_HASH = `0x${"f1c7".padEnd(62, "0")}f1`;
const PUBLISHED_CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

//Loaded on demand so the fixtures are not part of the bundle when fixture mode is off.
const ongoingLoaders = {
  1: () => import("./ongoing/1.json"),
  100: () => import("./ongoing/100.json"),
};
const caseLoaders = {
  1: () => import("./cases/1.json"),
  100: () => import("./cases/100.json"),
};
const handmadeCaseLoaders = {
  100: () => import("./cases/100.handmade.json"),
};
const courtLoaders = {
  1: () => import("./courts/1.json"),
  100: () => import("./courts/100.json"),
};
const loadMalformedDispute = () => import("./ongoing/100.malformed.json");

export const isFixtureMode = () => process.env.REACT_APP_USE_FIXTURES === "true";

export const getFixtureChainId = () => process.env.REACT_APP_FIXTURE_CHAIN_ID || DEFAULT_FIXTURE_CHAIN_ID;

export const isSignedIn = () => isFixtureMode() && process.env.REACT_APP_FIXTURE_SIGNED_IN === "true";

export const getSignedInAddress = () => SIGNED_IN_ADDRESS;

//Milliseconds, like Date.now(). Outside fixture mode this is the real clock.
export const getNow = () => {
  if (!isFixtureMode()) return Date.now();
  return (CAPTURED_AT_TIMESTAMP[getFixtureChainId()] ?? CAPTURED_AT_TIMESTAMP[DEFAULT_FIXTURE_CHAIN_ID]) * 1000;
};

const isForcedFailure = () => process.env.REACT_APP_FIXTURE_FAIL === "true";

//REACT_APP_FIXTURE_FAIL_READS lists the reads that should fail, by the names used below, e.g. "evidences,multipliers".
const failedReads = () =>
  (process.env.REACT_APP_FIXTURE_FAIL_READS || "")
    .split(",")
    .map(name => name.trim())
    .filter(Boolean);

//Waits REACT_APP_FIXTURE_DELAY_MS before every fixture read so the loading state stays visible.
const delay = () => {
  const ms = Number(process.env.REACT_APP_FIXTURE_DELAY_MS);
  return new Promise(resolve => setTimeout(resolve, ms > 0 ? ms : 0));
};

//Every read goes through here so the delay and the forced failures apply uniformly.
const read = async (name, load) => {
  await delay();
  if (isForcedFailure()) throw new Error(`Forced failure: REACT_APP_FIXTURE_FAIL is set (${name} read).`);
  if (failedReads().includes(name)) throw new Error(`Forced failure: REACT_APP_FIXTURE_FAIL_READS includes the ${name} read.`);
  return load();
};

const loadFromMap = async (loaders, chainId, what) => {
  const load = loaders[chainId];
  if (!load) throw new Error(`No ${what} fixture for chain ${chainId}. Available chains: ${Object.keys(loaders).join(", ")}.`);
  return (await load()).default;
};

const loadOngoingFixture = async chainId => {
  const fixture = await loadFromMap(ongoingLoaders, chainId, "ongoing disputes");
  //Opt in with REACT_APP_FIXTURE_VARIANT=malformed; the default eight disputes stay unchanged.
  if (String(chainId) !== "100" || process.env.REACT_APP_FIXTURE_VARIANT !== "malformed") return fixture;

  const { default: malformed } = await loadMalformedDispute();
  return {
    ...fixture,
    openDisputeIDs: [...fixture.openDisputeIDs, malformed.disputeId],
    arbitratorDisputes: { ...fixture.arbitratorDisputes, [malformed.disputeId]: malformed.arbitratorDispute },
    metaEvidence: { ...fixture.metaEvidence, [malformed.disputeId]: malformed.metaEvidence },
  };
};

//Hand-made cases are never listed on the Ongoing page but can always be opened by ID on the case page.
const loadHandmadeCases = async chainId => {
  const load = handmadeCaseLoaders[chainId];
  return load ? (await load()).default.disputes : {};
};

//The KlerosLiquid dispute struct and the meta-evidence of a dispute, wherever the fixture keeps them, or null when unknown.
const findDispute = async (chainId, disputeId) => {
  const id = String(disputeId);
  const ongoing = await loadOngoingFixture(chainId);
  if (id in ongoing.arbitratorDisputes) return { arbitratorDispute: ongoing.arbitratorDisputes[id], metaEvidence: ongoing.metaEvidence[id] ?? null };

  if (String(chainId) === "100") {
    const { default: malformed } = await loadMalformedDispute();
    if (id === malformed.disputeId) return { arbitratorDispute: malformed.arbitratorDispute, metaEvidence: malformed.metaEvidence };
  }

  const handmade = await loadHandmadeCases(chainId);
  if (id in handmade) return { arbitratorDispute: handmade[id].arbitratorDispute ?? null, metaEvidence: handmade[id].metaEvidence ?? null };
  return null;
};

//The case page reads of a dispute, keyed by the arbitrator dispute ID, or null when the fixture has none.
const findCaseRecord = async (chainId, disputeId) => {
  const id = String(disputeId);
  const captured = await loadFromMap(caseLoaders, chainId, "cases");
  if (id in captured.disputes) return captured.disputes[id];
  const handmade = await loadHandmadeCases(chainId);
  return handmade[id] ?? null;
};

//Contributions and ruling funded events are read per arbitrable and local dispute ID, as in App.getContributions.
const findCaseRecordByArbitrable = async (chainId, arbitrated, arbitrableDisputeID) => {
  if (arbitrableDisputeID == null) return null;
  const captured = await loadFromMap(caseLoaders, chainId, "cases");
  const handmade = await loadHandmadeCases(chainId);
  const ongoing = await loadOngoingFixture(chainId);
  const arbitratedOf = (id, record) => record.arbitratorDispute?.arbitrated ?? ongoing.arbitratorDisputes[id]?.arbitrated;
  return (
    Object.entries({ ...captured.disputes, ...handmade }).find(
      ([id, record]) => record.arbitrableDisputeID === String(arbitrableDisputeID) && arbitratedOf(id, record) === arbitrated
    )?.[1] ?? null
  );
};

//Contract values are stored as decimal strings and restored to the BigInt values ethers returns in production.
//Anything that is not a whole number is passed through unchanged, so malformed fixtures can carry deliberately bad data.
const toBigInt = value => {
  if (value == null || typeof value === "bigint") return value ?? null;
  if (typeof value !== "string" && typeof value !== "number") return value;
  try {
    return BigInt(value);
  } catch {
    return value;
  }
};
const toBigIntArray = values => (Array.isArray(values) ? values.map(toBigInt) : values ?? null);
const typedFields = (object, fields) => {
  if (!object || typeof object !== "object") return object ?? null;
  const typed = { ...object };
  fields.forEach(field => {
    if (field in typed) typed[field] = toBigInt(typed[field]);
  });
  return typed;
};
const typedArrayFields = (object, fields) => {
  if (!object || typeof object !== "object") return object ?? null;
  const typed = { ...object };
  fields.forEach(field => {
    if (field in typed) typed[field] = toBigIntArray(typed[field]);
  });
  return typed;
};

//Same shape as KlerosLiquid.disputes(): numbers are BigInt, the address a string and ruled a boolean.
const typedArbitratorDispute = dispute => typedFields(dispute, ["subcourtID", "numberOfChoices", "period", "lastPeriodChange", "drawsInRound", "commitsInRound"]);

//Same shape as App.getOpenDisputesOnCourt: the open dispute IDs, unsorted.
export const getOpenDisputesOnCourt = chainId => read("openDisputes", async () => [...(await loadOngoingFixture(chainId)).openDisputeIDs]);

//Same shape as App.getArbitratorDispute: the KlerosLiquid dispute struct, or null when the dispute does not exist.
export const getArbitratorDispute = (chainId, disputeId) =>
  read("arbitratorDispute", async () => typedArbitratorDispute((await findDispute(chainId, disputeId))?.arbitratorDispute ?? null));

//Same shape as App.getMetaEvidenceParallelizeable: the meta-evidence JSON, or null when missing.
export const getMetaEvidence = (chainId, disputeId) => read("metaEvidence", async () => (await findDispute(chainId, disputeId))?.metaEvidence ?? null);

//Same shape as the subcourt state App.loadSubcourtData produces from its localStorage cache: decimal strings.
export const getSubcourtData = chainId =>
  read("subcourts", async () => {
    const fixture = await loadOngoingFixture(chainId);
    return { subcourts: fixture.subcourts, subcourtDetails: fixture.subcourtDetails };
  });

//Same shape as App.getArbitrationCostWithCourtAndNoOfJurors: the cost in ether as a string. KlerosLiquid charges the court's
//feeForJuror for every vote, so the fixture keeps the fee of each court and multiplies it here.
export const getArbitrationCost = (chainId, subcourtID, noOfJurors) =>
  read("arbitrationCost", async () => {
    const { feeForJuror } = await loadFromMap(courtLoaders, chainId, "courts");
    const fee = feeForJuror[Number.parseInt(subcourtID, 10)];
    if (fee === undefined) throw new Error(`No court ${subcourtID} in the courts fixture of chain ${chainId}.`);
    return ethers.formatEther(BigInt(fee) * BigInt(Number.parseInt(noOfJurors, 10)));
  });

//Same shape as App.getArbitrableDisputeID: the local dispute ID as BigInt, or null when the arbitrable does not implement IDisputeResolver.
export const getArbitrableDisputeID = (chainId, arbitrated, disputeId) =>
  read("arbitrableDisputeID", async () => toBigInt((await findCaseRecord(chainId, disputeId))?.arbitrableDisputeID ?? null));

//Same shape as KlerosLiquid.getDispute(): arrays of BigInt, or null when unknown.
export const getArbitratorDisputeDetails = (chainId, disputeId) =>
  read("disputeDetails", async () =>
    typedArrayFields((await findCaseRecord(chainId, disputeId))?.disputeDetails ?? null, [
      "votesLengths",
      "tokensAtStakePerJuror",
      "totalFeesForJurors",
      "votesInEachRound",
      "repartitionsInEachRound",
      "penaltiesInEachRound",
    ])
  );

export const getCurrentRuling = (chainId, disputeId) => read("currentRuling", async () => toBigInt((await findCaseRecord(chainId, disputeId))?.currentRuling ?? null));

export const getAppealCost = (chainId, disputeId) => read("appealCost", async () => toBigInt((await findCaseRecord(chainId, disputeId))?.appealCost ?? null));

export const getAppealPeriod = (chainId, disputeId) =>
  read("appealPeriod", async () => typedFields((await findCaseRecord(chainId, disputeId))?.appealPeriod ?? null, ["start", "end"]));

//Same shape as Archon arbitrable.getDispute: the Dispute event of the arbitrable, or null when it was not found.
export const getDisputeEvent = (chainId, arbitrated, disputeId) => read("disputeEvent", async () => (await findCaseRecord(chainId, disputeId))?.disputeEvent ?? null);

//Same shape as Archon arbitrable.getEvidence: one entry per Evidence event, or null when unknown.
export const getEvidences = (chainId, arbitrated, disputeId) => read("evidences", async () => (await findCaseRecord(chainId, disputeId))?.evidences ?? null);

//Same shape as Archon arbitrable.getRuling, or null when the arbitrable has not been ruled.
export const getRuling = (chainId, arbitrated, disputeId) => read("ruling", async () => (await findCaseRecord(chainId, disputeId))?.ruling ?? null);

//Same shape as resolveAppealMultipliers: BigInt multipliers, or null when they could not be resolved.
export const getMultipliers = (chainId, arbitrated) =>
  read("multipliers", async () => {
    const captured = await loadFromMap(caseLoaders, chainId, "cases");
    const handmade = await loadHandmadeCases(chainId);
    const ongoing = await loadOngoingFixture(chainId);
    const record = Object.entries({ ...captured.disputes, ...handmade }).find(
      ([id, candidate]) => (candidate.arbitratorDispute?.arbitrated ?? ongoing.arbitratorDisputes[id]?.arbitrated) === arbitrated
    )?.[1];
    return typedFields(record?.multipliers ?? null, ["winnerStakeMultiplier", "loserStakeMultiplier", "loserAppealPeriodMultiplier", "denominator"]);
  });

//Same shape as App.getAppealDecision: block timestamps and numbers, or null when unknown.
export const getAppealDecisions = (chainId, disputeId) => read("appealDecisions", async () => (await findCaseRecord(chainId, disputeId))?.appealDecisions ?? null);

//Same shape as App.getContributions: amounts as decimal strings by ruling. The record holds the current round; earlier rounds live under contributionsByRound.
export const getContributions = (chainId, arbitrableDisputeID, round, arbitrated) =>
  read("contributions", async () => {
    const record = await findCaseRecordByArbitrable(chainId, arbitrated, arbitrableDisputeID);
    if (!record) return {};
    if (Number(round) === (record.appealDecisions?.length ?? 0)) return { ...record.contributions };
    return { ...(record.contributionsByRound?.[round] ?? {}) };
  });

//Same shape as App.getRulingFunded: the fully funded rulings of the round as decimal strings.
export const getRulingFunded = (chainId, arbitrableDisputeID, round, arbitrated) =>
  read("rulingFunded", async () => {
    const record = await findCaseRecordByArbitrable(chainId, arbitrated, arbitrableDisputeID);
    if (!record) return [];
    if (Number(round) === (record.appealDecisions?.length ?? 0)) return [...record.rulingFunded];
    return [...(record.rulingFundedByRound?.[round] ?? [])];
  });

//Same shape as App.getTotalWithdrawableAmount. The fixture account has no contributions, so nothing is withdrawable unless the record says so.
export const getTotalWithdrawableAmount = (chainId, arbitrableDisputeID, contributedTo, arbitrated) =>
  read("totalWithdrawable", async () => {
    const record = await findCaseRecordByArbitrable(chainId, arbitrated, arbitrableDisputeID);
    return typedFields(record?.totalWithdrawable ?? { amount: "0", ruling: null }, ["amount"]);
  });

//Write actions never reach a wallet. REACT_APP_FIXTURE_WRITES=failure makes them fail the way the App handlers fail:
//appeal, withdrawal and dispute creation resolve null, evidence submission, publishing and signing in reject. Nothing in the fixture changes.
const writesSucceed = () => process.env.REACT_APP_FIXTURE_WRITES !== "failure";
const writeFailure = action => new Error(`Forced failure: REACT_APP_FIXTURE_WRITES is set to failure (${action}).`);
const receipt = () => ({ status: 1, hash: WRITE_TRANSACTION_HASH, blockNumber: null });

export const appeal = async (arbitrableAddress, arbitrableDisputeID, party, contribution) => {
  await delay();
  console.info("Fixture appeal:", { arbitrableAddress, arbitrableDisputeID: String(arbitrableDisputeID), party: String(party), contribution });
  return writesSucceed() ? receipt() : null;
};

export const withdraw = async (arbitrableAddress, arbitrableDisputeID, rulingOptionsContributedTo, arbitrableContractAddress) => {
  await delay();
  console.info("Fixture withdrawal:", { arbitrableAddress, arbitrableDisputeID: String(arbitrableDisputeID), rulingOptionsContributedTo, arbitrableContractAddress });
  return writesSucceed() ? receipt() : null;
};

export const submitEvidence = async (arbitrableAddress, evidence, value = "0") => {
  await delay();
  console.info("Fixture evidence submission:", { arbitrableAddress, evidence, value });
  if (!writesSucceed()) throw writeFailure("evidence submission");
  return receipt();
};

export const publish = async (filename, file) => {
  await delay();
  console.info("Fixture upload:", { filename, size: file?.size });
  if (!writesSucceed()) throw writeFailure("upload");
  return `/ipfs/${PUBLISHED_CID}/${filename}`;
};

export const signIn = async () => {
  await delay();
  console.info("Fixture sign-in: set REACT_APP_FIXTURE_SIGNED_IN=true to load the page signed in.");
  if (!writesSucceed()) throw writeFailure("sign-in");
};

//Same shape as App.createDispute: the receipt and the ID of the new dispute, or null when the transaction failed. The ID is the
//newest open dispute of the fixture chain, so the case page opened after the creation shows a real case.
export const createDispute = async options => {
  await delay();
  console.info("Fixture dispute creation:", options);
  if (!writesSucceed()) return null;
  const { openDisputeIDs } = await loadOngoingFixture(getFixtureChainId());
  const newest = openDisputeIDs.map(Number).reduce((max, id) => Math.max(max, id), 0);
  return { receipt: receipt(), disputeID: String(newest || 1) };
};
