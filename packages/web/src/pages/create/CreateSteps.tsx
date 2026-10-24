import { Steps } from "@kleros/ui-components-library";

interface CreateStepsProps {
  readonly titles: readonly string[];
  /** Zero-based index of the current step; the ones before it are completed. */
  readonly current: number;
}

// The library's 24px success icon bobs from 20px rather than the 40px tuned for a 48px icon.
const CREATE_H =
  "w-full [--check-y-amount:20px] [&_li[aria-disabled]_[aria-hidden]_span]:text-klerosUIComponentsSecondaryText [&_[aria-hidden]>*]:transition-colors [&_[aria-hidden]>*]:duration-(--tabs-dur) [&_[aria-hidden]>*]:ease-(--tabs-ease) motion-reduce:[&_[aria-hidden]>*]:transition-none [&_[aria-hidden]_span]:transition-colors [&_[aria-hidden]_span]:duration-(--tabs-dur) [&_[aria-hidden]_span]:ease-(--tabs-ease) motion-reduce:[&_[aria-hidden]_span]:transition-none [&_li]:after:transition-colors [&_li]:after:duration-(--tabs-dur) [&_li]:after:ease-(--tabs-ease) motion-reduce:[&_li]:after:transition-none [&_h2]:transition-colors [&_h2]:duration-(--tabs-dur) [&_h2]:ease-(--tabs-ease) motion-reduce:[&_h2]:transition-none [&_svg]:animate-t-success-check motion-reduce:[&_svg]:animate-none";

export function CreateSteps({ titles, current }: CreateStepsProps) {
  return <Steps horizontal items={titles.map((title) => ({ title }))} currentItemIndex={current} className={CREATE_H} />;
}
