import { CREATE_LIMITS, type ChainConfig, type Court, type CreateValidationErrors } from "@dispute-resolver/core";
import { DropdownSelect, NumberField, TextField } from "@kleros/ui-components-library";
import { useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { queryKeys, useArbitrationCost, useCourts } from "../../data";
import { Amount, FACT, LABEL, SectionUnavailable, useAfterLoading } from "../../ui";
import { formExtraData, setText, type CreateForm } from "./draft";
import { FULL_WIDTH_FIELD, FULL_WIDTH_SELECT, FieldSlot, FormGroup, Shimmer, errorProps } from "./fields";
import { fieldErrorMessage } from "./messages";

export function courtLabel(court: Court): string {
  return court.name ?? `Court #${court.id.toString()} (name unavailable)`;
}

const INTEGER_FORMAT: Intl.NumberFormatOptions = { useGrouping: false, maximumFractionDigits: 0 };

/** The number field shows `NaN` as empty. */
function numberValue(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

/** An empty field becomes `""`, so core reports it as required. */
function draftNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : "";
}

function CourtSelect({
  chainId,
  courtId,
  error,
  onSelect,
}: {
  readonly chainId: number;
  readonly courtId: string;
  readonly error: string | undefined;
  readonly onSelect: (courtId: string) => void;
}) {
  const courts = useCourts(chainId);
  const queryClient = useQueryClient();
  if (courts.status === "unavailable") {
    return (
      <SectionUnavailable
        section="Courts"
        error={courts.error}
        onRetry={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.courts(chainId) });
        }}
      />
    );
  }
  const list = courts.status === "ready" ? courts.value : [];
  const items = list.map((court) => ({ id: court.id.toString(), text: courtLabel(court) }));
  return (
    <div className="min-w-0">
      <DropdownSelect
        label="Court"
        items={items}
        // The library bundles a react-aria Select that only knows `selectedKey`; the newer `value` it is typed against is ignored.
        // eslint-disable-next-line @typescript-eslint/no-deprecated, sonarjs/deprecation
        selectedKey={items.some((item) => item.id === courtId) ? courtId : null}
        placeholder={courts.status === "loading" ? "Loading..." : "Please select a court"}
        isDisabled={courts.status === "loading"}
        isInvalid={error !== undefined}
        className={FULL_WIDTH_SELECT}
        callback={(item) => {
          onSelect(String(item.id));
        }}
      />
      {error === undefined ? null : <p className="mt-1 text-sm text-klerosUIComponentsError">{error}</p>}
    </div>
  );
}

const COST_SWAP_IN = "animate-[t-text-swap-in_var(--text-swap-dur)_var(--text-swap-ease)_backwards] motion-reduce:animate-none";

function ArbitrationCost({ chain, form }: { readonly chain: ChainConfig; readonly form: CreateForm }) {
  const labelId = useId();
  const extraData = formExtraData(form);
  const cost = useArbitrationCost(chain.id, extraData);
  const arrived = useAfterLoading(extraData !== undefined && cost.status === "loading");
  let value;
  // The plate (MediumBlue) carries the cost and the waiting texts; Error text never sits on it (3.92:1 in light), so the
  // unavailable state keeps a white box with a Stroke edge.
  let surface = "bg-klerosUIComponentsMediumBlue";
  if (extraData === undefined) {
    value = <span className="text-base text-klerosUIComponentsSecondaryText">Choose a court and a number of votes.</span>;
  } else if (cost.status === "loading") {
    value = <Shimmer text="Calculating..." className="text-base" />;
  } else if (cost.status === "unavailable") {
    surface = "border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground";
    value = <span className="text-sm text-klerosUIComponentsError">{cost.error.message}</span>;
  } else {
    value = <Amount wei={cost.value} chain={chain} className={arrived ? `${FACT} ${COST_SWAP_IN}` : FACT} />;
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span id={labelId} className={LABEL}>
        Arbitration Cost
      </span>
      <output aria-labelledby={labelId} aria-live="polite" className={`flex min-h-[45px] items-center rounded-base px-4 py-2 [overflow-wrap:anywhere] ${surface}`}>
        {value}
      </output>
    </div>
  );
}

export interface SectionProps {
  readonly chain: ChainConfig;
  readonly form: CreateForm;
  readonly errors: CreateValidationErrors;
  readonly onChange: (update: (form: CreateForm) => CreateForm) => void;
}

export function CourtSection({ chain, form, errors, onChange }: SectionProps) {
  return (
    <FormGroup title="Court and cost" description="The court that rules on the dispute, how many jurors it draws, and what that costs.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FieldSlot>
          <CourtSelect
            chainId={chain.id}
            courtId={form.courtId}
            error={errors.courtId === undefined ? undefined : fieldErrorMessage("courtId", errors.courtId)}
            onSelect={(courtId) => {
              onChange((current) => setText(current, "courtId", courtId));
            }}
          />
        </FieldSlot>
        <FieldSlot>
          <NumberField
            label="Number of Votes"
            isRequired
            validationBehavior="aria"
            minValue={CREATE_LIMITS.minVotes}
            step={1}
            formatOptions={INTEGER_FORMAT}
            value={numberValue(form.votes)}
            onChange={(value) => {
              onChange((current) => setText(current, "votes", draftNumber(value)));
            }}
            className={FULL_WIDTH_FIELD}
            {...errorProps(errors.votes === undefined ? undefined : fieldErrorMessage("votes", errors.votes))}
          />
        </FieldSlot>
        <FieldSlot>
          <TextField
            label="Category (Optional)"
            value={form.category}
            onChange={(value) => {
              onChange((current) => setText(current, "category", value));
            }}
            className={FULL_WIDTH_FIELD}
          />
        </FieldSlot>
        <ArbitrationCost chain={chain} form={form} />
      </div>
    </FormGroup>
  );
}
