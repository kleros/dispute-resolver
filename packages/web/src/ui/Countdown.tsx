import { useNowSeconds } from "./clock";
import { formatDuration, isoDuration } from "./duration";
import type { CountdownProps } from "./types";

const COUNTDOWN_CLASS = "whitespace-nowrap tabular-nums";

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
