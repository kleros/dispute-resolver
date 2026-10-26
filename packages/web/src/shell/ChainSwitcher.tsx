import type { ChainConfig } from "@dispute-resolver/core";
import { useCallback, useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Link, useLocation } from "react-router";
import { SWITCHABLE_CHAINS, switchChainSegment, type ResolvedChain } from "../routing";
import { useNetworkSwitch, useWalletChainId } from "../wallet";
import { BAR_PILL, ChevronIcon, DROPDOWN_CLOSING_CLASS, DROPDOWN_OPEN_CLASS, useOutsidePress, usePresence } from "../ui";
import { asSentence, NOT_SWITCHED_TITLE } from "./ChainNoticeToasts";
import { CheckIcon } from "./icons";
import { BAR_FOCUS } from "./layout";
import { useToast } from "./ToastProvider";
import { isUnsupportedNetwork, UNSUPPORTED_NETWORK_LABEL } from "./unsupportedNetwork";

const TRIGGER_CLASS = `group inline-flex w-56 max-w-full min-w-0 items-center gap-2 aria-busy:cursor-progress ${BAR_PILL} ${BAR_FOCUS}`;
// The header points --dr-focus at the bar's ring colour, which would vanish on the white panel. The panel grows from the
// corner it is anchored to: its left edge below lg, its right edge from lg.
const PANEL_CLASS =
  "absolute left-0 z-50 mt-2 flex w-64 max-w-[calc(100vw-2rem)] origin-top-left flex-col rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground py-2 text-klerosUIComponentsPrimaryText shadow-default [--dr-focus:var(--klerosUIComponentsPrimaryBlue)] lg:left-auto lg:right-0 lg:origin-top-right";
const ITEM_CLASS =
  "flex h-10 w-full items-center gap-3 px-4 text-left text-sm text-klerosUIComponentsPrimaryText no-underline outline-offset-[-2px] hover:bg-klerosUIComponentsMediumBlue aria-[current=page]:font-semibold aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent";

/** On the bar: green on the page chain, neutral on a fallback chain. */
function dotTone(isPageChain: boolean): string {
  return isPageChain ? "bg-(--dr-success-bar)" : "bg-current/50";
}

function menuItems(list: HTMLUListElement | null): HTMLElement[] {
  return Array.from(list?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
}

interface NetworkMenuProps {
  readonly id: string;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly panelRef: RefObject<HTMLDivElement>;
  /** The menu is animating out: it takes no input and unmounts when its animation ends. */
  readonly closing: boolean;
  readonly onClose: (returnFocus: boolean) => void;
  readonly children: ReactNode;
}

function NetworkMenu({ id, rootRef, panelRef, closing, onClose, children }: NetworkMenuProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const items = menuItems(listRef.current);
    (items.find((item) => item.getAttribute("aria-current") === "page") ?? items.at(0))?.focus();
  }, []);

  const closeKeepingFocus = useCallback(() => {
    onClose(false);
  }, [onClose]);
  useOutsidePress(!closing, rootRef, closeKeepingFocus);

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = menuItems(listRef.current);
    const active = document.activeElement;
    const index = active instanceof HTMLElement ? items.indexOf(active) : -1;
    const focusAt = (position: number) => {
      items.at(((position % items.length) + items.length) % items.length)?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        focusAt(index + 1);
        break;
      case "ArrowUp":
        focusAt(index - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(items.length - 1);
        break;
      case "Escape":
        // The header's own Escape listener would also close the phone drawer behind the menu.
        event.stopPropagation();
        onClose(true);
        break;
      case "Tab":
        onClose(false);
        return;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div ref={panelRef} id={id} className={`${PANEL_CLASS} ${closing ? DROPDOWN_CLOSING_CLASS : DROPDOWN_OPEN_CLASS}`}>
      <ul ref={listRef} role="menu" aria-label="Network" onKeyDown={closing ? undefined : onKeyDown} className="flex flex-col">
        {children}
      </ul>
    </div>
  );
}

interface ChainSwitcherProps {
  readonly resolvedChain: ResolvedChain;
}

/**
 * The header's network pill. Without a wallet, or when the wallet is already on the chosen chain, a choice moves the page
 * to that chain and keeps the rest of the URL. With a wallet on another chain, the wallet is asked to switch and the app
 * follows the wallet once it does (a case page to that chain's Ongoing Disputes); a refusal changes nothing, since the
 * app already shows the wallet's chain, and any other failure is a toast. While any switch request waits, the chains take
 * no press. A long chain name truncates inside the pill; its accessible name always carries the full name. On the
 * unsupported-network screen the pill names no chain, since the page is on none. The pill is one width on every chain so
 * the controls after it never move; on a narrow phone row `max-w-full` lets it shrink and the name truncates.
 */
export function ChainSwitcher({ resolvedChain }: ChainSwitcherProps) {
  const { chain } = resolvedChain.page;
  const isPageChain = resolvedChain.kind === "page";
  const unsupported = isUnsupportedNetwork(resolvedChain);
  const location = useLocation();
  const walletChainId = useWalletChainId();
  const network = useNetworkSwitch();
  const toaster = useToast();
  const { phase, mountKey, panelRef, open: openMenu, close: closeMenu } = usePresence<HTMLDivElement>();
  const open = phase === "open";
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const switching = network.state.status === "switching";

  const close = useCallback(
    (returnFocus: boolean) => {
      closeMenu();
      if (returnFocus) triggerRef.current?.focus();
    },
    [closeMenu],
  );

  const item = (target: ChainConfig) => {
    const current = isPageChain && target.id === chain.id;
    const content = (
      <>
        <span className="min-w-0 flex-1 truncate">{target.name}</span>
        {current ? <CheckIcon className="size-4 shrink-0 text-klerosUIComponentsPrimaryBlue" /> : null}
      </>
    );
    const itemProps = {
      role: "menuitem",
      tabIndex: -1,
      "aria-current": current ? "page" : undefined,
      "aria-disabled": switching ? true : undefined,
      className: ITEM_CLASS,
    } as const;
    if (walletChainId !== undefined && walletChainId !== target.id) {
      return (
        <button
          type="button"
          {...itemProps}
          onClick={() => {
            if (switching) return;
            close(true);
            void network.switchTo(target.id).then((result) => {
              if (!result.ok && result.reason === "failed") toaster.show({ variant: "error", title: NOT_SWITCHED_TITLE, message: asSentence(result.message) });
            });
          }}
        >
          {content}
        </button>
      );
    }
    return (
      <Link
        {...itemProps}
        to={{ pathname: switchChainSegment(location.pathname, target.id), search: location.search, hash: location.hash }}
        onClick={(event) => {
          if (switching) {
            event.preventDefault();
            return;
          }
          close(true);
        }}
        onKeyDown={(event) => {
          if (event.key !== " ") return;
          event.preventDefault();
          event.currentTarget.click();
        }}
      >
        {content}
      </Link>
    );
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={unsupported ? "Network: unsupported. Change network" : `Network: ${chain.name}. Change network`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-busy={switching || undefined}
        className={TRIGGER_CLASS}
        onClick={() => {
          if (open) {
            close(false);
            return;
          }
          openMenu();
        }}
      >
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full group-aria-busy:opacity-40 ${dotTone(isPageChain)}`} />
        <span className="min-w-0 flex-1 truncate text-left">{unsupported ? UNSUPPORTED_NETWORK_LABEL : chain.name}</span>
        <ChevronIcon
          className={`size-4 shrink-0 transition-transform ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${open ? "-scale-y-100 duration-250" : "duration-150"}`}
        />
      </button>
      {phase === "closed" ? null : (
        <NetworkMenu key={mountKey} id={menuId} rootRef={rootRef} panelRef={panelRef} closing={phase === "closing"} onClose={close}>
          {SWITCHABLE_CHAINS.map((target) => (
            <li key={target.id} role="none">
              {item(target)}
            </li>
          ))}
        </NetworkMenu>
      )}
    </div>
  );
}
