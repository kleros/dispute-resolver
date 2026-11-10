import { attachmentKind, buildCreatedMetaEvidence, encodeExtraData, toAttachmentLink, type Address, type ChainConfig, type CreateDisputeInput } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useEffect, useId, useState, type ReactNode, type Ref } from "react";
import { Link } from "react-router";
import { useAtlasUpload } from "../../atlas";
import { useArbitrationCost, useCoreDeps, useCourts } from "../../data";
import { paths } from "../../routing";
import { Attachment } from "../../safe-content";
import { AddressText, Amount, EYEBROW, FACT, FACT_SMALL, LABEL, Notice, VotingOptionList, votingOptions } from "../../ui";
import { useConnectWallet, useWallet, WriteGuardNotice, type WriteAccess } from "../../wallet";
import { courtLabel } from "./CourtSection";
import { questionTypeLabel } from "./draft";
import { Shimmer } from "./fields";
import { UPLOAD_FAILURE_TITLES } from "./messages";
import { useCreateDispute, type CreateActionState } from "./useCreateDispute";

const VALUE = "m-0 min-w-0 text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]";

function Row({ term, valueClass, children }: { readonly term: string; readonly valueClass?: string; readonly children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1 border-b border-klerosUIComponentsStroke py-3 last:border-b-0 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-4">
      <dt className={LABEL}>{term}</dt>
      <dd className={valueClass === undefined ? VALUE : `${VALUE} ${valueClass}`}>{children}</dd>
    </div>
  );
}

function CourtName({ chain, courtId }: { readonly chain: ChainConfig; readonly courtId: bigint }) {
  const courts = useCourts(chain.id);
  if (courts.status === "loading") return <Shimmer text="Loading..." />;
  const court = courts.status === "ready" ? courts.value.find((entry) => entry.id === courtId) : undefined;
  return <>{court === undefined ? `Court #${courtId.toString()}` : courtLabel(court)}</>;
}

function Cost({ chain, input }: { readonly chain: ChainConfig; readonly input: CreateDisputeInput }) {
  const cost = useArbitrationCost(chain.id, encodeExtraData(input.courtId, input.votes));
  if (cost.status === "ready") return <Amount wei={cost.value} chain={chain} className={FACT} />;
  if (cost.status === "loading") return <Shimmer text="Calculating..." />;
  return <span className="text-klerosUIComponentsError">{cost.error.message}</span>;
}

function Parties({ chain, aliases }: { readonly chain: ChainConfig; readonly aliases: CreateDisputeInput["aliases"] }) {
  const entries = Object.entries(aliases) as [Address, string][];
  return entries.map(([address, alias], index) => (
    <Row key={address} term={`Party ${String(index + 1)}`}>
      <span className="flex min-w-0 flex-col gap-1">
        <span>{alias}</span>
        <AddressText address={address} chain={chain} full />
      </span>
    </Row>
  ));
}

/** The CID goes beneath the picked name, since the stored path names only the CID. */
function PrimaryDocument({ path, fileName }: { readonly path: string; readonly fileName: string | undefined }) {
  const { gateway } = useCoreDeps();
  const link = toAttachmentLink(path, gateway);
  if (link?.kind !== "link" || fileName === undefined || fileName === "") return <Attachment attachment={link} />;
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <Attachment attachment={{ ...link, label: fileName, attachmentKind: attachmentKind(fileName) }} />
      <span className="text-sm text-klerosUIComponentsSecondaryText [overflow-wrap:anywhere]">{path.split("/")[2] ?? path}</span>
    </span>
  );
}

/** The rows the case page's voting options will show, read from the meta-evidence this summary uploads. */
function RulingOptions({ input }: { readonly input: CreateDisputeInput }) {
  const { registry } = useCoreDeps();
  const options = votingOptions(buildCreatedMetaEvidence(input, registry).rulingOptions);
  if (options === null) return null;
  return (
    <Row term="Ruling Options">
      <VotingOptionList options={options} />
    </Row>
  );
}

// A fast upload would only flash its notice and move the buttons; the Create button's spinner covers that wait.
const PUBLISHING_NOTICE_DELAY_MS = 500;

/** Mounted for the publishing step only, so leaving the step or pressing again clears or restarts the delay. */
function PublishingNotice() {
  const { phase } = useAtlasUpload();
  const [shown, setShown] = useState(phase === "signing-in");
  if (phase === "signing-in" && !shown) setShown(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setShown(true);
    }, PUBLISHING_NOTICE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  if (!shown) return null;
  return (
    <Notice
      reveal
      variant="info"
      title="Publishing the dispute data"
      body={phase === "signing-in" ? "Sign the message in your wallet to upload the dispute data to IPFS." : "Uploading the dispute data to IPFS..."}
    />
  );
}

/** The steps before and after the write; the write itself reports in the toasts. */
function ActionNotice({ state, chain }: { readonly state: CreateActionState; readonly chain: ChainConfig }) {
  switch (state.kind) {
    case "idle":
    case "writing":
      return null;
    case "publishing":
      return <PublishingNotice />;
    case "publish-failed":
      return (
        <Notice reveal variant={state.error === "sign-in-rejected" ? "info" : "error"} title={UPLOAD_FAILURE_TITLES[state.error]} body={`${state.message} Nothing was sent.`} />
      );
    case "cost-failed":
      return <Notice reveal variant="error" title="Arbitration cost unavailable" body={`${state.error.message} Nothing was sent.`} />;
    case "no-dispute-id":
      return (
        <Notice
          reveal
          variant="error"
          title="Dispute ID not found"
          body="The transaction was mined, but its receipt has no dispute creation event from the arbitrator, so the new dispute's ID is unknown. Check the transaction on the block explorer."
        />
      );
    case "created":
      return (
        <div className="flex flex-col gap-2">
          <Notice reveal variant="success" title={`Dispute ${state.disputeId.toString()} created`} body="Opening the dispute..." />
          <Link to={paths.case(chain.id, state.disputeId)} className="text-klerosUIComponentsPrimaryBlue underline decoration-1 underline-offset-2 hover:decoration-2">
            Open dispute {state.disputeId.toString()}
          </Link>
        </div>
      );
  }
}

/** Without a wallet the primary button itself says what is needed. */
function AccessNotice({ access }: { readonly access: WriteAccess }) {
  return access.status === "wrong-chain" ? <WriteGuardNotice guard={access.guard} /> : null;
}

interface PrimaryAction {
  readonly text: string;
  readonly isLoading?: boolean;
  readonly isDisabled: boolean;
  /** The library Button hides its text while loading, which would leave the button without a name. */
  readonly ariaLabel?: string;
  readonly onPress?: () => void;
}

const CREATE_DISPUTE = "Create dispute";

interface PrimaryState {
  readonly uploadsLocked: boolean;
  readonly access: WriteAccess;
  readonly walletConnecting: boolean;
  readonly canConnect: boolean;
  readonly creating: boolean;
  readonly isBusy: boolean;
  readonly connect: () => void;
  readonly create: () => void;
}

/** Connecting never creates the dispute: once connected the button reads Create dispute and waits for its own press. */
function primaryAction({ uploadsLocked, access, walletConnecting, canConnect, creating, isBusy, connect, create }: PrimaryState): PrimaryAction {
  if (uploadsLocked) return { text: CREATE_DISPUTE, isDisabled: true };
  if (access.status === "needs-wallet") {
    if (walletConnecting) return { text: "Connecting", isLoading: true, isDisabled: true, ariaLabel: "Connecting" };
    return canConnect ? { text: "Connect", isDisabled: false, onPress: connect } : { text: "Connect", isDisabled: true };
  }
  if (access.status === "wrong-chain") return { text: CREATE_DISPUTE, isDisabled: true };
  return { text: CREATE_DISPUTE, isLoading: creating, isDisabled: isBusy, ariaLabel: creating ? "Creating the dispute" : undefined, onPress: create };
}

export interface CreateSummaryProps {
  readonly chain: ChainConfig;
  readonly input: CreateDisputeInput;
  readonly documentName?: string;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  readonly onReturn: () => void;
}

/**
 * One primary button: Connect while no wallet is connected, then Create dispute, which stays disabled until the wallet
 * is on the page chain, and always without an upload service. Create signs in to Atlas when needed instead of requiring
 * a separate sign-in.
 */
export function CreateSummary({ chain, input, documentName, headingRef, onReturn }: CreateSummaryProps) {
  const action = useCreateDispute(input);
  const wallet = useWallet();
  const connect = useConnectWallet();
  const uploader = useAtlasUpload();
  const titleId = useId();
  const hintId = useId();
  // Hidden while busy: the publishing notice asks for the signature itself.
  const showSignInHint = action.access.status === "ready" && uploader.availability === "ready" && !uploader.isSignedIn && !action.isBusy;
  const creating = action.isBusy && action.state.kind !== "created";
  const primary = primaryAction({
    uploadsLocked: uploader.availability === "unconfigured",
    access: action.access,
    walletConnecting: wallet.status === "connecting",
    canConnect: connect.available,
    creating,
    isBusy: action.isBusy,
    connect: () => {
      connect.open(chain.id);
    },
    create: () => {
      void action.create();
    },
  });
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-6">
      {/* One sheet: the record band as its cover, then the rows. No overflow-hidden, so Copiable tooltips escape it. */}
      <div className="flex flex-col rounded-[18px] border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground">
        <header className="flex flex-col gap-1 rounded-t-[17px] border-b border-(--dr-record-edge) bg-(--dr-record-surface) p-4 lg:px-8 lg:py-6">
          <p className={EYEBROW}>Summary</p>
          <h1 ref={headingRef} id={titleId} tabIndex={-1} className="text-2xl font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">
            {input.title}
          </h1>
          {input.description === "" ? null : <p className="mt-2 leading-7 whitespace-pre-line text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">{input.description}</p>}
        </header>
        <dl className="m-0 flex flex-col px-4 lg:px-8">
          <Row term="Court" valueClass={FACT_SMALL}>
            <CourtName chain={chain} courtId={input.courtId} />
          </Row>
          <Row term="Number of Votes" valueClass={`${FACT_SMALL} tabular-nums`}>
            {input.votes.toString()}
          </Row>
          <Row term="Category (Optional)">{input.category === "" ? <span className="text-klerosUIComponentsSecondaryText">None</span> : input.category}</Row>
          <Row term="Arbitration Cost">
            <Cost chain={chain} input={input} />
          </Row>
          <Parties chain={chain} aliases={input.aliases} />
          <Row term={questionTypeLabel(input.questionType)}>{input.question}</Row>
          <RulingOptions input={input} />
          {input.primaryDocument === null ? null : (
            <Row term="Primary Document">
              <PrimaryDocument path={input.primaryDocument} fileName={documentName} />
            </Row>
          )}
        </dl>
      </div>
      <div aria-live="polite">
        {action.state.kind === "idle" ? <AccessNotice access={action.access} /> : null}
        {/* Keyed by the step of the action, so each new notice mounts and plays its reveal. */}
        <ActionNotice key={action.state.kind} state={action.state} chain={chain} />
      </div>
      <div className="flex flex-col gap-2">
        {showSignInHint ? (
          <p id={hintId} className="m-0 text-sm text-klerosUIComponentsSecondaryText lg:text-center">
            Your wallet will first ask you to sign in, to upload the dispute data, and then to confirm the transaction.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 lg:flex lg:justify-center">
          <Button text="Return" variant="secondary" isDisabled={action.isBusy} onPress={onReturn} className="w-full lg:w-auto" />
          <Button
            text={primary.text}
            isLoading={primary.isLoading ?? false}
            aria-label={primary.ariaLabel}
            isDisabled={primary.isDisabled}
            aria-describedby={showSignInHint ? hintId : undefined}
            onPress={primary.onPress}
            className="w-full lg:w-auto lg:min-w-48"
          />
        </div>
      </div>
    </section>
  );
}
