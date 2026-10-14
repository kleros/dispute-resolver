import { encodeExtraData, toAttachmentLink, type Address, type ChainConfig, type CreateDisputeInput } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useId, type ReactNode } from "react";
import { Link } from "react-router";
import { useAtlasUpload } from "../../atlas";
import { useArbitrationCost, useCoreDeps, useCourts } from "../../data";
import { paths } from "../../routing";
import { Attachment } from "../../safe-content";
import { AddressText, Amount, Notice } from "../../ui";
import { WriteStatusNotice, type WriteStatus } from "../../wallet";
import { courtLabel } from "./CourtSection";
import { questionTypeLabel } from "./draft";
import { UPLOAD_FAILURE_TITLES } from "./messages";
import { useCreateDispute, type CreateActionState } from "./useCreateDispute";

function Row({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1 border-b border-klerosUIComponentsStroke py-3 last:border-b-0 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-4">
      <dt className="text-sm text-klerosUIComponentsSecondaryText">{term}</dt>
      <dd className="m-0 min-w-0 text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function CourtName({ chain, courtId }: { readonly chain: ChainConfig; readonly courtId: bigint }) {
  const courts = useCourts(chain.id);
  const court = courts.status === "ready" ? courts.value.find((entry) => entry.id === courtId) : undefined;
  return <>{court === undefined ? `Court #${courtId.toString()}` : courtLabel(court)}</>;
}

function Cost({ chain, input }: { readonly chain: ChainConfig; readonly input: CreateDisputeInput }) {
  const cost = useArbitrationCost(chain.id, encodeExtraData(input.courtId, input.votes));
  if (cost.status === "ready") return <Amount wei={cost.value} chain={chain} />;
  if (cost.status === "loading") return <span className="text-klerosUIComponentsSecondaryText">Calculating...</span>;
  return <span className="text-klerosUIComponentsError">{cost.error.message}</span>;
}

function Parties({ chain, aliases }: { readonly chain: ChainConfig; readonly aliases: CreateDisputeInput["aliases"] }) {
  const entries = Object.entries(aliases) as [Address, string][];
  return entries.map(([address, alias], index) => (
    <Row key={address} term={`Party ${String(index + 1)}`}>
      <span className="flex min-w-0 flex-col gap-1">
        <span>{alias}</span>
        <AddressText address={address} chain={chain} />
      </span>
    </Row>
  ));
}

function RulingOptions({ input }: { readonly input: CreateDisputeInput }) {
  if (input.options.length === 0) return null;
  return (
    <Row term="Ruling Options">
      <ol className="m-0 flex list-decimal flex-col gap-2 pl-5">
        {input.options.map((option, index) => (
          // Options are positional: their index is their ruling code minus one (spec §4.5).
          <li key={String(index)}>
            <span className="font-semibold">{option.title}</span>
            {option.description === "" ? null : <span className="block text-sm text-klerosUIComponentsSecondaryText">{option.description}</span>}
          </li>
        ))}
      </ol>
    </Row>
  );
}

/** What the create action is doing or how it ended (spec §4.6, D-07): one notice at a time, next to the buttons. */
function ActionNotice({ state, writeStatus, chain }: { readonly state: CreateActionState; readonly writeStatus: WriteStatus; readonly chain: ChainConfig }) {
  const uploader = useAtlasUpload();
  switch (state.kind) {
    case "idle":
      return null;
    case "blocked":
      return <WriteStatusNotice status={state.status} />;
    case "publishing":
      return (
        <Notice
          variant="info"
          title="Publishing the dispute data"
          body={uploader.phase === "signing-in" ? "Sign the message in your wallet to upload the dispute data to IPFS." : "Uploading the dispute data to IPFS..."}
        />
      );
    case "publish-failed":
      return <Notice variant={state.error === "sign-in-rejected" ? "info" : "error"} title={UPLOAD_FAILURE_TITLES[state.error]} body={`${state.message} Nothing was sent.`} />;
    case "cost-failed":
      return <Notice variant="error" title="Arbitration cost unavailable" body={`${state.error.message} Nothing was sent.`} />;
    case "writing":
      return <WriteStatusNotice status={writeStatus} />;
    case "no-dispute-id":
      return (
        <div className="flex flex-col gap-3">
          <WriteStatusNotice status={writeStatus} />
          <Notice
            variant="error"
            title="Dispute ID not found"
            body="The transaction was mined, but its receipt has no dispute creation event from the arbitrator, so the new dispute's ID is unknown. Check the transaction on the block explorer."
          />
        </div>
      );
    case "created":
      return (
        <div className="flex flex-col gap-2">
          <Notice variant="success" title={`Dispute ${state.disputeId.toString()} created`} body="Opening the dispute..." />
          <Link to={paths.case(chain.id, state.disputeId)} className="text-klerosUIComponentsPrimaryBlue hover:underline">
            Open dispute {state.disputeId.toString()}
          </Link>
        </div>
      );
  }
}

export interface CreateSummaryProps {
  readonly chain: ChainConfig;
  readonly input: CreateDisputeInput;
  readonly onReturn: () => void;
}

/**
 * Page 2 (spec §4.4): everything the dispute will be created with, Return (the form keeps its values, D-08) and Create
 * (spec §4.5). Create signs in to Atlas when needed instead of requiring a separate sign-in (D-52).
 */
export function CreateSummary({ chain, input, onReturn }: CreateSummaryProps) {
  const { gateway } = useCoreDeps();
  const action = useCreateDispute(input);
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-klerosUIComponentsSecondaryText">Summary</p>
        <h1 id={titleId} className="text-2xl font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">
          {input.title}
        </h1>
        {input.description === "" ? null : <p className="mt-2 whitespace-pre-line text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">{input.description}</p>}
      </header>
      <dl className="m-0 flex flex-col rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground px-4 lg:px-6">
        <Row term="Court">
          <CourtName chain={chain} courtId={input.courtId} />
        </Row>
        <Row term="Number of Votes">{input.votes.toString()}</Row>
        <Row term="Category (Optional)">{input.category === "" ? <span className="text-klerosUIComponentsSecondaryText">None</span> : input.category}</Row>
        <Row term="Arbitration Cost">
          <Cost chain={chain} input={input} />
        </Row>
        <Parties chain={chain} aliases={input.aliases} />
        <Row term={questionTypeLabel(input.questionType)}>{input.question}</Row>
        <RulingOptions input={input} />
        {input.primaryDocument === null ? null : (
          <Row term="Primary Document">
            <Attachment attachment={toAttachmentLink(input.primaryDocument, gateway)} />
          </Row>
        )}
      </dl>
      <div aria-live="polite">
        <ActionNotice state={action.state} writeStatus={action.writeStatus} chain={chain} />
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button text="Return" variant="secondary" isDisabled={action.isBusy} onPress={onReturn} />
        <Button
          text="Create"
          isLoading={action.isBusy && action.state.kind !== "created"}
          isDisabled={action.isCreateDisabled}
          onPress={() => {
            void action.create();
          }}
        />
      </div>
    </section>
  );
}
