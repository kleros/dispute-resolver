import type { ReactNode } from "react";
import type { CoreDeps } from "../../data";
import { WriteObserverProvider, type WriteObserver, type WriteProgress, type WriteStatus, type WriteWording } from "../../wallet";
import type { TestWallet } from "./testWallet";
import { walletWrapper } from "./walletWrapper";

interface ObservedReport {
  readonly status: WriteStatus;
  readonly wording: WriteWording;
  readonly progress: WriteProgress | undefined;
}

interface ObservedAttempt {
  readonly source: string;
  readonly reports: readonly ObservedReport[];
}

interface RecordingObserver {
  readonly observer: WriteObserver;
  /** One entry per attempt, in the order they started, each with what it reported. */
  readonly attempts: readonly ObservedAttempt[];
}

/** A write observer that keeps every attempt and its reports, for the hooks' tests. */
export function recordingObserver(): RecordingObserver {
  const attempts: ObservedAttempt[] = [];
  const observer: WriteObserver = (source) => {
    const reports: ObservedReport[] = [];
    attempts.push({ source, reports });
    return {
      report(status, wording, progress) {
        reports.push({ status, wording, progress });
      },
    };
  };
  return { observer, attempts };
}

/** `walletWrapper` with `observer` as the app's write observer. */
export function observedWalletWrapper(wallet: TestWallet, deps: CoreDeps | undefined, observer: WriteObserver) {
  const Wallet = walletWrapper(wallet, deps);
  return function ObservedWalletWrapper({ children }: { readonly children?: ReactNode }) {
    return (
      <Wallet>
        <WriteObserverProvider value={observer}>{children}</WriteObserverProvider>
      </Wallet>
    );
  };
}
