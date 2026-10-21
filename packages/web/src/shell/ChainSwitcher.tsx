import { getChain, type ChainConfig, type ChainId } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Link, useLocation } from "react-router";
import { switchChainSegment, type ResolvedChain } from "../routing";
import { useNetworkSwitch, useWallet } from "../wallet";
import { CheckIcon, ChevronIcon } from "./icons";
import { BAR_FOCUS } from "./layout";

/** Only the production chains with a court are offered; a testnet page is reached by URL alone. */
const SWITCHABLE_CHAIN_IDS: readonly ChainId[] = [1, 100];

const SWITCHABLE_CHAINS: readonly ChainConfig[] = SWITCHABLE_CHAIN_IDS.map((id) => getChain(id)).filter((chain): chain is ChainConfig => chain !== undefined);

const TRIGGER_CLASS = `inline-flex h-10 min-w-0 items-center gap-2 rounded-full bg-current/10 px-3 text-sm font-semibold hover:bg-current/15 ${BAR_FOCUS}`;
// The header points --dr-focus at the bar's ring colour, which would vanish on the white panel.
const PANEL_CLASS =
  "absolute left-0 z-50 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground py-2 text-klerosUIComponentsPrimaryText shadow-(--dr-elevation) [--dr-focus:var(--klerosUIComponentsPrimaryBlue)] lg:left-auto lg:right-0";
const ITEM_CLASS =
  "flex h-10 w-full items-center gap-3 px-4 text-left text-sm text-klerosUIComponentsPrimaryText no-underline outline-offset-[-2px] hover:bg-klerosUIComponentsMediumBlue aria-[current=page]:font-semibold aria-disabled:cursor-not-allowed";

/** On the bar: green on the page chain, the warning shade while the wallet is elsewhere, neutral on a fallback chain. */
function dotTone(isPageChain: boolean, offerSwitch: boolean): string {
  if (offerSwitch) return "bg-(--dr-warning-bar)";
  return isPageChain ? "bg-(--dr-success-bar)" : "bg-current/50";
}

function menuItems(list: HTMLUListElement | null): HTMLElement[] {
  return Array.from(list?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
}

interface NetworkMenuProps {
  readonly id: string;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly onClose: (returnFocus: boolean) => void;
  readonly children: ReactNode;
}

function NetworkMenu({ id, rootRef, onClose, children }: NetworkMenuProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const items = menuItems(listRef.current);
    (items.find((item) => item.getAttribute("aria-current") === "page") ?? items.at(0))?.focus();
  }, []);

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) !== true) onClose(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
    };
  }, [rootRef, onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = menuItems(listRef.current);
    const index = items.findIndex((item) => item === document.activeElement);
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
    <div id={id} className={PANEL_CLASS}>
      <ul ref={listRef} role="menu" aria-label="Network" onKeyDown={onKeyDown} className="flex flex-col">
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
 * to that chain and keeps the rest of the URL. With a wallet on another chain, the wallet is asked to switch and the page
 * follows the wallet once it does; a refusal stays on this page and is said under the pill. A wallet away from the page
 * chain is also offered the switch back beside the pill.
 */
export function ChainSwitcher({ resolvedChain }: ChainSwitcherProps) {
  const { chain } = resolvedChain.page;
  const isPageChain = resolvedChain.kind === "page";
  const location = useLocation();
  const wallet = useWallet();
  const network = useNetworkSwitch();
  const [open, setOpen] = useState(false);
  const [shownChainId, setShownChainId] = useState(chain.id);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // A failure belongs to the page it happened on: once the page moves to another chain it no longer applies.
  if (shownChainId !== chain.id) {
    setShownChainId(chain.id);
    network.reset();
  }

  const walletChainId = wallet.status === "connected" ? wallet.chainId : undefined;
  const offerSwitch = walletChainId !== undefined && isPageChain && walletChainId !== chain.id;
  const switching = network.state.status === "switching";
  const failure = network.state.status === "failed" ? network.state.message : null;

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const item = (target: ChainConfig) => {
    const current = isPageChain && target.id === chain.id;
    const content = (
      <>
        <span className="min-w-0 flex-1 truncate">{target.name}</span>
        {current ? <CheckIcon className="size-4 shrink-0 text-klerosUIComponentsPrimaryBlue" /> : null}
      </>
    );
    const ariaCurrent = current ? "page" : undefined;
    const ariaDisabled = switching ? true : undefined;
    if (walletChainId !== undefined && walletChainId !== target.id) {
      return (
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          aria-current={ariaCurrent}
          aria-disabled={ariaDisabled}
          className={ITEM_CLASS}
          onClick={() => {
            if (switching) return;
            close(true);
            void network.switchTo(target.id);
          }}
        >
          {content}
        </button>
      );
    }
    return (
      <Link
        role="menuitem"
        tabIndex={-1}
        aria-current={ariaCurrent}
        aria-disabled={ariaDisabled}
        to={{ pathname: switchChainSegment(location.pathname, target.id), search: location.search, hash: location.hash }}
        className={ITEM_CLASS}
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
    <div className="flex min-w-0 flex-col items-start gap-1 lg:items-end">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div ref={rootRef} className="relative min-w-0">
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Network: ${chain.name}. Change network`}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            aria-busy={switching || undefined}
            className={TRIGGER_CLASS}
            onClick={() => {
              setOpen((current) => !current);
            }}
          >
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dotTone(isPageChain, offerSwitch)}`} />
            <span className="truncate">{chain.name}</span>
            <ChevronIcon className={`size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
          </button>
          {open ? (
            <NetworkMenu id={menuId} rootRef={rootRef} onClose={close}>
              {SWITCHABLE_CHAINS.map((target) => (
                <li key={target.id} role="none">
                  {item(target)}
                </li>
              ))}
            </NetworkMenu>
          ) : null}
        </div>
        {offerSwitch ? (
          <Button
            text={`Switch to ${chain.name}`}
            small
            isLoading={switching}
            isDisabled={switching}
            onPress={() => {
              void network.switchTo(chain.id);
            }}
          />
        ) : null}
      </div>
      {failure === null ? null : (
        <p role="alert" className="max-w-xs text-sm lg:text-right">
          {failure}
        </p>
      )}
    </div>
  );
}
