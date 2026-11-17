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
