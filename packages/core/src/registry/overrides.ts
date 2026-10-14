import type { RegistryKey } from "../types";
import type { BehaviorOverride } from "./types";

/**
 * Per-contract behavior changes no probe can detect (ADR 0003, layer two). Today there is one.
 *
 * Unslashed (mainnet) declares IDisputeResolver `VERSION()` "1.0.0" but violates the interface's semantics: it increments
 * its round counter without appeals, so the funding round is the appeal count plus one in every period and for both event
 * types. That was verified on-chain against all 66 funding events the contract ever emitted and its own round counter
 * (D-30). It also does not offer option 0 for funding; when the current ruling is 0, every option is costed and timed as a
 * winner, as today (spec 10.1).
 */
export const OVERRIDES: Readonly<Record<RegistryKey, BehaviorOverride>> = {
  "1:0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38": {
    roundIndexOffset: 1,
    refuseToArbitrateFundable: false,
    justification:
      "Unslashed declares IDisputeResolver VERSION 1.0.0 but increments its round counter without appeals and does not fund option 0; nothing on-chain reveals either deviation, so no probe can detect it (D-30).",
  },
};
