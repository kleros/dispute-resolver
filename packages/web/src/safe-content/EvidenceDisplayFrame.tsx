import type { EvidenceDisplayFrameProps } from "./types";

/**
 * The evidence-display iframe (spec 9.4, A8, C5): the model of `buildEvidenceDisplay`, full width and a fixed 360 px
 * high, with no `allow` attribute. `sandbox` precedes `src` so React sets it first.
 */
export function EvidenceDisplayFrame({ model }: EvidenceDisplayFrameProps) {
  return (
    <iframe
      sandbox={model.sandbox.join(" ")}
      src={model.src}
      title="Evidence display"
      className="block h-[360px] w-full rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground"
    />
  );
}
