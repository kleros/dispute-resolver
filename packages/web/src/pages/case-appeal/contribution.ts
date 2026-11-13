import { parseEther } from "viem";

type Contribution = { readonly ok: true; readonly wei: bigint } | { readonly ok: false; readonly message: string };

const DIGITS_AND_SEPARATORS = /^[\d.,]+$/;
const PLAIN_DECIMAL = /^(0|[1-9]\d*)(?:([.,])(\d+))?$/;
/** Every supported chain's currency has 18 decimals. */
const MAX_DECIMALS = 18;
const NOT_A_NUMBER = "Enter the amount as a number, such as 0.5.";
const USE_A_POINT = "Use a point (.) for decimals.";

/**
 * An amount that cannot be sent as typed is refused with a message instead of being rounded or sent as zero. A single
 * comma is read as the decimal point, except where it could group thousands ("1,000"): then the amount is refused, as
 * is any text with more than one separator.
 */
export function parseContribution(text: string): Contribution {
  if (DIGITS_AND_SEPARATORS.test(text) && text.replaceAll(/\d/g, "").length > 1) return { ok: false, message: USE_A_POINT };
  const match = PLAIN_DECIMAL.exec(text);
  if (match === null) return { ok: false, message: NOT_A_NUMBER };
  const [, whole = "", separator, decimals = ""] = match;
  if (separator === "," && whole !== "0" && decimals.length === 3) return { ok: false, message: USE_A_POINT };
  if (decimals.length > MAX_DECIMALS) return { ok: false, message: "Amounts have at most 18 decimals." };
  const wei = parseEther(decimals === "" ? whole : `${whole}.${decimals}`);
  return wei > 0n ? { ok: true, wei } : { ok: false, message: "Enter an amount greater than 0." };
}
