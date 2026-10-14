import { parseEther } from "viem";

/** A contribution in wei, or why the typed amount cannot be sent. */
export type Contribution = { readonly ok: true; readonly wei: bigint } | { readonly ok: false; readonly message: string };

/** Every supported chain's currency has 18 decimals. */
const PLAIN_DECIMAL = /^\d+(?:\.(\d+))?$/;
const MAX_DECIMALS = 18;

/**
 * A typed contribution in the chain's currency as wei (spec §5.12 fund action). An amount that cannot be sent as typed
 * is refused with a message instead of being rounded or sent as zero (D-14).
 */
export function parseContribution(text: string): Contribution {
  const match = PLAIN_DECIMAL.exec(text);
  if (match === null) return { ok: false, message: "Enter the amount as a number, such as 0.5." };
  const decimals = match[1]?.length ?? 0;
  if (decimals > MAX_DECIMALS) return { ok: false, message: "Amounts have at most 18 decimals." };
  const wei = parseEther(text);
  return wei > 0n ? { ok: true, wei } : { ok: false, message: "Enter an amount greater than 0." };
}
