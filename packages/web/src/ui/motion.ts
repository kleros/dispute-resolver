import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type PresencePhase = "closed" | "open" | "closing";

export interface Presence<T extends HTMLElement> {
  readonly phase: PresencePhase;
  /** Changes on every opening; used as the panel's key, so a reopen during the close starts from the pre-open state. */
  readonly mountKey: number;
  /** The panel that animates; its own `animationend` ends the closing phase. */
  readonly panelRef: RefObject<T>;
  readonly open: () => void;
  readonly close: () => void;
}

/**
 * Keeps a panel mounted while it animates out. `close` moves an open panel to `closing`, which makes it inert; the
 * panel's own `animationend` (not one bubbling from a child) then moves it to `closed`. A panel with no running
 * animation, such as one whose animation classes do not apply at the current width, closes at once.
 */
export function usePresence<T extends HTMLElement>(): Presence<T> {
  const [phase, setPhase] = useState<PresencePhase>("closed");
  const [mountKey, setMountKey] = useState(0);
  const panelRef = useRef<T>(null);

  const open = useCallback(() => {
    setMountKey((key) => key + 1);
    setPhase("open");
  }, []);

  const close = useCallback(() => {
    setPhase((current) => (current === "open" ? "closing" : current));
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel === null) return undefined;
    // React 18 has no `inert` prop.
    panel.toggleAttribute("inert", phase === "closing");
    if (phase !== "closing") return undefined;
    const finish = () => {
      setPhase((current) => (current === "closing" ? "closed" : current));
    };
    // getAnimations flushes style, so the closing class just applied is already counted. jsdom has no getAnimations;
    // there the close waits for animationend like any browser with an animation running.
    if ("getAnimations" in panel && panel.getAnimations().length === 0) {
      finish();
      return undefined;
    }
    const finishOnOwnEnd = (event: AnimationEvent) => {
      if (event.target === panel) finish();
    };
    panel.addEventListener("animationend", finishOnOwnEnd);
    return () => {
      panel.removeEventListener("animationend", finishOnOwnEnd);
    };
  }, [phase, mountKey]);

  return { phase, mountKey, panelRef, open, close };
}

/** While `active`, a pointer press outside `insideRef` calls `onOutside`, which must be stable to keep the listener. */
export function useOutsidePress(active: boolean, insideRef: RefObject<HTMLElement | null>, onOutside: () => void): void {
  useEffect(() => {
    if (!active) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && insideRef.current?.contains(event.target) !== true) onOutside();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [active, insideRef, onOutside]);
}

/**
 * A motion variable of the root element in milliseconds, or `fallback` when it is unset. The build minifies `250ms` to
 * `.25s`, so both units are read.
 */
export function readMotionMs(variable: string, fallback: number): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  const isMs = value.endsWith("ms");
  if (!isMs && !value.endsWith("s")) return fallback;
  const amount = Number(value.slice(0, isMs ? -2 : -1));
  if (!Number.isFinite(amount)) return fallback;
  return isMs ? amount : amount * 1000;
}

/**
 * True once this mount has rendered `loading` and `loading` is now false, so content that arrives animates in while
 * content that was ready on the first render (from a cache) appears without motion.
 */
export function useAfterLoading(loading: boolean): boolean {
  const [sawLoading, setSawLoading] = useState(loading);
  if (loading && !sawLoading) setSawLoading(true);
  return sawLoading && !loading;
}

const REVEAL_IN = "animate-[t-reveal-in_var(--reveal-dur)_var(--reveal-ease)_backwards] motion-reduce:animate-none";

/**
 * The class that fades and unblurs in content replacing its placeholder during this mount; the placeholder itself leaves
 * at once. Content ready on the first render, from the cache, gets nothing and appears without motion.
 */
export function useRevealIn(loading: boolean): string | undefined {
  return useAfterLoading(loading) ? REVEAL_IN : undefined;
}

/**
 * Two icons in one grid cell, cross-fading with blur and scale. Tailwind's scale utilities set the `scale` property, not
 * `transform`. No will-change: it would keep the hidden icon rasterised at its quarter-size start and scale it up blurred.
 * The wrapper carries `data-icon-swap`, which exempts the icons from the pause on transitions during a theme flip.
 */
export const ICON_SWAP_CLASS = "[grid-area:1/1] transition-[opacity,filter,scale] duration-250 ease-[ease-in-out] motion-reduce:transition-none";
export const ICON_SWAP_SHOWN = "opacity-100 [filter:blur(0)] scale-100";
export const ICON_SWAP_HIDDEN = "opacity-0 [filter:blur(2px)] scale-25";

/** A staggered reveal: the first line, then each later line one `--stagger-stagger` after it. */
export const STAGGER_FIRST = "animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_backwards] motion-reduce:animate-none";
export const STAGGER_NEXT = "animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_var(--stagger-stagger)_backwards] motion-reduce:animate-none";

/**
 * A menu panel's look while it opens and while it closes. The static opacity-0 holds the panel invisible between the end
 * of the close animation and its unmount; under reduced motion the global guard shortens the animation instead of
 * removing it, so animationend still unmounts the panel.
 */
export const DROPDOWN_OPEN_CLASS = "animate-scale-in";
export const DROPDOWN_CLOSING_CLASS = "pointer-events-none animate-scale-out opacity-0";
