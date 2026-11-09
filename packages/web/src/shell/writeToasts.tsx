import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";
import {
  WriteGuardAction,
  WriteObserverProvider,
  chainName,
  writeMessage,
  type NeedsWalletGuard,
  type WriteObserver,
  type WriteProgress,
  type WriteStatus,
  type WriteWording,
  type WrongChainGuard,
} from "../wallet";
import { useToast } from "./ToastProvider";
import type { ToastInput, ToastLink } from "./types";

/** Long enough to read the outcome and reach its link; a hidden page or a hovered toast pauses it anyway. */
const OUTCOME_MS = 10_000;

const EXPLORER_LABEL = "View the transaction on the block explorer";

const MINED_FALLBACK = "The transaction was mined.";

type Guard = NeedsWalletGuard | WrongChainGuard;
type InFlight = Extract<WriteStatus, { readonly phase: "pending" | "submitted" }>;
type Outcome = Extract<WriteStatus, { readonly phase: "mined" | "failed" | "rejected" }>;
type CheckEnd = Extract<WriteStatus, { readonly phase: "refused" | "refused-by-contract" | "insufficient-funds" | "account-changed" }>;
type Mined = Extract<WriteStatus, { readonly phase: "mined" }>;

/** The ends at which nothing reached the chain: the next press of the same control takes their toast over. */
const NOTHING_SENT: ReadonlySet<WriteStatus["phase"]> = new Set([
  "refused",
  "needs-wallet",
  "wrong-chain",
  "refused-by-contract",
  "insufficient-funds",
  "account-changed",
  "rejected",
]);

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function counted(title: string, progress: WriteProgress | undefined): string {
  return progress === undefined || progress.total < 2 ? title : `${title} (${String(progress.index + 1)} of ${String(progress.total)})`;
}

/** A sequence that stops after a confirmed transaction says so: the toast's link no longer shows the earlier ones. */
function partialSuffix(progress: WriteProgress | undefined): string {
  if (progress === undefined || progress.index < 1) return "";
  return progress.index === 1 ? " The first transaction went through." : ` The first ${String(progress.index)} transactions went through.`;
}

function isLastItem(progress: WriteProgress | undefined): boolean {
  return progress === undefined || progress.index === progress.total - 1;
}

function isGuard(status: WriteStatus): status is Guard {
  return status.phase === "needs-wallet" || status.phase === "wrong-chain";
}

/** A `done` that cannot be read from the receipt still leaves a mined transaction a success. */
function doneText(wording: WriteWording, status: Mined): string {
  if (typeof wording.done === "string") return wording.done;
  try {
    return wording.done(status.receipt);
  } catch {
    return MINED_FALLBACK;
  }
}

function explorerLink(explorerUrl: string | null): { readonly link?: ToastLink } {
  return explorerUrl === null ? {} : { link: { href: explorerUrl, label: EXPLORER_LABEL } };
}

function inFlightToast(status: InFlight, { doing }: WriteWording, progress: WriteProgress | undefined): ToastInput {
  if (status.phase === "pending") return { variant: "sync", title: counted("Waiting for your wallet", progress), message: `Confirm ${doing} in your wallet.`, autoHideMs: null };
  return {
    variant: "sync",
    title: counted("Transaction submitted", progress),
    message: `${capitalize(doing)}. Waiting for it to be mined.`,
    ...explorerLink(status.explorerUrl),
    autoHideMs: null,
  };
}

function outcomeToast(status: Outcome, wording: WriteWording, progress: WriteProgress | undefined): ToastInput {
  const partial = partialSuffix(progress);
  switch (status.phase) {
    case "mined":
      return {
        variant: "success",
        title: counted("Transaction confirmed", progress),
        message: doneText(wording, status),
        ...explorerLink(status.explorerUrl),
        autoHideMs: isLastItem(progress) ? OUTCOME_MS : null,
      };
    case "failed":
      return {
        variant: "error",
        title: counted("Transaction failed", progress),
        message: `${capitalize(wording.doing)} failed. ${status.message}${partial}`,
        ...explorerLink(status.explorerUrl),
        autoHideMs: null,
      };
    case "rejected":
      return {
        variant: "sync",
        title: counted("Transaction cancelled", progress),
        message: `You declined ${wording.doing} in your wallet. Nothing was sent.${partial}`,
        autoHideMs: OUTCOME_MS,
      };
  }
}

function checkEndMessage(status: CheckEnd, doing: string): string {
  switch (status.phase) {
    case "refused-by-contract":
      return status.reason === null ? `Nothing was sent for ${doing}.` : `Nothing was sent for ${doing}. The contract's answer: “${status.reason}”`;
    case "insufficient-funds":
      return `Your wallet's balance does not cover ${doing}. Nothing was sent.`;
    case "account-changed":
      return `Your wallet's account changed while ${doing} was checked. Nothing was sent. Try again.`;
    case "refused":
      return writeMessage(status).body;
  }
}

function checkEndToast(status: CheckEnd, { doing }: WriteWording, progress: WriteProgress | undefined): ToastInput {
  return { variant: "error", title: counted(writeMessage(status).title, progress), message: `${checkEndMessage(status, doing)}${partialSuffix(progress)}`, autoHideMs: null };
}

/** A wrong network keeps the error variant's icon and role but not its red: it asks for a switch, it is not a failure. */
function guardLook(guard: Guard): Pick<ToastInput, "variant" | "surface"> {
  return guard.phase === "wrong-chain" ? { variant: "error", surface: "primary" } : { variant: "sync" };
}

/**
 * Without the switch request the body never goes stale: the action row carries the live part, a button or the line
 * saying a switch waits in the wallet.
 */
function guardToast(status: Guard, progress: WriteProgress | undefined): ToastInput {
  const message = writeMessage(status, { switching: true });
  return {
    ...guardLook(status),
    title: counted(message.title, progress),
    message: `${message.body}${partialSuffix(progress)}`,
    autoHideMs: null,
  };
}

/**
 * The toast of one write status, `null` while the pressed button's own busy state says it all (`idle`, `checking`). A
 * guard's toast comes without its action, which `WriteToasts` adds. In-flight toasts and every error stay until
 * closed; a confirmed sequence closes only after its last transaction.
 */
export function writeToast(status: WriteStatus, wording: WriteWording, progress?: WriteProgress): ToastInput | null {
  switch (status.phase) {
    case "idle":
    case "checking":
      return null;
    case "pending":
    case "submitted":
      return inFlightToast(status, wording, progress);
    case "mined":
    case "failed":
    case "rejected":
      return outcomeToast(status, wording, progress);
    case "needs-wallet":
    case "wrong-chain":
      return guardToast(status, progress);
    default:
      return checkEndToast(status, wording, progress);
  }
}

/** A guard's toast once the wallet can sign on the page chain: nothing was sent, so the press is to be made again. */
export function resolvedGuardToast(guard: Guard, { doing }: WriteWording, progress?: WriteProgress): ToastInput {
  const partial = partialSuffix(progress);
  if (guard.phase === "needs-wallet") return { variant: "success", title: counted("Wallet connected", progress), message: `Try ${doing} again.${partial}`, autoHideMs: OUTCOME_MS };
  return {
    variant: "success",
    title: counted("Network switched", progress),
    message: `Your wallet is now on ${chainName(guard.pageChainId)}. Try ${doing} again.${partial}`,
    autoHideMs: OUTCOME_MS,
  };
}

/** A guard the wallet answered after the app moved to another chain: a switch back would be wrong, so it offers none. */
export function movedGuardToast(guard: Guard, { doing }: WriteWording, progress?: WriteProgress): ToastInput {
  const look = guardLook(guard);
  return {
    ...look,
    title: counted(writeMessage(guard, { switching: true }).title, progress),
    message: `Nothing was sent for ${doing}. The app has moved to another network.${partialSuffix(progress)}`,
    autoHideMs: look.variant === "error" ? null : OUTCOME_MS,
  };
}

function chainSegment(pathname: string): string | undefined {
  return pathname.split("/")[1];
}

interface SourceToast {
  readonly id: number;
  /** Nothing of the attempt reached the chain, so the next press of the same control takes the toast over. */
  readonly replaceable: boolean;
}

/** An open guard toast: the page chain its switch serves, and what becomes of the toast once the page leaves it. */
interface OpenGuard {
  readonly chainId: number;
  readonly leave: () => void;
}

/**
 * Turns every write into one toast per press, updated in place through its phases from the write's own chain, so an
 * outcome is shown even when the pressing control is gone. A guard's toast carries the live switch or Connect, becomes
 * a done fact once the wallet can sign, and closes when the page moves to another chain, unless its sequence already
 * sent a transaction; a transaction's toast is never closed by navigation.
 */
export function WriteToasts({ children }: { readonly children?: ReactNode }) {
  const toaster = useToast();
  const { pathname } = useLocation();
  const lastBySource = useRef(new Map<string, SourceToast>());
  const openGuards = useRef(new Map<number, OpenGuard>());
  // Set at mount too, so a report before the first effect never reads as a moved page.
  const routeSegment = useRef(chainSegment(pathname));

  useEffect(() => {
    const segment = chainSegment(pathname);
    routeSegment.current = segment;
    for (const [id, guard] of openGuards.current) {
      if (segment === String(guard.chainId)) continue;
      guard.leave();
      openGuards.current.delete(id);
    }
  }, [pathname, toaster]);

  const observer = useCallback<WriteObserver>(
    (source) => {
      let id: number | null = null;
      let sent = false;

      const resolve = (guard: Guard, wording: WriteWording, progress: WriteProgress | undefined) => {
        if (id === null) return;
        toaster.update(id, resolvedGuardToast(guard, wording, progress));
        openGuards.current.delete(id);
        if (lastBySource.current.get(source)?.id === id) lastBySource.current.set(source, { id, replaceable: !sent });
      };

      const guardToastFor = (guard: Guard, live: boolean, base: ToastInput, wording: WriteWording, progress: WriteProgress | undefined): ToastInput => {
        if (!live) return movedGuardToast(guard, wording, progress);
        const onResolved = () => {
          resolve(guard, wording, progress);
        };
        return { ...base, action: <WriteGuardAction guard={guard} onResolved={onResolved} /> };
      };

      // A sequence that already sent a transaction keeps its toast, the only record of it, as the moved fact.
      const openGuard = (placed: number, guard: Guard, wording: WriteWording, progress: WriteProgress | undefined): OpenGuard => ({
        chainId: guard.pageChainId,
        leave: sent
          ? () => {
              toaster.update(placed, movedGuardToast(guard, wording, progress));
            }
          : () => {
              toaster.dismiss(placed);
            },
      });

      const place = (toast: ToastInput): number => {
        if (id === null) {
          const previous = lastBySource.current.get(source);
          if (previous?.replaceable === true) id = previous.id;
        }
        if (id === null) return toaster.show(toast);
        toaster.update(id, toast);
        return id;
      };

      return {
        report(status, wording, progress) {
          if (status.phase === "submitted") sent = true;
          const base = writeToast(status, wording, progress);
          if (base === null) return;
          const guard = isGuard(status) ? status : null;
          const live = guard !== null && routeSegment.current === String(guard.pageChainId);
          const placed = place(guard === null ? base : guardToastFor(guard, live, base, wording, progress));
          id = placed;
          lastBySource.current.set(source, { id: placed, replaceable: !sent && NOTHING_SENT.has(status.phase) });
          if (live) openGuards.current.set(placed, openGuard(placed, guard, wording, progress));
          else openGuards.current.delete(placed);
        },
      };
    },
    [toaster],
  );

  return <WriteObserverProvider value={observer}>{children}</WriteObserverProvider>;
}
