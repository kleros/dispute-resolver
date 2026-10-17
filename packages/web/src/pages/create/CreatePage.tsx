import type { CreateDisputeInput } from "@dispute-resolver/core";
import { useCallback, useState } from "react";
import { usePageChain } from "../../routing";
import { ExternalLink } from "../../safe-content";
import { PageMessage, SectionBoundary } from "../../ui";
import { CreateForm } from "./CreateForm";
import { CreateSteps } from "./CreateSteps";
import { CreateSummary } from "./CreateSummary";
import { initialForm, type CreateForm as Form } from "./draft";

/** Where today's precondition message sends users to ask for Create on their chain (spec §4.2). */
export const FEATURE_REQUEST_URL = "https://github.com/kleros/dispute-resolver/issues";

const STEPS = ["Form", "Summary"];

/** Spec §4.2: a chain without an ArbitrableProxy cannot create disputes. */
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
 * The Create dispute page (spec §4): the form, then its summary and the create action. The form's values live here, so
 * Return restores them, court and cost included (D-08). The routing layout remounts the page on a chain change, which
 * returns to the form with the values cleared (spec §4.1). Each step degrades on its own (ARCHITECTURE.md §5.7).
 */
export function CreatePage() {
  const { chain, capabilities } = usePageChain();
  const [form, setForm] = useState<Form>(initialForm);
  const [input, setInput] = useState<CreateDisputeInput | null>(null);

  const update = useCallback((change: (current: Form) => Form) => {
    setForm(change);
  }, []);
  const returnToForm = useCallback(() => {
    setInput(null);
  }, []);

  return (
    <section className="mx-auto flex w-full max-w-[1080px] min-w-0 flex-col gap-6 py-6 lg:py-10">
      {capabilities.canCreate ? (
        <>
          <nav aria-label="Create dispute steps" className="w-full min-w-0 overflow-hidden px-8 lg:px-0">
            <CreateSteps titles={STEPS} current={input === null ? 0 : 1} />
          </nav>
          {input === null ? (
            <SectionBoundary key="form" section="Create form">
              <CreateForm chain={chain} form={form} onChange={update} onContinue={setInput} />
            </SectionBoundary>
          ) : (
            <SectionBoundary key="summary" section="Create summary">
              <CreateSummary chain={chain} input={input} onReturn={returnToForm} />
            </SectionBoundary>
          )}
        </>
      ) : (
        <CreateUnavailable />
      )}
    </section>
  );
}
