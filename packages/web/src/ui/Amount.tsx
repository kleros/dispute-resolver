import { formatAmount } from "./amount";
import type { AmountProps } from "./types";

/** An amount with the chain's currency symbol (D-10); the exact wei value stays machine-readable. */
export function Amount({ wei, chain, className }: AmountProps) {
  return (
    <data value={wei.toString()} className={className === undefined ? "tabular-nums" : `tabular-nums ${className}`}>
      {formatAmount(wei, chain)}
    </data>
  );
}
