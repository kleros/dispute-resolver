import { PushMessage } from "@kleros/ui-components-library";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ToastInput, Toaster } from "./types";

/** spec §4.6: the Create page's toasts hide after five seconds. */
const DEFAULT_AUTO_HIDE_MS = 5000;

const DISMISS_LABEL = "Dismiss notification";

interface ActiveToast extends ToastInput {
  readonly id: number;
}

const ToastContext = createContext<Toaster | null>(null);

/** Shows a toast from anywhere below `ToastProvider` (spec §2.7). */
export function useToast(): Toaster {
  const toaster = useContext(ToastContext);
  if (toaster === null) throw new Error("useToast is called outside ToastProvider.");
  return toaster;
}

interface ToastItemProps {
  readonly toast: ActiveToast;
  readonly onDismiss: (id: number) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const { id, variant, title, message, autoHideMs = DEFAULT_AUTO_HIDE_MS } = toast;
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(id);
    }, autoHideMs);
    return () => {
      clearTimeout(timer);
    };
  }, [id, autoHideMs, onDismiss]);

  // The library's close button wraps a bare icon and takes no label of its own, so name it after it mounts.
  useEffect(() => {
    itemRef.current?.querySelector("button")?.setAttribute("aria-label", DISMISS_LABEL);
  }, []);

  return (
    <div
      ref={itemRef}
      role={variant === "error" ? "alert" : "status"}
      className="pointer-events-auto w-full animate-bounce-in [overflow-wrap:anywhere] motion-reduce:animate-none [&>div]:h-auto [&>div]:min-h-16 [&>div]:w-full [&>div]:shadow-default"
    >
      <PushMessage
        variant={variant}
        title={title}
        msg={message}
        callback={() => {
          onDismiss(id);
        }}
      />
    </div>
  );
}

/**
 * Toasts over the library `PushMessage` (spec §2.7, ARCHITECTURE.md §11.4): each hides after its delay or when closed.
 * The region stays mounted, so a screen reader announces every toast added to it; an error toast is an alert.
 */
export function ToastProvider({ children }: { readonly children?: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ActiveToast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toaster = useMemo<Toaster>(
    () => ({
      show(toast) {
        const id = nextId.current;
        nextId.current += 1;
        setToasts((current) => [...current, { ...toast, id }]);
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={toaster}>
      {children}
      <section aria-label="Notifications" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:left-auto sm:w-[422px]">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}
