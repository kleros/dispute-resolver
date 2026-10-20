import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { Button } from "@kleros/ui-components-library";
import type { Address, ChainConfig } from "@dispute-resolver/core";
import { getAddress } from "viem";
import { useDisconnect } from "wagmi";
import { AddressText, Identicon, shortenAddress } from "../ui";
import { chainName } from "./chains";

interface AccountMenuProps {
  readonly address: Address;
  readonly walletChainId: number;
  readonly chain: ChainConfig;
}

interface AccountPanelProps extends AccountMenuProps {
  readonly id: string;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly onClose: (returnFocus: boolean) => void;
}

/** The open panel: closes on Escape (focus back on the trigger) and on a pointer press outside the menu. */
function AccountPanel({ id, rootRef, onClose, address, walletChainId, chain }: AccountPanelProps) {
  const { disconnect } = useDisconnect();

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) !== true) onClose(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(true);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [rootRef, onClose]);

  return (
    <div
      id={id}
      role="dialog"
      aria-label="Account"
      className="absolute left-0 z-50 lg:left-auto lg:right-0 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-4 text-klerosUIComponentsPrimaryText shadow-(--dr-elevation)"
    >
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
        className="self-start"
        onPress={() => {
          onClose(false);
          disconnect();
        }}
      />
    </div>
  );
}

/**
 * The connected account's own menu (ARCHITECTURE.md §11.2): the address with copy and explorer link, the wallet's
 * network, and Disconnect. AppKit's account view is never used: it reads balances through Reown's RPC (A13).
 */
export function AccountMenu(props: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) rootRef.current?.querySelector<HTMLButtonElement>("button[aria-controls]")?.focus();
  }, []);

  const short = shortenAddress(getAddress(props.address));
  return (
    <div ref={rootRef} className="relative">
      <Button
        text={short}
        variant="secondary"
        small
        icon={<Identicon address={props.address} size={20} className="mr-2" />}
        aria-label={`Account ${short}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onPress={() => {
          setOpen((current) => !current);
        }}
      />
      {open ? <AccountPanel {...props} id={panelId} rootRef={rootRef} onClose={close} /> : null}
    </div>
  );
}
