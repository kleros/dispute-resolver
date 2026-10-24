import type { CreateDisputeInput } from "@dispute-resolver/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePageChain } from "../../routing";
import { ExternalLink } from "../../safe-content";
import { PageMessage, SectionBoundary } from "../../ui";
import { CreateForm } from "./CreateForm";
import { CreateSteps } from "./CreateSteps";
import { CreateSummary } from "./CreateSummary";
import { initialForm, type CreateForm as Form } from "./draft";

const FEATURE_REQUEST_URL = "https://github.com/kleros/dispute-resolver/issues";

const STEPS = ["Form", "Summary"];

// The incoming step slides in from the side it sits on in the steps bar; the outgoing step unmounts at once, since the
// long form and the summary cannot share one box.
const STEP_ENTER = [
  "min-w-0 animate-[t-page-in-left_var(--page-slide-dur)_var(--page-slide-ease)_backwards] motion-reduce:animate-none",
  "min-w-0 animate-[t-page-in-right_var(--page-slide-dur)_var(--page-slide-ease)_backwards] motion-reduce:animate-none",
] as const;

/** No slide-in before the first step change, so the page's first render does not move. */
function stepClass(step: 0 | 1, stepChanges: number): string {
  return stepChanges === 0 ? "min-w-0" : STEP_ENTER[step];
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function CreateUnavailable() {
  return (
    <PageMessage
      title="There is no arbitrable contract deployed on this network"
      body="So unfortunately you can't create a dispute here. Feel free to head over to GitHub issues to request this feature."
      action={<ExternalLink href={FEATURE_REQUEST_URL}>GitHub issues</ExternalLink>}
    />
  );
}

/**
 * The form's values live here, so Return restores them. The routing layout remounts the page on a chain change, which
 * returns to the form with the values cleared.
 */
export function CreatePage() {
  const { chain, capabilities } = usePageChain();
  const [form, setForm] = useState<Form>(initialForm);
  const [input, setInput] = useState<CreateDisputeInput | null>(null);
  // Counts step changes rather than following the step, so neither the first render nor a remount takes the focus.
  const [stepChanges, setStepChanges] = useState(0);
  const navRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The button that changed the step unmounts with it, so without this the focus falls to the body and the page keeps
  // the scroll offset of the step it left, which on a phone opens the summary near its Create button. "nearest" scrolls
  // only when the steps are not already in view, and scroll-padding-top keeps them clear of the sticky header.
  useEffect(() => {
    if (stepChanges === 0) return;
    headingRef.current?.focus({ preventScroll: true });
    navRef.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "instant" : "smooth" });
  }, [stepChanges]);

  const toSummary = useCallback((value: CreateDisputeInput) => {
    setInput(value);
    setStepChanges((count) => count + 1);
  }, []);
  const returnToForm = useCallback(() => {
    setInput(null);
    setStepChanges((count) => count + 1);
  }, []);

  return (
    <section className="mx-auto flex w-full max-w-[1080px] min-w-0 flex-col gap-6 py-6 lg:py-10">
      {capabilities.canCreate ? (
        <>
          {/* Clipped sideways only: the completed step's check rises from below the bar as it lands. */}
          <nav ref={navRef} aria-label="Create dispute steps" className="w-full min-w-0 overflow-x-clip px-8 lg:px-0">
            <CreateSteps titles={STEPS} current={input === null ? 0 : 1} />
          </nav>
          {input === null ? (
            <SectionBoundary key="form" section="Create form">
              <div data-create-step="form" className={stepClass(0, stepChanges)}>
                <CreateForm chain={chain} form={form} onChange={setForm} headingRef={headingRef} onContinue={toSummary} />
              </div>
            </SectionBoundary>
          ) : (
            <SectionBoundary key="summary" section="Create summary">
              <div data-create-step="summary" className={stepClass(1, stepChanges)}>
                <CreateSummary chain={chain} input={input} documentName={form.primaryDocument?.fileName} headingRef={headingRef} onReturn={returnToForm} />
              </div>
            </SectionBoundary>
          )}
        </>
      ) : (
        <CreateUnavailable />
      )}
    </section>
  );
}
