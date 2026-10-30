import { formatAmount } from "./amount";
import type { AmountProps } from "./types";

export function Amount({ wei, chain, className }: AmountProps) {
  return (
    <data value={wei.toString()} className={className === undefined ? "tabular-nums" : `tabular-nums ${className}`}>
      {formatAmount(wei, chain)}
    </data>
  );
}
