/**
 * Whether a 2300-gas transfer reaches an account, as the appeal contracts send refunds and rewards. `not-checked`: the
 * account is not an EIP-7702 delegation, so it was not checked; `unknown`: the check itself failed.
 */
export type LowGasPayout = "receives" | "cannot-receive" | "unknown" | "not-checked";
