import { Button } from "@kleros/ui-components-library";
import { useRef, useState } from "react";
import type { RetryButtonProps } from "./types";
import { useMounted } from "./useMounted";

/**
 * Busy from the press until the re-read settles, resolved or rejected. `isPending` blocks presses but, unlike
 * `isDisabled`, keeps focus on the button.
 */
export function RetryButton({ label, onRetry, small = false }: RetryButtonProps) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useMounted();
  const press = () => {
    // A second press can land before the busy render does.
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    const settle = () => {
      pending.current = false;
      if (mounted.current) setBusy(false);
    };
    void onRetry().then(settle, settle);
  };
  return <Button text="Retry" aria-label={label} variant="secondary" small={small} isLoading={busy} isPending={busy} onPress={press} />;
}
