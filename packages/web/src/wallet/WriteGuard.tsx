import { Button } from "@kleros/ui-components-library";
import { useEffect, useRef } from "react";
import { Notice } from "../ui";
import { chainName } from "./chains";
import { ConnectButton } from "./ConnectButton";
import { useNetworkSwitch, type NetworkSwitch } from "./switchChain";
import type { WriteGuardActionProps, WriteGuardNoticeProps } from "./types";
import { useWallet } from "./useWallet";
import { writeMessage } from "./writeMessages";

interface SwitchOfferProps {
  readonly pageChainId: number;
  readonly network: NetworkSwitch;
  /**
   * On a toast's PrimaryBlue surface: the secondary button, since a primary face of the same blue would vanish, and every
   * line in the toast's own text colour, set on the line itself since the library's base layer paints every `p` in
   * PrimaryText; the Error token on that surface is far below AA contrast too.
   */
  readonly inToast?: boolean;
}

/** In a toast, the toast's own text colour (see `SwitchOfferProps.inToast`). */
const TOAST_LINE_CLASS = "text-sm text-klerosUIComponentsWhiteBackground";

function lineClass(inToast: boolean): string {
  return inToast ? TOAST_LINE_CLASS : "text-sm";
}

function SwitchOffer({ pageChainId, network, inToast = false }: SwitchOfferProps) {
  const wallet = useWallet();
  if (wallet.status === "connected" && wallet.chainId === pageChainId) {
    return <p className={lineClass(inToast)}>Your wallet is now on {chainName(pageChainId)}. Try again.</p>;
  }
  // Any waiting request, whatever its chain, replaces the button: the wallet answers one request at a time.
  if (network.state.status === "switching") {
    return <p className={lineClass(inToast)}>A switch to {chainName(network.state.chainId)} is waiting in your wallet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        text={`Switch to ${chainName(pageChainId)}`}
        small
        variant={inToast ? "secondary" : "primary"}
        className="self-start"
        onPress={() => {
          void network.switchTo(pageChainId);
        }}
      />
      {network.state.status === "failed" ? (
        <p role="alert" className={inToast ? TOAST_LINE_CLASS : "text-sm text-klerosUIComponentsError"}>
          {network.state.message}
        </p>
      ) : null}
    </div>
  );
}

function ConnectOffer({ pageChainId, inToast = false }: { readonly pageChainId: number | undefined; readonly inToast?: boolean }) {
  const wallet = useWallet();
  if (wallet.status === "connected") return <p className={lineClass(inToast)}>Wallet connected. Try again.</p>;
  return <ConnectButton chainId={pageChainId} variant={inToast ? "secondary" : "primary"} />;
}

/**
 * The live part of a guard's toast: the switch of `wrong-chain`, the Connect of `needs-wallet` or of a wallet that
 * disconnected since, which a switch could not reach. `onResolved` runs once, when the wallet can sign on the page
 * chain, so the toast that holds it can replace its now stale refusal.
 */
export function WriteGuardAction({ guard, onResolved }: WriteGuardActionProps) {
  const network = useNetworkSwitch();
  const wallet = useWallet();
  const resolved = useRef(false);
  const ready = wallet.status === "connected" && (guard.phase === "needs-wallet" || wallet.chainId === guard.pageChainId);
  useEffect(() => {
    if (!ready || resolved.current) return;
    resolved.current = true;
    onResolved();
  }, [ready, onResolved]);
  if (guard.phase === "wrong-chain" && wallet.status === "connected") return <SwitchOffer pageChainId={guard.pageChainId} network={network} inToast />;
  return <ConnectOffer pageChainId={guard.pageChainId} inToast />;
}

/**
 * Why an action is locked before anything was tried, in place next to it, with the live switch or Connect. A refused
 * write is reported in the toasts instead.
 */
export function WriteGuardNotice({ guard, className }: WriteGuardNoticeProps) {
  const network = useNetworkSwitch();
  const message = writeMessage(guard, { beforeAttempt: true, switching: network.state.status === "switching" });
  return (
    <div className={className === undefined ? "flex flex-col gap-2" : `flex flex-col gap-2 ${className}`} aria-live="polite">
      <Notice reveal variant={message.variant} title={message.title} body={message.body} />
      {guard.phase === "wrong-chain" ? <SwitchOffer pageChainId={guard.pageChainId} network={network} /> : <ConnectOffer pageChainId={guard.pageChainId} />}
    </div>
  );
}
