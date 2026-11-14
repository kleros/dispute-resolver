import { useEffect, type RefObject } from "react";

/** A tap's click trails its release by a few frames, more on a busy page; a press that brings none must not hold the guard. */
const GUARD_AFTER_RELEASE_MS = 1000;

/**
 * What a mouse press would focus. Elements focused only from script (tabindex -1, such as the page scroller and the Create
 * headings) are left out, so a drag that starts on their text still selects it.
 */
const PRESS_FOCUSABLE = 'a[href], button, input, select, textarea, summary, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])';

interface Guard {
  /** The pointerdown that closed a menu; every menu that closes on it shares this guard. */
  readonly press: PointerEvent;
  release: ReturnType<typeof setTimeout> | undefined;
}

let guard: Guard | null = null;

function endGuard(): void {
  if (guard === null) return;
  clearTimeout(guard.release);
  guard = null;
  document.removeEventListener("pointerdown", onNextPress, true);
  document.removeEventListener("keydown", onGuardedKeyDown, true);
  document.removeEventListener("mousedown", onGuardedMouseDown, true);
  document.removeEventListener("pointerup", onGuardedPointerUp, true);
  document.removeEventListener("pointercancel", onGuardedPointerCancel, true);
  document.removeEventListener("touchend", onGuardedTouchEnd, true);
  document.removeEventListener("mouseup", stopHere, true);
  document.removeEventListener("click", onGuardedClick, true);
}

/** A second finger that lands during a tap is not a next press. */
function onNextPress(event: PointerEvent): void {
  if (event.isPrimary) endGuard();
}

/** Until its release the press is still to bring its click. */
function onGuardedKeyDown(): void {
  if (guard?.release !== undefined) endGuard();
}

/** Not stopped: the page scroller's thumb starts its drag on it. */
function onGuardedMouseDown(event: MouseEvent): void {
  if (event.target instanceof Element && event.target.closest(PRESS_FOCUSABLE) !== null) event.preventDefault();
}

function onGuardedPointerUp(event: PointerEvent): void {
  if (event.pointerId !== guard?.press.pointerId) return;
  event.stopPropagation();
  clearTimeout(guard.release);
  guard.release = setTimeout(endGuard, GUARD_AFTER_RELEASE_MS);
}

function stopHere(event: Event): void {
  event.stopPropagation();
}

function onGuardedPointerCancel(event: PointerEvent): void {
  if (event.pointerId === guard?.press.pointerId) endGuard();
}

/** Cancelling the touchend keeps the browser from focusing what lies under the tap, so no phone keyboard opens. */
function onGuardedTouchEnd(event: TouchEvent): void {
  event.preventDefault();
}

function onGuardedClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  endGuard();
}

/**
 * Keeps the rest of `press` from what lies under it: the focus its mousedown would move into a control, its release, the
 * touchend of a tap, and its click. The guard ends at that click, at a pointercancel (the touch became a scroll), at the
 * next press, at a key pressed after the release, or a second after the release.
 */
function guardRestOfPress(press: PointerEvent): void {
  if (guard?.press === press) return;
  endGuard();
  guard = { press, release: undefined };
  // Added while `press` is being dispatched, this listener first hears the next press.
  document.addEventListener("pointerdown", onNextPress, true);
  document.addEventListener("keydown", onGuardedKeyDown, true);
  document.addEventListener("mousedown", onGuardedMouseDown, true);
  document.addEventListener("pointerup", onGuardedPointerUp, true);
  document.addEventListener("pointercancel", onGuardedPointerCancel, true);
  document.addEventListener("touchend", onGuardedTouchEnd, { capture: true, passive: false });
  document.addEventListener("mouseup", stopHere, true);
  document.addEventListener("click", onGuardedClick, true);
}

/**
 * While `active`, a primary press outside `insideRef` calls `onOutside`, which must be stable to keep the listener, and
 * only closes, as on a native menu: its pointerdown is stopped in the capture phase, before React or a library sees it, so
 * no press starts there (react-aria acts on press start, and clicks by itself when a press ends without a click), and the
 * rest of the press is guarded. The pointerdown's default stays, so a mouse press on text still selects it or drags the
 * page scrollbar, and a touch still scrolls. A middle or right press is not an outside press, as for react-aria's own
 * popovers: it closes nothing and is left to what lies under it.
 */
export function useOutsidePress(active: boolean, insideRef: RefObject<HTMLElement | null>, onOutside: () => void): void {
  useEffect(() => {
    if (!active) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Node) || insideRef.current?.contains(event.target) === true) return;
      onOutside();
      event.stopPropagation();
      guardRestOfPress(event);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [active, insideRef, onOutside]);
}
