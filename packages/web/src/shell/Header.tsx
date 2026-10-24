import { useEffect, useId, useRef } from "react";
import { Link, NavLink } from "react-router";
import { paths, type ResolvedChain } from "../routing";
import { ICON_SWAP_CLASS, ICON_SWAP_HIDDEN, ICON_SWAP_SHOWN, usePresence, type PresencePhase } from "../ui";
import { WalletControl } from "../wallet";
import { BrandLogo } from "./BrandLogo";
import { ChainSwitcher } from "./ChainSwitcher";
import { CloseIcon, MenuIcon } from "./icons";
import { BAR_FOCUS, BAR_FOCUS_TOKEN, BAR_TEXT, CONTENT, GUTTER } from "./layout";
import { ThemeToggle } from "./ThemeToggle";

interface HeaderProps {
  readonly resolvedChain: ResolvedChain;
}

const NAV_LINK = `block px-3 py-2 whitespace-nowrap text-base transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] xl:py-1 ${BAR_FOCUS}`;

// Below lg a full-bleed drawer under the two-row bar; from lg to xl a card under the Menu button; from xl the inline nav.
const PANEL_CLASS = [
  "order-4 flex-col xl:order-2 xl:flex xl:flex-1 xl:flex-row xl:items-center",
  "max-xl:absolute max-xl:top-full max-xl:border-klerosUIComponentsStroke max-xl:bg-klerosUIComponentsPrimaryPurple max-xl:shadow-(--dr-elevation) dark:max-xl:bg-klerosUIComponentsLightBlue",
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

function navLinkClass({ isActive }: { readonly isActive: boolean }): string {
  return isActive ? `${NAV_LINK} font-semibold underline decoration-2 underline-offset-8` : `${NAV_LINK} opacity-85 hover:opacity-100`;
}

/**
 * The sticky header bar. From `xl` it is the brand and the navigation, then the network pill, the theme toggle and the
 * wallet control.
 * Below `xl` only the navigation collapses into a menu panel: from `lg` it is a card under the Menu button at the end of
 * the one-row bar; below `lg` the controls take a second row, so changing chain or connecting never needs the menu, and
 * a scrim dims the page under the drawer. A press outside the bar closes the panel.
 * Every link is built from the resolved chain, so error screens never link to `/undefined`.
 */
export function Header({ resolvedChain }: HeaderProps) {
  const { chainId, chain } = resolvedChain.page;
  const { phase, mountKey, panelRef, open: openMenu, close } = usePresence<HTMLDivElement>();
  const menuOpen = phase === "open";
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const barRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      toggleRef.current?.focus();
    };
    // The bar row holds the panel and the Menu button, whose own click toggles the panel.
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && barRowRef.current?.contains(event.target) !== true) close();
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePress);
    };
  }, [menuOpen, close]);

  return (
    <>
      {/* Under the header's z-40 so the bar stays clear; a press on it is an outside press. It leaves with the panel. */}
      {phase === "closed" ? null : (
        <div aria-hidden="true" className={`fixed inset-0 z-30 bg-black/30 lg:hidden ${menuOpen ? "animate-t-overlay-in" : "pointer-events-none animate-t-overlay-out"}`} />
      )}
      <header className={`sticky top-0 z-40 bg-klerosUIComponentsPrimaryPurple dark:bg-klerosUIComponentsLightBlue ${BAR_TEXT} ${BAR_FOCUS_TOKEN}`}>
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
                  <li>
                    <NavLink to={paths.ongoing(chainId)} onClick={close} className={navLinkClass}>
                      Ongoing Disputes
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to={paths.cases(chainId)} onClick={close} className={navLinkClass}>
                      Case Lookup
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to={paths.create(chainId)} onClick={close} className={navLinkClass}>
                      Create
                    </NavLink>
                  </li>
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
