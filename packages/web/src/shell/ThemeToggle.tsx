import { ICON_SWAP_CLASS, ICON_SWAP_HIDDEN, ICON_SWAP_SHOWN } from "../ui";
import { useColorScheme } from "./colorScheme";

const BUTTON_CLASS =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-[background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-current/10 motion-reduce:transition-none";

interface IconProps {
  readonly className: string;
}

function SunIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  );
}

/**
 * Flips the page between the light and dark themes; the icon and the name show what a click will switch to. Both icons
 * stay mounted in one grid cell and cross-fade; `data-icon-swap` exempts them from the pause index.css puts on every other
 * transition during the flip.
 */
export function ThemeToggle() {
  const { scheme, toggle } = useColorScheme();
  const isDark = scheme === "dark";
  return (
    <button type="button" className={BUTTON_CLASS} aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"} onClick={toggle}>
      <span data-icon-swap="" data-state={scheme} className="inline-grid">
        <SunIcon className={`${ICON_SWAP_CLASS} ${isDark ? ICON_SWAP_SHOWN : ICON_SWAP_HIDDEN}`} />
        <MoonIcon className={`${ICON_SWAP_CLASS} ${isDark ? ICON_SWAP_HIDDEN : ICON_SWAP_SHOWN}`} />
      </span>
    </button>
  );
}
