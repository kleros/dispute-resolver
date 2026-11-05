import { Button } from "@kleros/ui-components-library";
import { Notice } from "./Notice";
import type { SectionUnavailableProps } from "./types";

export function SectionUnavailable({ section, error, onRetry }: SectionUnavailableProps) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Notice variant="warning" title={`${section} unavailable`} body={error.message} className="w-full" />
      {onRetry === undefined ? null : <Button text="Retry" aria-label={`Retry ${section}`} variant="secondary" small onPress={onRetry} />}
    </div>
  );
}
