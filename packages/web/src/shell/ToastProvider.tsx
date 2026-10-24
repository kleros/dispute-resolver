import { PushMessage } from "@kleros/ui-components-library";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readMotionMs } from "../ui";
import type { ToastInput, Toaster } from "./types";

const DEFAULT_AUTO_HIDE_MS = 5000;

/** The close clock when the stylesheet has not set one, as in a test environment without CSS. */
const FALLBACK_CLOSE_MS = 250;

const DISMISS_LABEL = "Dismiss notification";

interface ActiveToast extends ToastInput {
  readonly id: number;
}

const ToastContext = createContext<Toaster | null>(null);

export function useToast(): Toaster {
  const toaster = useContext(ToastContext);
  if (toaster === null) throw new Error("useToast is called outside ToastProvider.");
  return toaster;
}

interface ToastItemProps {
  readonly toast: ActiveToast;
  readonly onRemove: (id: number) => void;
}

/**
 * The open class is set on the element directly: the wrapper's className never changes after mount, so React never
 * rewrites it over the class.
 */
function ToastItem({ toast, onRemove }: ToastItemProps) {
  const { id, variant, title, message, autoHideMs = DEFAULT_AUTO_HIDE_MS } = toast;
  const itemRef = useRef<HTMLOutputElement>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const leave = useCallback(() => {
    if (removeTimer.current !== null) return;
    itemRef.current?.classList.remove("is-open");
    // A timer, not transitionend: under reduced motion the toast has no transition to end.
    removeTimer.current = setTimeout(
      () => {
        onRemove(id);
      },
      readMotionMs("--toast-close", FALLBACK_CLOSE_MS),
    );
  }, [id, onRemove]);

  useEffect(() => {
    const item = itemRef.current;
    if (item === null) return;
    // Reading the layout commits the closed style first, so adding the class starts the transition.
    item.getBoundingClientRect();
    item.classList.add("is-open");
  }, []);

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pageHidden, setPageHidden] = useState(() => document.hidden);

  useEffect(() => {
    const item = itemRef.current;
    if (item === null) return undefined;
    const onEnter = () => {
      setHovered(true);
    };
    const onLeave = () => {
      setHovered(false);
    };
    const onFocusIn = () => {
      setFocused(true);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node && item.contains(event.relatedTarget))) setFocused(false);
    };
    const onVisibility = () => {
      setPageHidden(document.hidden);
    };
    item.addEventListener("pointerenter", onEnter);
    item.addEventListener("pointerleave", onLeave);
    item.addEventListener("focusin", onFocusIn);
    item.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      item.removeEventListener("pointerenter", onEnter);
      item.removeEventListener("pointerleave", onLeave);
      item.removeEventListener("focusin", onFocusIn);
      item.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // A wallet on a phone sends the browser to the background, so a toast fired then would expire unseen. While the toast
  // is hovered, focused or the page is hidden it has no clock; once all three clear it gets its full delay again, not
  // the rest of it, since the reader has to find it first.
  const paused = hovered || focused || pageHidden;
  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(leave, autoHideMs);
    return () => {
      clearTimeout(timer);
    };
  }, [autoHideMs, leave, paused]);

  useEffect(
    () => () => {
      if (removeTimer.current !== null) clearTimeout(removeTimer.current);
    },
    [],
  );

  // The library's close button wraps a bare icon and takes no label of its own, so name it after it mounts.
  useEffect(() => {
    itemRef.current?.querySelector("button")?.setAttribute("aria-label", DISMISS_LABEL);
  }, []);

  // The library's close button is an 8 px square; it grows to 24 px about the same centre, and the text column keeps clear of it.
  // The close button sits on the toast's PrimaryBlue surface, where the global PrimaryBlue ring would not show; the
  // surface's WhiteBackground text colour holds 4.97:1 on it in light and 9.35:1 in dark.
  return (
    <output
      ref={itemRef}
      role={variant === "error" ? "alert" : undefined}
      className="t-toast pointer-events-auto block [--dr-focus:var(--klerosUIComponentsWhiteBackground)] w-full [overflow-wrap:anywhere] [&>div]:h-auto [&>div]:min-h-16 [&>div]:w-full [&>div]:shadow-default [&_button]:top-4 [&_button]:right-4 [&_button]:size-6 [&_button]:items-center [&_button]:justify-center [&>div>div]:pr-4"
    >
      <PushMessage variant={variant} title={title} msg={message} callback={leave} />
    </output>
  );
}

/** The region stays mounted, so a screen reader announces every toast added to it. */
export function ToastProvider({ children }: { readonly children?: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ActiveToast[]>([]);
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
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
          <ToastItem key={toast.id} toast={toast} onRemove={remove} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}
