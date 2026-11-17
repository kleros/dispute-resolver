import { DropdownSelect } from "@kleros/ui-components-library";
import { PERIOD_FILTER_OPTIONS, filterOption, type PeriodFilter } from "./periodFilter";

const ITEMS = PERIOD_FILTER_OPTIONS.map((option) => ({ id: option.id, text: option.label, dot: option.dot }));

interface PeriodFilterSelectProps {
  readonly value: PeriodFilter;
  readonly onChange: (filter: PeriodFilter) => void;
}

export function PeriodFilterSelect({ value, onChange }: PeriodFilterSelectProps) {
  return (
    <div className="w-full sm:w-auto">
      <DropdownSelect
        label="Period"
        items={ITEMS}
        // The library bundles its own react-aria Select, which reads only `selectedKey`; the hoisted react-aria types
        // deprecate it for `value`, which that bundled copy ignores (the selection would show "Select").
        // eslint-disable-next-line sonarjs/deprecation, @typescript-eslint/no-deprecated
        selectedKey={filterOption(value).id}
        callback={(item) => {
          const option = PERIOD_FILTER_OPTIONS.find((candidate) => candidate.id === item.id);
          if (option !== undefined) onChange(option.filter);
        }}
      />
    </div>
  );
}
