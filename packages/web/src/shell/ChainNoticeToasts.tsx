import { getChain } from "@dispute-resolver/core";
import { useCallback, type ReactNode } from "react";
import { ChainNoticeProvider, type ChainNotice } from "../routing";
import { useToast } from "./ToastProvider";
import type { ToastInput } from "./types";

export const NOT_SWITCHED_TITLE = "Network not switched";

/** The user is often still in the wallet when a notice fires, so it outlasts the default toast; a failure has more to read. */
const NEUTRAL_NOTICE_MS = 10_000;
const ERROR_NOTICE_MS = 15_000;

/** A wallet's message may end without a full stop; the toast reads it as a sentence followed by another. */
export function asSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function chainLabel(chainId: number): string {
  return getChain(chainId)?.name ?? `chain ${String(chainId)}`;
}

/**
 * The toast for a notice, or `null` for a declined switch away from an unconfigured wallet chain: the app then shows the
 * unsupported-network screen, which says it all. Chain names come from the configuration and the dispute ID is parsed, so
 * no URL text reaches the toast.
 */
export function chainNoticeToast(notice: ChainNotice): ToastInput | null {
  const walletChain = getChain(notice.walletChainId);
  if (walletChain === undefined) {
    return notice.outcome === "failed" ? { variant: "error", title: NOT_SWITCHED_TITLE, message: asSentence(notice.reason), autoHideMs: ERROR_NOTICE_MS } : null;
  }
  const shown =
    notice.disputeId === null
      ? `The app is now showing ${walletChain.name}.`
      : `Dispute ${notice.disputeId.toString()} is on ${chainLabel(notice.pageChainId)}, so the app is showing Ongoing Disputes on ${walletChain.name}.`;
  if (notice.outcome === "declined") return { variant: "sync", title: `Wallet stayed on ${walletChain.name}`, message: shown, autoHideMs: NEUTRAL_NOTICE_MS };
  return { variant: "error", title: NOT_SWITCHED_TITLE, message: `${asSentence(notice.reason)} ${shown}`, autoHideMs: ERROR_NOTICE_MS };
}

/**
 * Shows routing's chain notices as toasts. The library's push message has no neutral variant; `sync` is the neutral
 * one, announced as a status, and a failure is an error, announced as an alert.
 */
export function ChainNoticeToasts({ children }: { readonly children?: ReactNode }) {
  const toaster = useToast();
  const onNotice = useCallback(
    (notice: ChainNotice) => {
      const toast = chainNoticeToast(notice);
      if (toast !== null) toaster.show(toast);
    },
    [toaster],
  );
  return <ChainNoticeProvider onNotice={onNotice}>{children}</ChainNoticeProvider>;
}
