import { useCallback, useEffect, useId, useRef, type RefObject } from "react";
import { Button } from "@kleros/ui-components-library";
import type { Address, ChainConfig } from "@dispute-resolver/core";
import { getAddress } from "viem";
import { useDisconnect } from "wagmi";
import { AddressText, BAR_PILL, ChevronIcon, DROPDOWN_CLOSING_CLASS, DROPDOWN_OPEN_CLASS, Identicon, shortenAddress, useOutsidePress, usePresence } from "../ui";
import { chainName } from "./chains";

interface AccountMenuProps {
  readonly address: Address;
  readonly walletChainId: number;
  readonly chain: ChainConfig;
}

interface AccountPanelProps extends AccountMenuProps {
  readonly id: string;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly panelRef: RefObject<HTMLDialogElement>;
  /** The panel is animating out: it takes no input and unmounts when its animation ends. */
  readonly closing: boolean;
  readonly onClose: (returnFocus: boolean) => void;
}

/**
 * The library Button drawn as the bar's pill: its one icon slot carries the identicon and the chevron, which `order-last`
 * moves after the address. Below sm only the identicon and the chevron show; the address stays in the accessible name and
 * in the panel.
 */
const TRIGGER_CLASS = `${BAR_PILL} gap-2 py-0 [&>.button-text]:text-current [&>.button-text]:text-sm [&>.button-text]:leading-5 max-sm:[&>.button-text]:hidden`;
const CHEVRON_CLASS = "order-last size-4 shrink-0 transition-transform ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";
// The header points --dr-focus at the bar's ring colour, which would vanish on the white panel.
const PANEL_CLASS =
  "absolute right-0 left-auto z-50 mt-2 flex w-72 max-w-[calc(100vw-2rem)] origin-top-right flex-col gap-4 rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-4 text-klerosUIComponentsPrimaryText shadow-default [--dr-focus:var(--klerosUIComponentsPrimaryBlue)] print:hidden";

function AccountPanel({ id, rootRef, panelRef, closing, onClose, address, walletChainId, chain }: AccountPanelProps) {
  const { disconnect } = useDisconnect();

  const closeKeepingFocus = useCallback(() => {
    onClose(false);
  }, [onClose]);
  useOutsidePress(!closing, rootRef, closeKeepingFocus);
  useEffect(() => {
    if (closing) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(true);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [closing, onClose]);

  return (
    <dialog ref={panelRef} id={id} open aria-label="Account" data-origin="top-right" className={`${PANEL_CLASS} ${closing ? DROPDOWN_CLOSING_CLASS : DROPDOWN_OPEN_CLASS}`}>
      <div className="flex min-w-0 items-center gap-3">
        <Identicon address={address} size={32} />
        <AddressText address={address} chain={chain} className="min-w-0 text-sm" />
      </div>
      <p className="text-sm text-klerosUIComponentsSecondaryText">
        Wallet network: <span className="font-semibold text-klerosUIComponentsPrimaryText">{chainName(walletChainId)}</span>
      </p>
      <Button
        text="Disconnect"
        variant="secondary"
        small
        className="self-center"
        onPress={() => {
          onClose(false);
          disconnect();
        }}
      />
    </dialog>
  );
}

/** AppKit's account view is never used: it reads balances through Reown's RPC rather than the configured one. */
export function AccountMenu(props: AccountMenuProps) {
  const { phase, mountKey, panelRef, open: openPanel, close: closePanel } = usePresence<HTMLDialogElement>();
  const open = phase === "open";
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(
    (returnFocus: boolean) => {
      closePanel();
      if (returnFocus) rootRef.current?.querySelector<HTMLButtonElement>("button[aria-controls]")?.focus();
    },
    [closePanel],
  );

  const short = shortenAddress(getAddress(props.address));
  return (
    <div ref={rootRef} className="relative">
      <Button
        text={short}
        small
        className={TRIGGER_CLASS}
        icon={
          <>
            <Identicon address={props.address} size={20} />
            <ChevronIcon className={`${CHEVRON_CLASS} ${open ? "-scale-y-100 duration-250" : "duration-150"}`} />
          </>
        }
        aria-label={`Account ${short}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onPress={() => {
          if (open) closePanel();
          else openPanel();
        }}
      />
      {phase === "closed" ? null : <AccountPanel key={mountKey} {...props} id={panelId} rootRef={rootRef} panelRef={panelRef} closing={phase === "closing"} onClose={close} />}
    </div>
  );
}
