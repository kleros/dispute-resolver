// The stable tier of docs/parity/04-golden-cases.md §2 (frozen 2026-10-14), transcribed as data. Every dispute is executed,
// so its state no longer changes. `highlights` are the concrete values §2 states for the new app; `degradation` is the
// expected behavior of the bad disputes (D-36: the dispute info and timeline render, the meta-evidence section degrades);
// `deviations` names ledger entries that apply to this case only, on top of the ones the table applies by the family §2
// names for the case (its `family` highlight, never the family the new app reports); `accountContext` is the on-chain
// withdrawable amount the account-context ledger tests compare against (D-02, D-30); `fundedRuling` is the on-chain
// RulingFunded event the D-02 decision rule compares the new app's winner against; `currentRuling` is the on-chain
// current ruling the P-14 decision rule reads; `productionMayFail` marks a case production may not settle, and why.
// After the stable tier come the executed disputes a ledger Test clause names (`LEDGER_CASES`), with `recordedEvidence`
// where their test needs the on-chain blocks of the Dispute and Evidence events (P-01). Each case's court is in courts.ts.

/** How a bad dispute must degrade on the new app. */
export type Degradation =
  /** The meta-evidence cannot be loaded or parsed: its section shows the failed state, the rest renders (D-36). */
  | "meta-evidence-failed"
  /** The meta-evidence URI is not content-addressed: the "invalid or tampered" placeholder, in both apps. */
  | "invalid-or-tampered";

export interface CaseHighlights {
  readonly compatibility?: "full" | "view-only";
  readonly family?: string;
  readonly titles?: readonly string[];
  readonly reservedTitles?: readonly string[];
  readonly evidenceCount?: number;
  readonly appealPanelKind?: string;
  readonly decisionWonBy?: "default" | "jury";
  readonly realityNotice?: string;
  readonly arbitrableAppHidden?: boolean;
  readonly evidenceDisplay?: boolean;
  /** Text the evidence display's frame must render once loaded: the item it shows, not an error page (06 §5 item 2). */
  readonly evidenceDisplayText?: string;
}

/**
 * The account context of 04 §1 recorded on-chain for a case whose ledger test reads the withdrawable amount: the
 * arbitrable's own `getTotalWithdrawableAmount` for the case's first contributor, summed over every ruling it funded
 * (`Contribution` events), read on 2026-10-15 at `block`.
 */
export interface RecordedAccountContext {
  /** The first contributor of the dispute, as `golden/accounts.json` names it (lowercase). */
  readonly account: string;
  readonly withdrawableWei: string;
  readonly block: number;
}

/**
 * The single RulingFunded event of a dispute's current round, recorded on-chain for a case where production's window
 * missed it (D-02): the new app shows that ruling as won by default where production shows the current ruling.
 */
export interface RecordedFundedRuling {
  /** The arbitrable that emitted the event (lowercase). */
  readonly arbitrable: string;
  readonly round: number;
  /** The funded ruling, in decimal. */
  readonly ruling: string;
  readonly eventBlock: number;
  /** The arbitrator's `currentRuling(disputeID)`, in decimal: the ruling production's decision text formats (spec §5.9). */
  readonly currentRuling: string;
  /** The block of the dispute's `DisputeCreation` event; the dispute was never appealed. */
  readonly disputeCreatedAt: number;
  /** The block the event and `currentRuling` were read at. */
  readonly block: number;
}

/**
 * A case on which production may fail to settle for a reason that says nothing about the new app. When production
 * then fails (see `productionFailed` in compare/engine.ts), its settle check is a note with the reason and no field is
 * compared; the new app's own checks (it settles, the 04 §2 highlights, the degradation) stay blocking.
 * - `does-not-load`: 04 §2 records that production does not load the dispute.
 * - `environment`: production depends on a third-party service the suite's own load can exhaust, so its failure is an
 *   environment result for the case, reported with `reason`.
 */
export type ProductionMayFail = { readonly cause: "does-not-load" } | { readonly cause: "environment"; readonly reason: string };

/**
 * The Dispute event and the Evidence events of a dispute, recorded on-chain for a case whose ledger test needs them
 * older than a look-back window (P-01): their blocks and how many Evidence events the dispute's evidence group has,
 * read at `block`.
 */
export interface RecordedEvidenceScan {
  readonly disputeCreatedAt: number;
  readonly lastEvidenceAt: number;
  readonly evidenceEvents: number;
  readonly block: number;
}

/** The arbitrator's `currentRuling(disputeID)`, in decimal, read on 2026-10-15 at `block`. */
export interface RecordedCurrentRuling {
  readonly ruling: string;
  readonly block: number;
}

/** 2²⁵⁶ − 1, the reserved Reality ruling "Answered too soon" (P-14), in decimal. */
const MAX_UINT256 = (2n ** 256n - 1n).toString();

export interface StableCase {
  readonly chainId: number;
  readonly disputeId: number;
  /** The arbitrable as §2 names it (a prefix where §2 abbreviates it). */
  readonly arbitrable: string;
  readonly exercises: string;
  readonly highlights?: CaseHighlights;
  readonly degradation?: Degradation;
  /** Why production may not settle this case, when it may; see `ProductionMayFail`. */
  readonly productionMayFail?: ProductionMayFail;
  /** The arbitrator's current ruling recorded on-chain, for a ledger rule that reads it (P-14). */
  readonly currentRuling?: RecordedCurrentRuling;
  readonly deviations?: readonly string[];
  readonly accountContext?: RecordedAccountContext;
  readonly fundedRuling?: RecordedFundedRuling;
  readonly recordedEvidence?: RecordedEvidenceScan;
}

export function caseKey(chainId: number, disputeId: number): string {
  return `${chainId.toString()}:${disputeId.toString()}`;
}

const MAINNET: readonly StableCase[] = [
  {
    chainId: 1,
    disputeId: 1454,
    arbitrable: "0x99489D7bb33539F3D1A401741E56e8f02B9AE0Cf",
    exercises: "plain resolver dispute, default script, single-select",
    highlights: { titles: ["Yes", "No"], evidenceCount: 2, arbitrableAppHidden: true, compatibility: "full" },
  },
  {
    chainId: 1,
    disputeId: 505,
    arbitrable: "0x135C573503f70dc290b1d60Fe2E7f7eB114FEBd6",
    exercises: "older resolver proxy without withdraw functions, 5 evidence",
    highlights: { compatibility: "full", family: "idr-legacy", evidenceCount: 5, appealPanelKind: "withdraw-unsupported" },
  },
  {
    chainId: 1,
    disputeId: 328,
    arbitrable: "0x135C573503f70dc290b1d60Fe2E7f7eB114FEBd6",
    exercises: "appealed resolver dispute, 9 evidence, no Contribution events",
    highlights: { family: "idr-legacy", evidenceCount: 9, appealPanelKind: "withdraw-unsupported" },
  },
  {
    chainId: 1,
    disputeId: 912,
    arbitrable: "0x4b89e798b10478a839ea0abcf86c4b94a3c782a4",
    exercises: "default script on another arbitrable, 0 evidence",
    highlights: { family: "idr-v1", evidenceCount: 0 },
  },
  {
    chainId: 1,
    disputeId: 913,
    arbitrable: "0x4b89e798b10478a839ea0abcf86c4b94a3c782a4",
    exercises: "default script on another arbitrable, 0 evidence",
    highlights: { family: "idr-v1", evidenceCount: 0 },
  },
  {
    chainId: 1,
    disputeId: 1650,
    arbitrable: "0x2018038203aee8e7a29dabd73771b0355d4f85ad",
    exercises: "charset-sensitive Reality renderer, on-chain derivation",
    highlights: { titles: ["Harris", "Trump"], reservedTitles: ["Answered Too Soon"] },
    currentRuling: { ruling: MAX_UINT256, block: 26_198_630 },
  },
  {
    chainId: 1,
    disputeId: 1677,
    arbitrable: "0xf72cfd1b34a91a64f9a98537fe63fbab7530adca",
    exercises: "Reality single-chain, template 139, 1 evidence",
    highlights: { realityNotice: "none", evidenceCount: 1 },
  },
  {
    chainId: 1,
    disputeId: 1673,
    arbitrable: "0xf72cfd1b34a91a64f9a98537fe63fbab7530adca",
    exercises: "Reality single-chain, template 20, 5 evidence",
    highlights: { evidenceCount: 5 },
  },
  {
    chainId: 1,
    disputeId: 1658,
    arbitrable: "0x3fb8314c628e9afe7677946d3e23443ce748ac17",
    exercises: "Reality cross-chain, home Unichain, uint template, fully withdrawn",
    // D-02: never appealed, so production scans RulingFunded only from head − 1,000,000 blocks (spec §6.3), long after
    // the round's one funded ruling; the new app scans from the round's start block and shows that ruling, won by default.
    deviations: ["D-02"],
    fundedRuling: {
      arbitrable: "0x3fb8314c628e9afe7677946d3e23443ce748ac17",
      round: 0,
      ruling: "4243172404000000000000000001",
      eventBlock: 21_984_352,
      currentRuling: "4243172405",
      disputeCreatedAt: 21_943_990,
      block: 26_194_198,
    },
  },
  {
    chainId: 1,
    disputeId: 1657,
    arbitrable: "0xfe0eb5fc686f929eb26d541d75bb59f816c0aa68",
    exercises: "cross-chain, home Gnosis, 15 evidence, ruling = max uint",
    highlights: { evidenceCount: 15 },
    currentRuling: { ruling: MAX_UINT256, block: 26_198_630 },
  },
  { chainId: 1, disputeId: 1661, arbitrable: "0xfe0eb5fc686f929eb26d541d75bb59f816c0aa68", exercises: "cross-chain, 11 evidence", highlights: { evidenceCount: 11 } },
  { chainId: 1, disputeId: 1668, arbitrable: "0xf0b37feda6cdf5f78b37e1fbccc24969059f2044", exercises: "cross-chain, home Base, 0 evidence", highlights: { evidenceCount: 0 } },
  { chainId: 1, disputeId: 1586, arbitrable: "0x68c4cc21", exercises: "cross-chain, home Polygon; must load" },
  {
    chainId: 1,
    disputeId: 1674,
    arbitrable: "0xbE9834097A4E97689d9B667441acafb456D0480A",
    exercises: "Proof of Humanity v2, not IDisputeResolver, 3 evidence, executed",
    highlights: { compatibility: "view-only", family: "view-only", evidenceCount: 3, appealPanelKind: "hidden" },
  },
  {
    chainId: 1,
    disputeId: 1667,
    arbitrable: "0xbE9834097A4E97689d9B667441acafb456D0480A",
    exercises: "PoH v2 with round count 2",
    highlights: { compatibility: "view-only", family: "view-only" },
  },
  {
    chainId: 1,
    disputeId: 1646,
    arbitrable: "0xc5e9ddebb09cd64dfacab4011a0d5cedaf7c9bdb",
    exercises: "Proof of Humanity v1, view-only, 3 evidence, court 23",
    highlights: { compatibility: "view-only", family: "view-only", evidenceCount: 3 },
  },
  {
    chainId: 1,
    disputeId: 1255,
    arbitrable: "0xEbcf3bcA271B26ae4B162Ba560e243055Af0E679",
    exercises: "T2CR evidence display on the dead ipfs.kleros.io host, 3 evidence",
    highlights: {
      family: "view-only",
      titles: ["Yes, Add It", "No, Don't Add It"],
      evidenceCount: 3,
      evidenceDisplay: true,
      // 06 §5 item 2: the T2CR item the display renders through the gateway (golden run of 2026-10-16).
      evidenceDisplayText: "The Token in Question: Revolt 2 Earn RVLT",
    },
  },
  { chainId: 1, disputeId: 1659, arbitrable: "0xda03509bb770061a61615ad8fc8e1858520ebd86", exercises: "LightGTCR Curate dispute", highlights: { family: "view-only" } },
  { chainId: 1, disputeId: 1649, arbitrable: "0x4A9f8e73b3c4c9d7fA0210b9de457b1c493a3AdA", exercises: "Seer Curate variant", highlights: { family: "view-only" } },
  {
    chainId: 1,
    disputeId: 1100,
    arbitrable: "0x99a0f0e0d9ee776d791d2e55c215d05ccf7286fc",
    exercises: "GTCR classic; loads in production, must load in the new app",
    highlights: { family: "view-only" },
  },
  {
    chainId: 1,
    disputeId: 1621,
    arbitrable: "0x327a29fcE0a6490E4236240Be176dAA282EcCfdF",
    exercises: "poh.eth governor; original script instead of the override (D-25), 2 evidence",
    highlights: { family: "governor", titles: ["List 7", "List 8"], evidenceCount: 2 },
    productionMayFail: {
      cause: "environment",
      reason: "production's dispute-1621 override script reads through a shared third-party Infura key that the suite's own load can rate-limit",
    },
  },
  {
    chainId: 1,
    disputeId: 1676,
    arbitrable: "0x327a29fcE0a6490E4236240Be176dAA282EcCfdF",
    exercises: "recent governor dispute, 1 evidence",
    highlights: { family: "governor", evidenceCount: 1 },
  },
  {
    chainId: 1,
    disputeId: 1672,
    arbitrable: "0xe5bcEa6F87aAEe4a81f64dfDB4d30d400e0e5cf4",
    exercises: "kleros.eth governor without an evidence function",
    highlights: { family: "governor" },
  },
  {
    chainId: 1,
    disputeId: 535,
    arbitrable: "0xe5bcEa6F87aAEe4a81f64dfDB4d30d400e0e5cf4",
    exercises: "kleros.eth governor without an evidence function",
    highlights: { family: "governor", titles: ["List 0", "List 1"] },
  },
  {
    chainId: 1,
    disputeId: 878,
    arbitrable: "0xC25a0b9681ABF6F090AEd71a8c08fB564b41dab6",
    exercises: "Escrow V1, 2 evidence",
    highlights: { family: "escrow-v1", appealPanelKind: "escrow-ended", evidenceCount: 2 },
  },
  {
    chainId: 1,
    disputeId: 168,
    arbitrable: "0x0d67440946949fe293b45c52efd8a9b3d51e2522",
    exercises: "Escrow V1 (lowercase list entry), appealed, round count 3, 7 evidence",
    highlights: { family: "escrow-v1", appealPanelKind: "escrow-ended", evidenceCount: 7 },
    deviations: ["D-12"],
  },
  {
    chainId: 1,
    disputeId: 92,
    arbitrable: "0x0d67440946949fe293b45c52efd8a9b3d51e2522",
    exercises: "Escrow V1 (lowercase list entry), 3 evidence",
    highlights: { family: "escrow-v1", appealPanelKind: "escrow-ended", evidenceCount: 3 },
    deviations: ["D-12"],
  },
  {
    chainId: 1,
    disputeId: 1678,
    arbitrable: "0xe0e1bc8C6cd1B81993e2Fcfb80832d814886eA38",
    exercises: "Unslashed, IDisputeResolver v1, round-index offset, 8 evidence",
    highlights: { family: "idr-v1", evidenceCount: 8, decisionWonBy: "default" },
    deviations: ["D-30"],
    accountContext: { account: "0x9b29085866dae2ac0611be9c5191101ceb2c6d53", withdrawableWei: "0", block: 26_193_270 },
  },
  {
    chainId: 1,
    disputeId: 1226,
    arbitrable: "0xe0e1bc8C6cd1B81993e2Fcfb80832d814886eA38",
    exercises: "Unslashed appealed, executed",
    highlights: { family: "idr-v1" },
    deviations: ["D-30"],
    accountContext: { account: "0x1cb4af10cc35e6349f874061911496ad50f26076", withdrawableWei: "0", block: 26_193_270 },
  },
  { chainId: 1, disputeId: 1665, arbitrable: "0x412c0617", exercises: "Polygon foreign proxy whose home-proxy call reverts", degradation: "meta-evidence-failed" },
  { chainId: 1, disputeId: 1666, arbitrable: "0xd6bf90e1", exercises: "Polygon foreign proxy whose home-proxy call reverts", degradation: "meta-evidence-failed" },
  {
    chainId: 1,
    disputeId: 150,
    arbitrable: "0x594ec762b59978c97c82bc36ab493ed8b1f1f368",
    exercises: "unpinned meta-evidence, 2^128-1 choices",
    degradation: "meta-evidence-failed",
  },
  {
    chainId: 1,
    disputeId: 560,
    arbitrable: "0xc5e9ddeb",
    exercises: "meta-evidence is a PDF, not JSON",
    highlights: { family: "view-only" },
    degradation: "meta-evidence-failed",
  },
];

const GNOSIS: readonly StableCase[] = [
  {
    chainId: 100,
    disputeId: 431,
    arbitrable: "0xC7aDD3C961f7935CB4914E37DA991D2f1Cd7986c",
    exercises: "resolver dispute, 2 evidence, xDai labels (D-10)",
    highlights: { evidenceCount: 2 },
  },
  {
    chainId: 100,
    disputeId: 460,
    arbitrable: "0xC7aDD3C961f7935CB4914E37DA991D2f1Cd7986c",
    exercises: "latest resolver dispute, 0 evidence; must load",
    highlights: { evidenceCount: 0 },
  },
  { chainId: 100, disputeId: 454, arbitrable: "0xC7aDD3C961f7935CB4914E37DA991D2f1Cd7986c", exercises: "resolver dispute, 1 evidence", highlights: { evidenceCount: 1 } },
  {
    chainId: 100,
    disputeId: 0,
    arbitrable: "0x1128eD55ab2d796fa92D2F8E1f336d745354a77A",
    exercises: "multiple-select A/B/C, ruling 5 (bitmask), IDisputeResolver v1, executed",
    highlights: { family: "idr-v1", titles: ["A", "B", "C"], appealPanelKind: "withdraw" },
    deviations: ["D-49"],
  },
  {
    chainId: 100,
    disputeId: 229,
    arbitrable: "0xe04f5791d671d5c4e08ab49b39807087b591ea3e",
    exercises: "Reality multiple-select (template 3), ruling 12",
    highlights: { titles: ["Red", "Blue", "1234", "Yellow"] },
  },
  { chainId: 100, disputeId: 416, arbitrable: "0xe04f5791d671d5c4e08ab49b39807087b591ea3e", exercises: "Reality single-chain, template 76, %20-encoded policy path" },
  {
    chainId: 100,
    disputeId: 121,
    arbitrable: "0xe04f5791d671d5c4e08ab49b39807087b591ea3e",
    exercises: "appealed, round count 2, 44.8 xDAI never withdrawn",
    highlights: { appealPanelKind: "withdraw" },
    deviations: ["D-02"],
    accountContext: { account: "0xfd4ba0a1c08e0af938a2b1ac06e8937c8535ec93", withdrawableWei: "0", block: 48_758_279 },
  },
  {
    chainId: 100,
    disputeId: 120,
    arbitrable: "0xe04f5791d671d5c4e08ab49b39807087b591ea3e",
    exercises: "appealed, round count 2, 44.8 xDAI never withdrawn",
    highlights: { appealPanelKind: "withdraw" },
    deviations: ["D-02"],
    accountContext: { account: "0x5e7b645d5bf86750cb1913122ba8a8545e2a9fd1", withdrawableWei: "0", block: 48_758_279 },
  },
  {
    chainId: 100,
    disputeId: 118,
    arbitrable: "0xe04f5791d671d5c4e08ab49b39807087b591ea3e",
    exercises: "appealed, round count 2, 44.8 xDAI never withdrawn",
    highlights: { appealPanelKind: "withdraw" },
    deviations: ["D-02"],
    accountContext: { account: "0x8dc93c415b1894f811afb9fe7dfe17b24d559215", withdrawableWei: "0", block: 48_758_279 },
  },
  {
    chainId: 100,
    disputeId: 220,
    arbitrable: "0xe04f5791d671d5c4e08ab49b39807087b591ea3e",
    exercises: "unfunded appeal refund, 1.0 xDAI contributed, 8 evidence",
    highlights: { evidenceCount: 8, appealPanelKind: "withdraw" },
    // D-02: never appealed, so production scans Contribution only from head − 1,000,000 blocks (spec §6.3), long after
    // the round's one 1.0 xDAI contribution; the new app scans from the round's start block and shows it as withdrawable.
    deviations: ["D-02"],
    accountContext: { account: "0x2b8ac59b3bb706daa40f721bbfb0f133033f2b9d", withdrawableWei: "1000000000000000000", block: 48_762_478 },
  },
  { chainId: 100, disputeId: 58, arbitrable: "0x2a2bab2c2d4eb5007b0389720b287d4d19dc4001", exercises: "Reality bool template", highlights: { titles: ["No", "Yes"] } },
  {
    chainId: 100,
    disputeId: 132,
    arbitrable: "0x54068a67441a950ff33afa5a3247acc7188d0789",
    exercises: "Spanish localization, 152.32 xDAI unclaimed",
    highlights: { reservedTitles: ["Respondió demasiado pronto"] },
    deviations: ["D-02"],
    accountContext: { account: "0xe7f13052fe2ba7d038dac18de5e730542e3979bc", withdrawableWei: "107520000000000000000", block: 48_758_279 },
  },
  {
    chainId: 100,
    disputeId: 1022,
    arbitrable: "0x957a53a994860be4750810131d9c876b2f52d6e1",
    exercises: "Curate removal-request wording",
    highlights: { family: "view-only" },
  },
  {
    chainId: 100,
    disputeId: 115,
    arbitrable: "0xf7dE5537eCD69a94695fcF4BCdBDeE6329b63322",
    exercises: "fork-dao governor; meta-evidence event not decodable; fails to load in production",
    highlights: { family: "governor" },
    degradation: "meta-evidence-failed",
    productionMayFail: { cause: "does-not-load" },
  },
  {
    chainId: 100,
    disputeId: 863,
    arbitrable: "0x25fA9432832EFdD48DEec6D4Cf1cD3f139678a5b",
    exercises: "meta-evidence re-emitted with an absolute gateway URL",
    degradation: "invalid-or-tampered",
    // D-47: an EIP-1167 clone with no selectors of its own, view-only by 06 §1 (prose and test item 8) and 03 C11; its
    // bytecode is recorded in packages/core/src/families/__fixtures__/bytecode-100.json.
    deviations: ["D-47"],
  },
  // D-47 on 44, 41 and 42: the Curate list "Legitimate DOTA 2 Rampages". Its runtime code read at Gnosis block 48,760,467
  // is the 45-byte EIP-1167 clone of the LightGTCR implementation 0x99d1d0030c553c41e31840721d5763ed4df49e4d, byte for byte
  // the code of Gnosis 1022's arbitrable 0x957a53a9…, which bytecode-100.json records as view-only (06 §1 row 7).
  {
    chainId: 100,
    disputeId: 44,
    arbitrable: "0x01f292c270f1d477019e9b16465a7c411a160ca9",
    exercises: "meta-evidence URI on the dead ipfs.kleros.io host",
    degradation: "invalid-or-tampered",
    deviations: ["D-47"],
  },
  {
    chainId: 100,
    disputeId: 41,
    arbitrable: "0x01f292c270f1d477019e9b16465a7c411a160ca9",
    exercises: "meta-evidence URI on the dead ipfs.kleros.io host",
    degradation: "invalid-or-tampered",
    deviations: ["D-47"],
  },
  {
    chainId: 100,
    disputeId: 42,
    arbitrable: "0x01f292c270f1d477019e9b16465a7c411a160ca9",
    exercises: "meta-evidence URI on the dead ipfs.kleros.io host",
    degradation: "invalid-or-tampered",
    deviations: ["D-47"],
  },
  {
    chainId: 100,
    disputeId: 140,
    arbitrable: "0x62B286a93D6F720A654745A3451f71cF71481b81",
    exercises: "unparseable meta-evidence JSON",
    degradation: "meta-evidence-failed",
    // D-47: read at Gnosis block 48,760,467, its EIP-1967 implementation slot is empty and its runtime code carries
    // submitEvidence(uint256,string) alone, none of the 06 §1 family selectors, so it is view-only (06 §1 row 7);
    // production shows its view-only banner too.
    deviations: ["D-47"],
  },
];

export const STABLE_TIER: readonly StableCase[] = [...MAINNET, ...GNOSIS];

/**
 * Executed disputes that a ledger or proposal Test clause names and 04 §2 does not list. They run with the stable tier.
 * - P-01, "a Sepolia dispute older than 50,000 blocks shows its evidence": Sepolia 365, created through the Sepolia
 *   ArbitrableProxy at block 10,944,579 with its 3 Evidence events by block 10,944,643, read at block 11,925,583 (about
 *   980,000 blocks later). Production scans the Dispute and Evidence events from head − 50,000 on testnets, so it finds
 *   neither and lists no evidence; the new app scans from the arbitrator's deployment block (block 0 on Sepolia).
 */
const LEDGER_CASES: readonly StableCase[] = [
  {
    chainId: 11155111,
    disputeId: 365,
    arbitrable: "0x009cA5A0B816156F91B29A93d7688c52480BaB24",
    exercises: "P-01: evidence older than the testnet look-back of 50,000 blocks, 3 evidence",
    highlights: { evidenceCount: 3 },
    deviations: ["P-01"],
    recordedEvidence: { disputeCreatedAt: 10_944_579, lastEvidenceAt: 10_944_643, evidenceEvents: 3, block: 11_925_583 },
  },
];

/** Every case the golden run compares: the stable tier, then the ledger's named cases. */
export const GOLDEN_CASES: readonly StableCase[] = [...STABLE_TIER, ...LEDGER_CASES];

/** The chains the Ongoing and Create screens are compared on. */
export const SCREEN_CHAINS = [1, 100] as const;

/** Restricts the run to `GOLDEN_CASES` (comma-separated `chain:id` keys) when it is set. */
export function selectedCases(filter: string | undefined): readonly StableCase[] {
  if (filter === undefined || filter.trim() === "") return GOLDEN_CASES;
  const keys = new Set(filter.split(",").map((key) => key.trim()));
  return GOLDEN_CASES.filter((entry) => keys.has(caseKey(entry.chainId, entry.disputeId)));
}
