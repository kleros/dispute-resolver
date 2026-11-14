import type { ReactNode } from "react";
import { SectionUnavailable, useRevealIn } from "../../ui";
import type { SectionData } from "../../data";

interface SectionContentProps<T> {
  readonly data: SectionData<T>;
  readonly section: string;
  readonly loading: ReactNode;
  readonly onRetry?: () => void;
  /** The content, and the class that reveals it when it replaces the placeholder during this mount. */
  readonly children: (value: T, reveal: string | undefined) => ReactNode;
}

/** Unavailable data shows its reason, never stand-in values. */
export function SectionContent<T>({ data, section, loading, onRetry, children }: SectionContentProps<T>) {
  const reveal = useRevealIn(data.status === "loading");
  switch (data.status) {
    case "loading":
      return <>{loading}</>;
    case "unavailable":
      return <SectionUnavailable section={section} error={data.error} onRetry={onRetry} />;
    case "ready":
      return <>{children(data.value, reveal)}</>;
  }
}
