import type { ChainId } from "../types";
import type { CidPath } from "../uri/types";

/**
 * The pinned dynamic-script allowlist (A1): a script runs only if the canonical path of its URI exactly matches an entry
 * listed under the arbitrator chain of the dispute. Entries are `CidPath`s: the CID, or CID/file for a script inside a
 * directory, with no scheme, no leading slash and no trailing slash (06 §3 invariant 4).
 *
 * Provenance (2026-10-05): the meta-evidence of every dispute was resolved through the court's meta-evidence endpoint for
 * mainnet disputes 1-1684, Gnosis 1-1026 and Sepolia 1-452, each distinct meta-evidence file was fetched from the IPFS
 * gateway, and every distinct dynamic script URI was collected. All are listed except two: the script of mainnet dispute
 * 1684, a wallet-hijack attempt, and the script URI of Sepolia dispute 63, which points at a JSON file. Two mainnet
 * meta-evidence files could not be fetched (dispute 150, unpinned; dispute 560, a PDF); neither can carry a script. The
 * dispute 1621 override script `Qmf1k727vP7qZv21MDB8vwL6tfVEKPCUQAiw8CTfHStkjf` is not listed (D-25). A script of a later
 * dispute that is not listed shows the tamper notice until it is reviewed and added.
 *
 * Chiado is not served by that endpoint: on 2026-10-06 the meta-evidence events of the four arbitrables that ever had a
 * dispute there (13 disputes) were read from the chain and the scripts they name were collected.
 */

const MAINNET: readonly CidPath[] = [
  "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj", // Dispute Resolver default
  "QmX9qwsueTCvL7CRVi35BTTh3knDGCg9TFDqn25vth4Tf1", // Kleros Governor
  "QmdpXXmNxmdmLqZCabRUC9bZ65c2BN54EuUTRi5SdtiHQ4", // PoH and FORK DAO Governors
  "QmchWC6L3dT23wwQiJJLWCeS1EDnDYrLcYat93C4Lm4P4E/linguo-dynamic-script.js", // Linguo
  "QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn/bundle.js", // Reality.eth
  "QmWWsDmvjhR9UVRgkcG75vAKzfK3vB85EkZzudnaxwfAWr/bundle.js", // Reality.eth
  "QmSsM1ks9Q9xAd26uWxR3Sm1ZowpsEA49Vpvs6sWTBWjeg/realitio.js",
  "QmTtFgmyfNiWdde5pVa2h75rfesvSxp8i4wbSmuAieWx9o/realitio.js",
  "QmeiJ8pJofPcdTUCP1xaty9gtKpFisn8pDhUXcx9hqLV5u/realitio.js",
  "QmUkK86cStWBMTrutUonZ8FXqtYbYNqVQuALmiqSZzWu2z",
  "QmV7rEebupW9vE4YYmsu2zcdrd6waa5f22mNaYxBkdrNtc",
  "QmaZ3KtWQD7k7BSSabp94YVWLNz8NVJfABhNYFuSjMjsAQ",
  "QmYSZCxJ7Pf1mcnZ8JgdrietQUmzhAXdiVQccCevsphPEx",
  "QmcRGGmzzxSvXaajMCFYErZb5knuexoaDCZhJ5rSHRbcvw",
  "QmNhs2mo7t8pydn7gg6ycrtT4mhfvhARLEoyMYgs9SDkH2",
  "QmdvYb3qDJzig6FS6ckEEq2LEGxD4mq8En2UwVF3v28YEh",
  "Qmd4urnZbkk4X9eDk4yYZyqx6ZJJAAkE4TRjiCorVEqq8z",
];

const GNOSIS: readonly CidPath[] = [
  "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj", // Dispute Resolver default
  "QmdpXXmNxmdmLqZCabRUC9bZ65c2BN54EuUTRi5SdtiHQ4", // Governors
  "QmPAHCRtSU844fdjNoEws8AgTpzzwsYwMF2wydtpvXAcoZ/linguo-script.js", // Linguo
  "QmWWsDmvjhR9UVRgkcG75vAKzfK3vB85EkZzudnaxwfAWr/bundle.js", // Reality.eth
  "QmRnwMuc7kGipQkjzPY9jhcttRhebPRYwEvBVGTjmkMwe9", // Reality.eth
];

const CHIADO: readonly CidPath[] = [
  "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj", // Dispute Resolver default
  "QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn/bundle.js", // Reality.eth
];

const SEPOLIA: readonly CidPath[] = [
  "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj", // Dispute Resolver default
  "QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn/bundle.js", // Reality.eth
  "QmSsM1ks9Q9xAd26uWxR3Sm1ZowpsEA49Vpvs6sWTBWjeg/realitio.js",
  "QmP7B4xpied747pkTcAQp77Zt8omFGi6QLKpg1ZqL6FFrZ/realitio.js",
  "QmP7AfDnaKmrgsbyvWUvmqhmBFdAkp1d9JYCmGFQzCdgfx",
  "QmTHDAeLoprCRPbZSw4ZhJaByPshWtmqANhokU83MCtvDx",
  "QmV7rEebupW9vE4YYmsu2zcdrd6waa5f22mNaYxBkdrNtc",
  "QmaZ3KtWQD7k7BSSabp94YVWLNz8NVJfABhNYFuSjMjsAQ",
  "QmNVgPBVRsP7ZcFn8Tr2LkVhNzTwJGv6YaaaQt65DnDA6e",
  "QmYSZCxJ7Pf1mcnZ8JgdrietQUmzhAXdiVQccCevsphPEx",
  "QmcRGGmzzxSvXaajMCFYErZb5knuexoaDCZhJ5rSHRbcvw",
  "QmaG5RFGXp5gbu4EeA2nidFa1ks4qnFNDrET9WpDetKpXr",
  "QmUzmW5FUGKw4Lo8BgUxCYCNhoSyKCBZarEfAiQotcK1Na",
  "QmRqZ56yvPeWR42RqobUqHpxMixV5kfqrEEpBYuMSgKqoa",
  "QmdVnfWp5gicN1rR5YDPSc23PHW7nEwbaJmwfZwCWGbak5",
  "QmZ8gHDHenMHZ6WWCHTF3tn2NEhiP15Q5JK7kSCq1SM8x6",
  "QmVmXuzGMapNGkpS2zyT8PCKd1qMFCSGUoEUQgfzpxJhZc",
];

/** Arbitrator chain to the scripts its disputes may run. A chain without a list rejects every script. */
export const DYNAMIC_SCRIPT_ALLOWLIST: Readonly<Record<ChainId, readonly CidPath[]>> = {
  1: MAINNET,
  100: GNOSIS,
  11155111: SEPOLIA,
  10200: CHIADO,
};

/** "Dispute Resolver default: only sets the arbitrable interface link", written into meta-evidence by the Create page. */
export const DEFAULT_SCRIPT_CID = "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj";
