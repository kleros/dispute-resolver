/**
 * Function signatures whose 4-byte selectors the family probes look for (06 §1). The selector constants themselves
 * (`SELECTORS`, a `Record<ProbeSignature, Hex>`) are computed in phase 2 and checked in tests against the published
 * artifacts, so a transcription typo cannot survive.
 */
export type ProbeSignature =
  | "disputeIDtoTransactionID(uint256)"
  | "externalIDtoLocalID(uint256)"
  | "submitEvidence(string)"
  | "submitEvidence(uint256,string)"
  | "fundAppeal(uint256)"
  | "getCurrentSessionNumber()"
  | "getTotalWithdrawableAmount(uint256,address,uint256)"
  | "getTotalWithdrawableAmount(uint256,address,uint256[])"
  | "fundAppeal(uint256,uint256)"
  | "fundAppeal(uint256,uint8)";
