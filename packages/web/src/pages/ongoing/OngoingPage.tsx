import { compareBigint, type Court, type OngoingDispute, type OngoingList, type Unavailable } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useSearchParams } from "react-router";
import { queryKeys, useOngoing, useOngoingTitle, type SectionData } from "../../data";
import { usePageChain } from "../../routing";
import { EmptyState, Notice, PageMessage, PAGE_TITLE, SectionBoundary, SectionSkeleton, useRevealIn } from "../../ui";
import { FailedDisputeCard, OngoingCard, ScalesIcon } from "./OngoingCard";
import { OtherChainAction, otherSwitchableChain } from "./OtherChainAction";
import { DEFAULT_PERIOD_FILTER, filterFromParam, filterOption, matchesFilter, type PeriodFilter } from "./periodFilter";
import { PeriodFilterSelect } from "./PeriodFilterSelect";

const NO_ARBITRATOR = "There is no arbitrator on this network, thus no disputes.";
const FAILED_TITLE = "Failed to load disputes.";
const PERIOD_PARAM = "period";
const GRID_CLASS = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";

/** A dispute with its struct, or a listed ID whose struct could not be read. */
type Entry = { readonly kind: "dispute"; readonly dispute: OngoingDispute } | { readonly kind: "failed"; readonly id: bigint };

/** Every listed dispute and failed ID in one descending order, so a failed ID keeps its place. */
function entriesOf(list: Extract<OngoingList, { status: "ok" }>): Entry[] {
  const entries: Entry[] = [...list.disputes.map((dispute) => ({ kind: "dispute" as const, dispute })), ...list.failedIds.map((id) => ({ kind: "failed" as const, id }))];
  const idOf = (entry: Entry) => (entry.kind === "dispute" ? entry.dispute.id : entry.id);
  return entries.sort((a, b) => compareBigint(idOf(b), idOf(a)));
}

function NoArbitrator() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <PageMessage title={NO_ARBITRATOR} />
    </div>
  );
}

interface DisputeItemProps {
  readonly chainId: number;
  readonly dispute: OngoingDispute;
  readonly courts: SectionData<readonly Court[]>;
  readonly visible: boolean;
}

/**
 * A grid cell. Its title keeps loading while the filter hides it, so switching back shows it at once; a hidden cell
 * renders no card.
 */
function DisputeItem({ chainId, dispute, courts, visible }: DisputeItemProps) {
  const title = useOngoingTitle(chainId, dispute);
  const queryClient = useQueryClient();
  // Retry drops the title that broke the card and remounts its boundary in the same render, so the new card starts from
  // the loading title rather than re-throwing on the cached one and latching the boundary before the new read lands.
  const [attempt, setAttempt] = useState(0);
  const section = `Dispute ${dispute.id.toString()}`;
  const retry = () => {
    void queryClient.resetQueries({ queryKey: queryKeys.metaEvidence(chainId, dispute.id, dispute.arbitrated) });
    setAttempt((count) => count + 1);
  };
  return (
    <li hidden={!visible} className="min-w-0">
      {visible ? (
        <SectionBoundary key={`${dispute.id.toString()}:${String(attempt)}`} section={section} onRetry={retry}>
          <OngoingCard chainId={chainId} dispute={dispute} title={title} courts={courts} />
        </SectionBoundary>
      ) : null}
    </li>
  );
}

interface DisputeGridProps {
  readonly chainId: number;
  readonly list: Extract<OngoingList, { status: "ok" }>;
  readonly courts: SectionData<readonly Court[]>;
  readonly filter: PeriodFilter;
  /** Set when the list loaded during this mount, so the grid takes over from the skeleton with a reveal. */
  readonly reveal: string | undefined;
}

function DisputeGrid({ chainId, list, courts, filter, reveal }: DisputeGridProps) {
  const entries = entriesOf(list);
  const anyVisible = entries.some((entry) => (entry.kind === "dispute" ? matchesFilter(entry.dispute.period, filter) : filter === "all"));
  return (
    <>
      {anyVisible ? null : <EmptyState title={`No open dispute is in the ${filterOption(filter).label} period.`} />}
      <ul aria-label="Open disputes" className={reveal === undefined ? GRID_CLASS : `${GRID_CLASS} ${reveal}`}>
        {entries.map((entry) =>
          entry.kind === "dispute" ? (
            <DisputeItem key={entry.dispute.id.toString()} chainId={chainId} dispute={entry.dispute} courts={courts} visible={matchesFilter(entry.dispute.period, filter)} />
          ) : (
            <li key={`failed-${entry.id.toString()}`} hidden={filter !== "all"} className="min-w-0">
              {filter === "all" ? <FailedDisputeCard chainId={chainId} disputeId={entry.id} /> : null}
            </li>
          ),
        )}
      </ul>
    </>
  );
}

function FailedNotice({ chainId, error }: { readonly chainId: number; readonly error: Unavailable }) {
  const queryClient = useQueryClient();
  // The list's key depends on whether the courts loaded; resetting both variants refetches whichever is on screen.
  const tryAgain = () => {
    void queryClient.resetQueries({ queryKey: queryKeys.ongoing(chainId, "ok") });
    void queryClient.resetQueries({ queryKey: queryKeys.ongoing(chainId, "none") });
    void queryClient.invalidateQueries({ queryKey: queryKeys.chainTime(chainId) });
  };
  return (
    <div className="flex flex-col items-start gap-3">
      <Notice variant="error" title={FAILED_TITLE} body={error.message} className="w-full" />
      <Button variant="secondary" small text="Try again" onPress={tryAgain} />
    </div>
  );
}

function NoOpenDisputes({ chainId, chainName }: { readonly chainId: number; readonly chainName: string }) {
  const other = otherSwitchableChain(chainId);
  return (
    <EmptyState
      title="There are no open disputes."
      body={`New disputes on ${chainName} will show up here.`}
      icon={<ScalesIcon className="size-6 stroke-klerosUIComponentsPrimaryBlue" />}
      action={other === undefined ? undefined : <OtherChainAction target={other} />}
    />
  );
}

interface ListBodyProps {
  readonly chainId: number;
  readonly chainName: string;
  readonly list: SectionData<OngoingList>;
  readonly courts: SectionData<readonly Court[]>;
  readonly filter: PeriodFilter;
}

function ListBody({ chainId, chainName, list, courts, filter }: ListBodyProps) {
  const reveal = useRevealIn(list.status === "loading");
  if (list.status === "loading") return <SectionSkeleton variant="grid" lines={6} />;
  if (list.status === "unavailable") return <FailedNotice chainId={chainId} error={list.error} />;
  const value = list.value;
  switch (value.status) {
    case "failed":
      return <FailedNotice chainId={chainId} error={value.error} />;
    case "no-arbitrator":
      return null;
    case "ok":
      if (value.disputes.length === 0 && value.failedIds.length === 0) return <NoOpenDisputes chainId={chainId} chainName={chainName} />;
      return <DisputeGrid chainId={chainId} list={value} courts={courts} filter={filter} reveal={reveal} />;
  }
}

/** The list renders as soon as it resolves, each title loading on its own. */
function OngoingDisputes({ chainId, chainName }: { readonly chainId: number; readonly chainName: string }) {
  const { list, courts } = useOngoing(chainId);
  // The filter lives in the address so Back from a case returns to it; changing it replaces the entry instead of adding one.
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = filterFromParam(searchParams.get(PERIOD_PARAM));
  const setFilter = (next: PeriodFilter) => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === DEFAULT_PERIOD_FILTER) params.delete(PERIOD_PARAM);
        else params.set(PERIOD_PARAM, filterOption(next).id);
        return params;
      },
      { replace: true },
    );
  };
  const headingId = useId();
  if (list.status === "ready" && list.value.status === "no-arbitrator") return <NoArbitrator />;
  return (
    <section aria-labelledby={headingId} className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 id={headingId} className={PAGE_TITLE}>
            Ongoing Disputes
          </h1>
          <p className="text-sm text-klerosUIComponentsSecondaryText">Open disputes on {chainName}, newest first.</p>
        </div>
        <SectionBoundary section="Period filter">
          <PeriodFilterSelect value={filter} onChange={setFilter} />
        </SectionBoundary>
      </header>
      <ListBody chainId={chainId} chainName={chainName} list={list} courts={courts} filter={filter} />
    </section>
  );
}

/** Needs no wallet; on a chain without an arbitrator it reads nothing and says so. */
export function OngoingPage() {
  const { chainId, chain, capabilities } = usePageChain();
  return capabilities.hasArbitrator ? <OngoingDisputes chainId={chainId} chainName={chain.name} /> : <NoArbitrator />;
}
