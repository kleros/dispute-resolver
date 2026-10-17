import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink } from "react-router";
import { paths, type ResolvedChain } from "../routing";
import { ChainIndicator, WalletControl } from "../wallet";
import { BrandLogo } from "./BrandLogo";
import { CloseIcon, MenuIcon } from "./icons";
import { BAR_FOCUS, BAR_FOCUS_TOKEN, BAR_TEXT, CONTENT, GUTTER } from "./layout";

interface HeaderProps {
  readonly resolvedChain: ResolvedChain;
  /** A wallet is connected: the Create link is shown only then (spec §2.3). */
  readonly connected: boolean;
}

const NAV_LINK = `block px-3 py-2 whitespace-nowrap text-base transition-opacity lg:py-1 ${BAR_FOCUS}`;

function navLinkClass({ isActive }: { readonly isActive: boolean }): string {
  return isActive ? `${NAV_LINK} font-semibold underline decoration-2 underline-offset-8` : `${NAV_LINK} opacity-85 hover:opacity-100`;
}

/**
 * The sticky header bar (spec §2.3, ARCHITECTURE.md §11.2): the brand and the navigation on the left, the chain and the
 * wallet control on the right. Below `lg` everything but the brand collapses into a menu panel, as in the v2 apps. Every
 * link is built from the resolved chain, so error screens never link to `/undefined` (D-45).
 */
export function Header({ resolvedChain, connected }: HeaderProps) {
  const { chainId, chain } = resolvedChain.page;
  const [menuOpen, setMenuOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setMenuOpen(false);
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <header className={`sticky top-0 z-40 bg-klerosUIComponentsPrimaryPurple dark:bg-klerosUIComponentsLightBlue ${BAR_TEXT} ${BAR_FOCUS_TOKEN} ${GUTTER}`}>
      <div className={`${CONTENT} relative flex h-16 items-center gap-3 lg:gap-8`}>
        <Link to={paths.chainRoot(chainId)} onClick={close} className={`inline-flex shrink-0 ${BAR_FOCUS}`}>
          <BrandLogo />
        </Link>
        <button
          ref={toggleRef}
          type="button"
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-controls={panelId}
          onClick={() => {
            setMenuOpen((open) => !open);
          }}
          className={`ml-auto inline-flex size-11 shrink-0 items-center justify-center lg:hidden ${BAR_FOCUS}`}
        >
          {menuOpen ? <CloseIcon className="size-6" /> : <MenuIcon className="size-6" />}
        </button>
        <div
          id={panelId}
          className={`${menuOpen ? "flex" : "hidden"} flex-col gap-4 lg:flex lg:flex-1 lg:flex-row lg:items-center lg:justify-between lg:gap-8 max-lg:absolute max-lg:inset-x-[-1rem] max-lg:top-full max-lg:border-b max-lg:border-klerosUIComponentsStroke max-lg:bg-klerosUIComponentsPrimaryPurple max-lg:px-4 max-lg:pt-2 max-lg:pb-6 max-lg:shadow-(--dr-elevation) dark:max-lg:bg-klerosUIComponentsLightBlue`}
        >
          <nav aria-label="Main">
            <ul className="flex flex-col lg:flex-row lg:items-center lg:gap-2">
              <li>
                <NavLink to={paths.ongoing(chainId)} onClick={close} className={navLinkClass}>
                  Ongoing Disputes
                </NavLink>
              </li>
              {connected ? (
                <li>
                  <NavLink to={paths.create(chainId)} onClick={close} className={navLinkClass}>
                    Create
                  </NavLink>
                </li>
              ) : null}
              <li>
                <NavLink to={paths.cases(chainId)} onClick={close} className={navLinkClass}>
                  Interact
                </NavLink>
              </li>
            </ul>
          </nav>
          <div className="flex min-w-0 flex-col items-start gap-3 px-3 lg:flex-row lg:items-center lg:gap-6 lg:px-0">
            <ChainIndicator chain={chain} isPageChain={resolvedChain.kind === "page"} />
            <WalletControl chain={chain} />
          </div>
        </div>
      </div>
    </header>
  );
}
