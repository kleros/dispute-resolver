import type { EvidenceOrder } from "@dispute-resolver/core";
import { DropdownSelect } from "@kleros/ui-components-library";

export const ORDER_LABELS: Readonly<Record<EvidenceOrder, string>> = { newest: "Newest first", oldest: "Oldest first" };

const ITEMS = (Object.keys(ORDER_LABELS) as EvidenceOrder[]).map((order) => ({ id: order, text: ORDER_LABELS[order] }));

interface EvidenceOrderSelectProps {
  readonly value: EvidenceOrder;
  readonly onChange: (order: EvidenceOrder) => void;
}

export function EvidenceOrderSelect({ value, onChange }: EvidenceOrderSelectProps) {
  return (
    // Column 2 of the Submit row, also when no submit control fills column 1.
    <div className="w-full sm:col-start-2 sm:row-start-1 sm:w-auto">
      <DropdownSelect
        aria-label="Order"
        items={ITEMS}
        // The library bundles its own react-aria Select, which reads only `selectedKey`; the hoisted react-aria types
        // deprecate it for `value`, which that bundled copy ignores (the selection would show "Select").
        // eslint-disable-next-line sonarjs/deprecation, @typescript-eslint/no-deprecated
        selectedKey={value}
        callback={(item) => {
          const order = ITEMS.find((candidate) => candidate.id === item.id)?.id;
          if (order !== undefined && order !== value) onChange(order);
        }}
      />
    </div>
  );
}
