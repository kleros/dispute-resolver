import { useNowSeconds } from "./clock";
import { formatDuration, isoDuration } from "./duration";
import type { CountdownProps } from "./types";

const COUNTDOWN_CLASS = "whitespace-nowrap tabular-nums";

/**
 * Time left until `target` as `DDd HHh MMm` (spec 3, spec 5.7, spec 5.12), shown as zeros once the target has passed.
 * Whether a countdown is shown at all (for example only for a future target, spec 3) is the caller's decision.
 */
export function Countdown({ target, className }: CountdownProps) {
  const now = useNowSeconds();
  const classes = className === undefined ? COUNTDOWN_CLASS : `${COUNTDOWN_CLASS} ${className}`;
  if (!Number.isFinite(target)) {
    return <span className={classes}>Unknown</span>;
  }
  const remaining = target - now;
  return (
    <time dateTime={isoDuration(remaining)} className={classes}>
      {formatDuration(remaining)}
    </time>
  );
}
