import type { EvidenceDisplayFrameProps } from "./types";

/**
 * The evidence-display iframe: the model of `buildEvidenceDisplay`, full width and a fixed 360 px high, with no `allow`
 * attribute. `sandbox` precedes `src` so React sets it first. It draws no edge of its own; its colour scheme is light in
 * both themes, as the third-party pages assume, so a page without a background shows the display paper.
 */
export function EvidenceDisplayFrame({ model, onLoad }: EvidenceDisplayFrameProps) {
  return (
    <iframe
      sandbox={model.sandbox.join(" ")}
      src={model.src}
      title="Evidence display"
      // Not `onLoad={onLoad}`: React's event would hand the caller the iframe, its src and its contentWindow.
      onLoad={() => {
        onLoad?.();
      }}
      className="dr-display-frame block h-[360px] w-full bg-(--dr-display-paper) [color-scheme:light]"
    />
  );
}
