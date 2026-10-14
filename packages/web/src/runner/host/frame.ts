/**
 * Creates one hidden runner frame (ARCHITECTURE.md §7.3 step 3). The `sandbox` attribute is set before `src`, so the
 * runner document never exists without it (C4), and it grants `allow-scripts` only, which gives the frame an opaque
 * origin (B4). The caller appends the frame once it listens for `load`.
 */
export function createRunnerFrame(document: Document, runnerUrl: string): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.style.display = "none";
  frame.setAttribute("src", runnerUrl);
  return frame;
}

/** The hidden element runner frames live in, at the end of `document.body`; created again if something removed it. */
export function createFrameContainer(document: Document): () => HTMLElement {
  let container: HTMLElement | undefined;
  return () => {
    if (container?.isConnected !== true) {
      container = document.createElement("div");
      container.hidden = true;
      container.setAttribute("aria-hidden", "true");
      document.body.append(container);
    }
    return container;
  };
}
