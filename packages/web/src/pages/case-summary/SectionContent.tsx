import type { ReactNode } from "react";
import { SectionUnavailable } from "../../ui";
import type { SectionData } from "../../data";

interface SectionContentProps<T> {
  readonly data: SectionData<T>;
  /** Shown as "{section} unavailable" when the data failed (D-36). */
  readonly section: string;
  /** What stands in while the data loads. */
  readonly loading: ReactNode;
  readonly onRetry?: () => void;
  readonly children: (value: T) => ReactNode;
}

/** One section's three states: its loading placeholder, its reason when unavailable (no fake data, D-36), or its content. */
export function SectionContent<T>({ data, section, loading, onRetry, children }: SectionContentProps<T>) {
  switch (data.status) {
    case "loading":
      return <>{loading}</>;
    case "unavailable":
      return <SectionUnavailable section={section} error={data.error} onRetry={onRetry} />;
    case "ready":
      return <>{children(data.value)}</>;
  }
}
