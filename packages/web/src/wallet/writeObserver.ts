import { createContext, useContext } from "react";
import type { WriteAttempt, WriteObserver, WriteProgress, WriteStatus, WriteWording } from "./types";

const NO_ATTEMPT: WriteAttempt = { report: () => undefined };

/** Every write works without an observer: the shell's toasts are not needed for a write to run. */
const NO_OBSERVER: WriteObserver = () => NO_ATTEMPT;

const WriteObserverContext = createContext<WriteObserver>(NO_OBSERVER);

export const WriteObserverProvider = WriteObserverContext.Provider;

export function useWriteObserver(): WriteObserver {
  return useContext(WriteObserverContext);
}

/** Reports to the observer without letting its failure change the write: `performWrite` never throws. */
export function reportSafely(attempt: WriteAttempt, status: WriteStatus, wording: WriteWording, progress?: WriteProgress): void {
  try {
    attempt.report(status, wording, progress);
  } catch {
    // A mined write stays mined; the screen still has the status.
  }
}
