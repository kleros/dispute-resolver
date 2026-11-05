/**
 * The `sandbox` attribute is set before `src`, so the runner document never exists without it, and it grants
 * `allow-scripts` only, which gives the frame an opaque origin. The caller appends the frame once it listens for `load`.
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

/** Created again if something removed it from the page. */
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
