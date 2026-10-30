import { onTestFinished, vi } from "vitest";

/** React logs every render error it catches or rethrows, and jsdom prints the window's error report; both are expected. */
export function expectRenderErrors(): void {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const silence = (event: ErrorEvent): void => {
    event.preventDefault();
  };
  window.addEventListener("error", silence);
  onTestFinished(() => {
    window.removeEventListener("error", silence);
  });
}
