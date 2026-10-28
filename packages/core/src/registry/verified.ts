import type { RegistryKey } from "../types";
import type { VerifiedArbitrable } from "./types";

const ARBITRABLE_PROXY_RULE =
  "rule() replaces the jury's ruling with the only ruling fully funded in the last round, and getWithdrawableAmount returns every contribution of a round that was not appealed in full.";
const GOVERNOR_RULE =
  "rule() executes the only list fully funded in the last round (shadowWinner + 1) in place of the jury's ruling, and withdrawFeesAndRewards returns every contribution of a round that was not appealed in full.";
const ESCROW_RULE = "rule() executes the jury's ruling, and an appeal is the arbitrator's own, paid in full through appeal() with no deadline of the contract's.";

/**
 * Arbitrables whose deployed code was read, so the appeal rules can be stated as theirs rather than as the standard
 * ones. Each justification opens with the kind of evidence: a verified source, or a bytecode twin of a verified address.
 * Behavior seen on chain alone does not qualify, and neither does an upgradeable proxy.
 */
export const VERIFIED_ARBITRABLES: Readonly<Record<RegistryKey, VerifiedArbitrable>> = {
  "1:0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf": {
    family: "idr-v2",
    settlement: "sole-funded-wins",
    refundsWithoutAppeal: true,
    justification: `Verified source (Blockscout partial match, ArbitrableProxy solc 0.7.6): ${ARBITRABLE_PROXY_RULE}`,
  },
  "100:0xc7add3c961f7935cb4914e37da991d2f1cd7986c": {
    family: "idr-v2",
    settlement: "sole-funded-wins",
    refundsWithoutAppeal: true,
    justification:
      "Bytecode twin of 1:0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf at block 48749920: the same runtime code and metadata hash, differing only in the immutable arbitrator address.",
  },
  "11155111:0x009ca5a0b816156f91b29a93d7688c52480bab24": {
    family: "idr-v2",
    settlement: "sole-funded-wins",
    refundsWithoutAppeal: true,
    justification: `Verified source (Blockscout partial match, ArbitrableProxy solc 0.7.6): ${ARBITRABLE_PROXY_RULE}`,
  },
  "11155111:0x1780601e6465f32233643f3af54abc3d8df161be": {
    family: "idr-v2",
    settlement: "sole-funded-wins",
    refundsWithoutAppeal: true,
    justification: `Verified source (Blockscout full match, ArbitrableProxy solc 0.7.6): ${ARBITRABLE_PROXY_RULE}`,
  },
  "1:0x4b89e798b10478a839ea0abcf86c4b94a3c782a4": {
    family: "idr-v1",
    settlement: "sole-funded-wins",
    refundsWithoutAppeal: true,
    justification: `Verified source (Blockscout full match, ArbitrableProxy solc 0.7.6, IDisputeResolver 1.0.0): ${ARBITRABLE_PROXY_RULE}`,
  },
  "100:0x1128ed55ab2d796fa92d2f8e1f336d745354a77a": {
    family: "idr-v1",
    settlement: "sole-funded-wins",
    refundsWithoutAppeal: true,
    justification:
      "Bytecode twin of 1:0x4b89e798b10478a839ea0abcf86c4b94a3c782a4 at block 48749920: the same runtime code and metadata hash, differing only in the immutable arbitrator address.",
  },
  "100:0xaeecfa44639b61d2e0a9534d918789d94a24a9de": {
    family: "idr-v2",
    settlement: "jury-stands",
    justification:
      "Verified source (Sourcify exact match, Yubiai solc 0.8.17): rule() executes the jury's ruling whatever was funded, and a sole funder of a ruling the jury did not give is not reimbursed.",
  },
  "1:0x135c573503f70dc290b1d60fe2e7f7eb114febd6": {
    family: "idr-legacy",
    settlement: "sole-funded-wins",
    justification:
      "Verified source (Blockscout partial match, BinaryArbitrableProxy solc 0.6.4): rule() rules for the only party that fully paid in the last round. Its funding dialect is not supported here, so the entry only words the ruling it executed.",
  },
  "1:0x327a29fce0a6490e4236240be176daa282eccfdf": {
    family: "governor",
    settlement: "sole-funded-wins",
    refundsWithoutAppeal: true,
    justification: `Verified source (Blockscout partial match, KlerosGovernor solc 0.4.26, poh.eth): ${GOVERNOR_RULE}`,
  },
  "1:0x7510c77163683448b8dc8fe9e019d9482be1ed2b": {
    family: "governor",
    settlement: "sole-funded-wins",
    refundsWithoutAppeal: true,
    justification: `Verified source (Blockscout partial match, KlerosGovernor solc 0.4.26, ubi-voting.eth): ${GOVERNOR_RULE}`,
  },
  "1:0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4": {
    family: "governor",
    settlement: "sole-funded-wins",
    refundsWithoutAppeal: true,
    justification: `Verified source (Blockscout partial match, KlerosGovernor solc 0.4.26, kleros.eth): ${GOVERNOR_RULE}`,
  },
  "100:0xf7de5537ecd69a94695fcf4bcdbdee6329b63322": {
    family: "governor",
    settlement: "sole-funded-wins",
    refundsWithoutAppeal: true,
    justification: `Verified source (Sourcify exact match, KlerosGovernor solc 0.4.26, fork-dao.eth): ${GOVERNOR_RULE}`,
  },
  "1:0xe2dd8cce2c33a04215074adb4b5820b765d8ed9d": {
    family: "escrow-v1",
    settlement: "jury-stands",
    justification: `Verified source (Blockscout partial match, MultipleArbitrableTransaction solc 0.4.24): ${ESCROW_RULE}`,
  },
  "1:0x0d67440946949fe293b45c52efd8a9b3d51e2522": {
    family: "escrow-v1",
    settlement: "jury-stands",
    justification: `Verified source (Blockscout partial match, MultipleArbitrableTransaction solc 0.4.24): ${ESCROW_RULE}`,
  },
  "1:0xc25a0b9681abf6f090aed71a8c08fb564b41dab6": {
    family: "escrow-v1",
    settlement: "jury-stands",
    justification: `Verified source (Blockscout partial match, MultipleArbitrableTokenTransaction solc 0.4.25): ${ESCROW_RULE}`,
  },
  "1:0xbcf0d1ad453728f75e9cfd4358ed187598a45e6c": {
    family: "escrow-v1",
    settlement: "jury-stands",
    justification: `Verified source (Blockscout partial match, MultipleArbitrableTokenTransaction solc 0.4.25): ${ESCROW_RULE}`,
  },
};
