import { useEffect, useId, useRef } from "react";
import { Link, NavLink } from "react-router";
import { paths, type ResolvedChain } from "../routing";
import { ICON_SWAP_CLASS, ICON_SWAP_HIDDEN, ICON_SWAP_SHOWN, useMediaQuery, useOutsidePress, usePresence, XL_MEDIA_QUERY, type PresencePhase } from "../ui";
import { WalletControl } from "../wallet";
import { BrandLogo } from "./BrandLogo";
import { ChainSwitcher } from "./ChainSwitcher";
import { CloseIcon, MenuIcon } from "./icons";
import { BAR_FOCUS, BAR_SURFACE, CONTENT, GUTTER } from "./layout";
import { ThemeToggle } from "./ThemeToggle";

interface HeaderProps {
  readonly resolvedChain: ResolvedChain;
}

const NAV_LINK = `block px-3 py-2 whitespace-nowrap text-base transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] xl:py-1 ${BAR_FOCUS}`;

// Below lg a full-bleed drawer under the two-row bar; from lg to xl a card under the Menu button; from xl the inline nav.
const PANEL_CLASS = [
  "order-4 flex-col xl:order-2 xl:flex xl:flex-1 xl:flex-row xl:items-center",
  "max-xl:absolute max-xl:top-full max-xl:border-klerosUIComponentsStroke max-xl:bg-klerosUIComponentsPrimaryPurple max-xl:shadow-default max-xl:print:hidden dark:max-xl:bg-klerosUIComponentsLightBlue",
  "max-lg:inset-x-[-1rem] max-lg:border-b max-lg:px-4 max-lg:pt-2 max-lg:pb-6",
  "lg:max-xl:right-0 lg:max-xl:w-64 lg:max-xl:rounded-base lg:max-xl:border lg:max-xl:p-2",
  // The panel grows from the Menu button's corner as a card, from the bar's middle as the full-width drawer.
  "max-lg:origin-top lg:max-xl:origin-top-right",
].join(" ");

// Scoped below xl: the inline navigation from xl never animates, and with no animation running a close ends at once.
const PANEL_OPEN_CLASS = "max-xl:animate-scale-in";
const PANEL_CLOSING_CLASS = "max-xl:pointer-events-none max-xl:animate-scale-out max-xl:opacity-0";

function panelClass(phase: PresencePhase): string {
  if (phase === "closed") return `hidden ${PANEL_CLASS}`;
  return `flex ${PANEL_CLASS} ${phase === "open" ? PANEL_OPEN_CLASS : PANEL_CLOSING_CLASS}`;
}

const NAV_LINKS = [
  ["ongoing", "Ongoing Disputes"],
  ["cases", "Case Lookup"],
  ["create", "Create"],
] as const;

function navLinkClass({ isActive }: { readonly isActive: boolean }): string {
  return isActive ? `${NAV_LINK} font-semibold underline decoration-2 underline-offset-8` : `${NAV_LINK} opacity-85 hover:opacity-100`;
}

/**
 * Stacks under the library's modal overlay (z-20): where the document scrolls, a higher bar would stay pressable over an
 * open modal and hide its top. Every link is built from the resolved chain, so error screens never link to `/undefined`.
 * Printed it is relative: Chromium prints a sticky box moved down by the scroll offset it had on screen.
 */
export function Header({ resolvedChain }: HeaderProps) {
  const { chainId, chain } = resolvedChain.page;
  const { phase, mountKey, panelRef, open: openMenu, close } = usePresence<HTMLDivElement>();
  const menuOpen = phase === "open";
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const barRowRef = useRef<HTMLDivElement>(null);
  const inlineNav = useMediaQuery(XL_MEDIA_QUERY);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen, close]);
  // The bar row holds the panel and the Menu button, whose own click toggles the panel. From xl the panel is the inline
  // navigation, which a menu left open on a narrower window must not turn into a layer that swallows a press.
  useOutsidePress(menuOpen && !inlineNav, barRowRef, close);

  return (
    <>
      {/* Over the page and under the header, so the bar stays clear; a press on it is an outside press. It leaves with the panel. */}
      {phase === "closed" ? null : (
        <div
          aria-hidden="true"
          className={`fixed inset-0 z-5 bg-black/30 lg:hidden print:hidden ${menuOpen ? "animate-t-overlay-in" : "pointer-events-none animate-t-overlay-out"}`}
        />
      )}
      <header className={`sticky top-0 z-10 print:relative ${BAR_SURFACE}`}>
        <div className={GUTTER}>
          <div ref={barRowRef} className={`${CONTENT} relative flex flex-wrap items-center gap-x-3 lg:h-16 lg:flex-nowrap lg:gap-8`}>
            <Link to={paths.chainRoot(chainId)} onClick={close} className={`order-1 inline-flex h-16 shrink-0 items-center ${BAR_FOCUS}`}>
              <BrandLogo />
            </Link>
            <button
              ref={toggleRef}
              type="button"
              aria-label="Menu"
              aria-expanded={menuOpen}
              aria-controls={panelId}
              onClick={() => {
                if (menuOpen) close();
                else openMenu();
              }}
              className={`order-2 ml-auto inline-flex size-11 shrink-0 items-center justify-center lg:order-3 lg:ml-0 xl:hidden ${BAR_FOCUS}`}
            >
              <span data-icon-swap="" data-state={menuOpen ? "close" : "menu"} className="inline-grid">
                <MenuIcon className={`size-6 ${ICON_SWAP_CLASS} ${menuOpen ? ICON_SWAP_HIDDEN : ICON_SWAP_SHOWN}`} />
                <CloseIcon className={`size-6 ${ICON_SWAP_CLASS} ${menuOpen ? ICON_SWAP_SHOWN : ICON_SWAP_HIDDEN}`} />
              </span>
            </button>
            <div key={mountKey} ref={panelRef} id={panelId} className={panelClass(phase)}>
              <nav aria-label="Main">
                <ul className="flex flex-col xl:flex-row xl:items-center xl:gap-2">
                  {NAV_LINKS.map(([page, label]) => (
                    <li key={label}>
                      <NavLink to={paths[page](chainId)} onClick={close} className={navLinkClass}>
                        {label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
            <div className="order-3 flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-2 pb-3 sm:gap-x-3 lg:order-2 lg:ml-auto lg:w-auto lg:flex-nowrap lg:gap-4 lg:pb-0 xl:order-3 xl:ml-0">
              <div className="min-w-24 flex-1 basis-0 lg:min-w-0 lg:flex-initial lg:basis-auto">
                <ChainSwitcher resolvedChain={resolvedChain} />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-4">
                <ThemeToggle />
                <WalletControl chain={chain} />
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
