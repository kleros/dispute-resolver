import { useCallback, useRef, useState, type RefCallback } from "react";

/**
 * The content width of an element in whole CSS pixels, kept current while it resizes, for library parts that take a
 * fixed pixel width (`LinearProgress` draws an SVG of that width). `fallback` applies until the element is measured, and
 * where `ResizeObserver` does not exist.
 */
export function useElementWidth(fallback: number): readonly [RefCallback<HTMLElement>, number] {
  const [width, setWidth] = useState(fallback);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const measured = Math.floor(element.clientWidth);
      if (measured > 0) setWidth(measured);
    };
    measure();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(element);
  }, []);
  return [ref, width] as const;
}
