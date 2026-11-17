import { PushMessage } from "@kleros/ui-components-library";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExternalLink } from "../safe-content";
import { PHONE_MEDIA_QUERY, readMotionMs, useMediaQuery } from "../ui";
import type { ToastInput, Toaster } from "./types";

const DEFAULT_AUTO_HIDE_MS = 5000;

/** The close clock when the stylesheet has not set one, as in a test environment without CSS. */
const FALLBACK_CLOSE_MS = 250;

const DISMISS_LABEL = "Dismiss notification";

const PHONE_VISIBLE_TOASTS = 3;

/**
 * Every message selector is scoped to the PushMessage (the first child): the foot holds a `div` and the action's
 * library Button too. The library's close button is an 8 px square; it grows to 24 px about the same centre, and the
 * text column keeps clear of it. The global PrimaryBlue focus ring would not show on the toast's blue surface, so it
 * takes the toast's text colour. The toast paints the message's own surface, PrimaryBlue or Error, behind the
 * message and the foot, so their seam shows no corner whichever radius the message keeps. The surface rides on
 * `data-surface`, not on the class list: see ToastItem.
 */
const TOAST_CLASS = [
  "t-toast pointer-events-auto block w-full overflow-hidden rounded-base bg-klerosUIComponentsPrimaryBlue shadow-default",
  "data-[surface=error]:bg-klerosUIComponentsError",
  "[--dr-focus:var(--klerosUIComponentsWhiteBackground)] [overflow-wrap:anywhere]",
  "[&>div:first-child]:h-auto [&>div:first-child]:min-h-16 [&>div:first-child]:w-full [&>div:first-child>div]:pr-4",
  "[&>div:first-child>button]:top-4 [&>div:first-child>button]:right-4 [&>div:first-child>button]:size-6",
  "[&>div:first-child>button]:items-center [&>div:first-child>button]:justify-center",
].join(" ");

/** PushMessage's text column: 24 px inset + 32 px icon + 16 px gap of its non-small layout. */
const TEXT_COLUMN_INSET = "pl-[72px]";

/** `empty:hidden` drops the foot when its only content renders nothing (a Connect without a project ID). */
const FOOT_CLASS = `flex flex-col items-start gap-2 pr-6 pb-4 ${TEXT_COLUMN_INSET} text-sm text-klerosUIComponentsWhiteBackground empty:hidden`;

/** The toast's own text colour: the link's default PrimaryBlue would vanish on the blue surface and is below AA on the red one. */
const LINK_CLASS = "rounded-base text-klerosUIComponentsWhiteBackground underline decoration-1 underline-offset-2 hover:decoration-2 [overflow-wrap:anywhere]";

/** The library merges a PushMessage's className over its own, so this replaces its PrimaryBlue. */
const ERROR_MESSAGE_CLASS = "bg-klerosUIComponentsError";

function messageClass(extras: boolean, red: boolean): string | undefined {
  const classes: string[] = [];
  if (extras) classes.push("pb-2");
  if (red) classes.push(ERROR_MESSAGE_CLASS);
  return classes.length === 0 ? undefined : classes.join(" ");
}

interface ActiveToast extends ToastInput {
  readonly id: number;
  /** A new number at every show and update, so an id and a version name one content, even for a toast shown again. */
  readonly version: number;
  /** Non-zero once `dismiss` asked the toast to close; a new number at every call. */
  readonly closeRequest: number;
}

const ToastContext = createContext<Toaster | null>(null);

export function useToast(): Toaster {
  const toaster = useContext(ToastContext);
  if (toaster === null) throw new Error("useToast is called outside ToastProvider.");
  return toaster;
}

interface ToastItemProps {
  readonly toast: ActiveToast;
  /** Waiting for room on a phone's stack: hidden, with no clock. */
  readonly parked: boolean;
  readonly onRemove: (id: number, version: number) => void;
}

/**
 * The open class is set on the element directly: the wrapper's className never changes after mount, so React never
 * rewrites it over the class. That is why the surface, which an update can change, is an attribute.
 */
function ToastItem({ toast, parked, onRemove }: ToastItemProps) {
  const { id, version, closeRequest, variant, surface, title, message, link, action, autoHideMs = DEFAULT_AUTO_HIDE_MS } = toast;
  const red = variant === "error" && surface !== "primary";
  const itemRef = useRef<HTMLOutputElement>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The removal names the content it closes: an update that lands meanwhile keeps the toast.
  const leave = useCallback(() => {
    if (removeTimer.current !== null) return;
    itemRef.current?.classList.remove("is-open");
    // A timer, not transitionend: under reduced motion the toast has no transition to end.
    removeTimer.current = setTimeout(
      () => {
        onRemove(id, version);
      },
      readMotionMs("--toast-close", FALLBACK_CLOSE_MS),
    );
  }, [id, version, onRemove]);

  const enter = useCallback(() => {
    const item = itemRef.current;
    if (item === null) return;
    item.classList.remove("is-open");
    // Reading the layout commits the closed style first, so adding the class starts the transition.
    item.getBoundingClientRect();
    item.classList.add("is-open");
  }, []);

  useEffect(enter, [enter]);

  // A parked toast keeps its open class while hidden, so it would return at full opacity; before paint, it enters again.
  const wasParked = useRef(parked);
  useLayoutEffect(() => {
    if (wasParked.current && !parked && removeTimer.current === null) enter();
    wasParked.current = parked;
  }, [parked, enter]);

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
  // is hovered, focused, parked or the page is hidden it has no clock; once all clear it gets its full delay again, not
  // the rest of it, since the reader has to find it first. `leave` changes with the content, so an update restarts it.
  const paused = hovered || focused || pageHidden || parked;
  useEffect(() => {
    if (paused || autoHideMs === null) return undefined;
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

  // Declared before the close request: an update and a dismiss in one batch reopen, then close.
  useEffect(() => {
    if (removeTimer.current === null) return;
    clearTimeout(removeTimer.current);
    // `leave` returns early while the timer is set.
    removeTimer.current = null;
    itemRef.current?.classList.add("is-open");
  }, [version]);

  useEffect(() => {
    if (closeRequest !== 0) leave();
  }, [closeRequest, leave]);

  // The library's close button wraps a bare icon and takes no label of its own, so name it after each render of new content.
  useEffect(() => {
    itemRef.current?.querySelector(":scope > div:first-child > button")?.setAttribute("aria-label", DISMISS_LABEL);
  }, [version]);

  // New content can take away the focused element (a Switch that gave way); Firefox and WebKit then send no focusout.
  useEffect(() => {
    const item = itemRef.current;
    if (item !== null) setFocused(item.contains(document.activeElement));
  }, [version]);

  const extras = link !== undefined || action !== undefined;
  // The library's PushMessage takes strings only, so the link and the action sit in a foot under it, in its text column.
  return (
    <output
      ref={itemRef}
      role={variant === "error" && action === undefined ? "alert" : undefined}
      hidden={parked}
      data-surface={red ? "error" : undefined}
      className={TOAST_CLASS}
    >
      <PushMessage variant={variant} title={title} msg={message} callback={leave} className={messageClass(extras, red)} />
      {extras ? (
        <div className={FOOT_CLASS}>
          {link === undefined ? null : (
            <ExternalLink href={link.href} className={LINK_CLASS}>
              {link.label}
            </ExternalLink>
          )}
          {action}
        </div>
      ) : null}
    </output>
  );
}

/** The ids of the toasts changed most recently: what a phone's stack shows. */
function latestChanged(toasts: readonly ActiveToast[]): ReadonlySet<number> {
  const byChange = [...toasts].sort((a, b) => b.version - a.version);
  return new Set(byChange.slice(0, PHONE_VISIBLE_TOASTS).map((toast) => toast.id));
}

/**
 * The region stays mounted, so a screen reader announces every toast added to it and every change of one; it is the
 * app's only notifications live region. It never prints: fixed, a toast would repeat on every page, over the content.
 * It is portalled to the body: inside the page scroller, its own stacking context, toasts sat under a modal overlay's
 * blur. Marked as a react-aria top layer, it stays visible to assistive technology, focusable and clickable while a
 * modal hides the rest of the page.
 */
export function ToastProvider({ children }: { readonly children?: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ActiveToast[]>([]);
  const nextId = useRef(0);
  const nextVersion = useRef(0);
  const nextClose = useRef(1);
  const phone = useMediaQuery(PHONE_MEDIA_QUERY);

  const remove = useCallback((id: number, version: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id || toast.version !== version));
  }, []);

  const toaster = useMemo<Toaster>(() => {
    const takeVersion = () => {
      const version = nextVersion.current;
      nextVersion.current += 1;
      return version;
    };
    return {
      show(toast) {
        const id = nextId.current;
        nextId.current += 1;
        const entry: ActiveToast = { ...toast, id, version: takeVersion(), closeRequest: 0 };
        setToasts((current) => [...current, entry]);
        return id;
      },
      update(id, toast) {
        const entry: ActiveToast = { ...toast, id, version: takeVersion(), closeRequest: 0 };
        setToasts((current) => (current.some((shown) => shown.id === id) ? current.map((shown) => (shown.id === id ? entry : shown)) : [...current, entry]));
      },
      dismiss(id) {
        const closeRequest = nextClose.current;
        nextClose.current += 1;
        setToasts((current) => (current.some((shown) => shown.id === id) ? current.map((shown) => (shown.id === id ? { ...shown, closeRequest } : shown)) : current));
      },
    };
  }, []);

  const visible = useMemo(() => latestChanged(toasts), [toasts]);

  return (
    <ToastContext.Provider value={toaster}>
      {children}
      {createPortal(
        <section
          aria-label="Notifications"
          aria-live="polite"
          data-react-aria-top-layer="true"
          className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:left-auto sm:w-[422px] print:hidden"
        >
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} parked={phone && !visible.has(toast.id)} onRemove={remove} />
          ))}
        </section>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
