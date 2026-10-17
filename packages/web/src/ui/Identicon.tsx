import { identiconPattern } from "./identiconPattern";
import type { IdenticonProps } from "./types";

const DEFAULT_SIZE = 24;

/** A decorative identicon derived from the address bytes (11.3); the address shown next to it is its accessible name. */
export function Identicon({ address, size = DEFAULT_SIZE, className }: IdenticonProps) {
  const { cells, fill } = identiconPattern(address);
  const filled = cells.flatMap((row, y) => row.flatMap((on, x) => (on ? [{ x, y, key: `${String(x)}-${String(y)}` }] : [])));
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 5 5"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
      className={className === undefined ? "shrink-0 rounded-full" : `shrink-0 rounded-full ${className}`}
    >
      <rect width="5" height="5" className="fill-klerosUIComponentsMediumBlue" />
      {filled.map((cell) => (
        <rect key={cell.key} x={cell.x} y={cell.y} width="1" height="1" className={fill} />
      ))}
    </svg>
  );
}
