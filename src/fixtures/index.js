//Fixture mode renders the Ongoing Disputes page from the JSON files in ./ongoing instead of the network.
//It is off unless REACT_APP_USE_FIXTURES=true. See README.md for the other variables.
const DEFAULT_FIXTURE_CHAIN_ID = "1";

//Loaded on demand so the fixtures are not part of the bundle when fixture mode is off.
const fixtureLoaders = {
  1: () => import("./ongoing/1.json"),
  100: () => import("./ongoing/100.json"),
};

export const isFixtureMode = () => process.env.REACT_APP_USE_FIXTURES === "true";

export const getFixtureChainId = () => process.env.REACT_APP_FIXTURE_CHAIN_ID || DEFAULT_FIXTURE_CHAIN_ID;

const isForcedFailure = () => process.env.REACT_APP_FIXTURE_FAIL === "true";

//Waits REACT_APP_FIXTURE_DELAY_MS before every fixture read so the loading state stays visible.
const delay = () => {
  const ms = Number(process.env.REACT_APP_FIXTURE_DELAY_MS);
  return new Promise(resolve => setTimeout(resolve, ms > 0 ? ms : 0));
};

const loadFixture = async chainId => {
  const load = fixtureLoaders[chainId];
  if (!load) {
    throw new Error(`No ongoing disputes fixture for chain ${chainId}. Available chains: ${Object.keys(fixtureLoaders).join(", ")}.`);
  }

  const module = await load();
  const fixture = module.default;
  //Opt in with REACT_APP_FIXTURE_VARIANT=malformed; the default eight disputes stay unchanged.
  if (String(chainId) !== "100" || process.env.REACT_APP_FIXTURE_VARIANT !== "malformed") return fixture;

  const { default: malformed } = await import("./ongoing/100.malformed.json");
  return {
    ...fixture,
    openDisputeIDs: [...fixture.openDisputeIDs, malformed.disputeId],
    arbitratorDisputes: { ...fixture.arbitratorDisputes, [malformed.disputeId]: malformed.arbitratorDispute },
    metaEvidence: { ...fixture.metaEvidence, [malformed.disputeId]: malformed.metaEvidence },
  };
};

//Same shape as App.getOpenDisputesOnCourt: the open dispute IDs, unsorted.
export const getOpenDisputesOnCourt = async chainId => {
  await delay();
  if (isForcedFailure()) throw new Error("Forced failure: REACT_APP_FIXTURE_FAIL is set.");

  const fixture = await loadFixture(chainId);
  return [...fixture.openDisputeIDs];
};

//Same shape as App.getArbitratorDispute: the KlerosLiquid dispute struct, or null when unknown.
export const getArbitratorDispute = async (chainId, disputeId) => {
  await delay();
  const fixture = await loadFixture(chainId);
  return fixture.arbitratorDisputes[disputeId] ?? null;
};

//Same shape as App.getMetaEvidenceParallelizeable: the meta-evidence JSON, or null when missing.
export const getMetaEvidence = async (chainId, disputeId) => {
  await delay();
  const fixture = await loadFixture(chainId);
  return fixture.metaEvidence[disputeId] ?? null;
};

//Same shape as the subcourt state App.loadSubcourtData produces.
export const getSubcourtData = async chainId => {
  await delay();
  const fixture = await loadFixture(chainId);
  return { subcourts: fixture.subcourts, subcourtDetails: fixture.subcourtDetails };
};
