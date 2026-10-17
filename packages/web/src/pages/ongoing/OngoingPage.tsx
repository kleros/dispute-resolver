import type { ChainId, Court, OngoingDispute, OngoingList, Unavailable } from "@dispute-resolver/core";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { queryKeys, useOngoing, useOngoingTitle, type SectionData } from "../../data";
import { usePageChain } from "../../routing";
import { EmptyState, Notice, PageMessage, PAGE_TITLE, SectionBoundary, SectionSkeleton } from "../../ui";
import { FailedDisputeCard, OngoingCard } from "./OngoingCard";
import { DEFAULT_PERIOD_FILTER, filterOption, matchesFilter, type PeriodFilter } from "./periodFilter";
import { PeriodFilterSelect } from "./PeriodFilterSelect";

const NO_ARBITRATOR = "There is no arbitrator on this network, thus no disputes.";
const FAILED_TITLE = "Failed to load disputes.";
const FAILED_HINT = "There may be a problem with the RPC endpoint. Please refresh the page to try again.";
const GRID_CLASS = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";

/** One grid entry, newest first: a dispute with its struct, or a listed ID whose struct could not be read (§5.5). */
type Entry = { readonly kind: "dispute"; readonly dispute: OngoingDispute } | { readonly kind: "failed"; readonly id: bigint };

/** Whether the list read answered that the chain has no arbitrator (spec §3). */
function hasNoArbitrator(list: SectionData<OngoingList>): boolean {
  return list.status === "ready" && list.value.status === "no-arbitrator";
}

/** Every listed dispute and failed ID in one descending order (spec §3 step 3). */
function entriesOf(list: Extract<OngoingList, { status: "ok" }>): Entry[] {
  const entries: Entry[] = [...list.disputes.map((dispute) => ({ kind: "dispute" as const, dispute })), ...list.failedIds.map((id) => ({ kind: "failed" as const, id }))];
  const idOf = (entry: Entry) => (entry.kind === "dispute" ? entry.dispute.id : entry.id);
  return entries.sort((a, b) => {
    const left = idOf(a);
    const right = idOf(b);
    if (left === right) return 0;
    return left < right ? 1 : -1;
  });
}

function NoArbitrator() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <PageMessage title={NO_ARBITRATOR} />
    </div>
  );
}

interface DisputeItemProps {
  readonly chainId: ChainId;
  readonly dispute: OngoingDispute;
  readonly courts: SectionData<readonly Court[]>;
  readonly visible: boolean;
}

/**
 * A grid cell. Its title keeps loading while the filter hides it, so switching back shows it at once; a hidden cell
 * renders no card, as today (spec §3). A card that throws degrades alone (D-36); Retry reloads its title (S-3).
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
  readonly chainId: ChainId;
  readonly list: Extract<OngoingList, { status: "ok" }>;
  readonly courts: SectionData<readonly Court[]>;
  readonly filter: PeriodFilter;
}

function DisputeGrid({ chainId, list, courts, filter }: DisputeGridProps) {
  const entries = entriesOf(list);
  const anyVisible = entries.some((entry) => (entry.kind === "dispute" ? matchesFilter(entry.dispute.period, filter) : filter === "all"));
  return (
    <>
      {anyVisible ? null : <EmptyState title={`No open dispute is in the ${filterOption(filter).label} period.`} />}
      <ul aria-label="Open disputes" className={GRID_CLASS}>
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

function FailedNotice({ error }: { readonly error: Unavailable }) {
  return <Notice variant="error" title={FAILED_TITLE} body={`${FAILED_HINT}\n${error.message}`} />;
}

interface ListBodyProps {
  readonly chainId: ChainId;
  readonly list: SectionData<OngoingList>;
  readonly courts: SectionData<readonly Court[]>;
  readonly filter: PeriodFilter;
}

function ListBody({ chainId, list, courts, filter }: ListBodyProps) {
  if (list.status === "loading") return <SectionSkeleton variant="grid" lines={6} />;
  if (list.status === "unavailable") return <FailedNotice error={list.error} />;
  const value = list.value;
  switch (value.status) {
    case "failed":
      return <FailedNotice error={value.error} />;
    case "no-arbitrator":
      return null;
    case "ok":
      if (value.disputes.length === 0 && value.failedIds.length === 0) return <EmptyState title="There are no open disputes." />;
      return <DisputeGrid chainId={chainId} list={value} courts={courts} filter={filter} />;
  }
}

/** The Ongoing page of a chain with an arbitrator: the list renders as soon as it resolves, each title on its own (D-37). */
function OngoingDisputes({ chainId, chainName }: { readonly chainId: ChainId; readonly chainName: string }) {
  const { list, courts } = useOngoing(chainId);
  const [filter, setFilter] = useState<PeriodFilter>(DEFAULT_PERIOD_FILTER);
  const headingId = useId();
  if (hasNoArbitrator(list)) return <NoArbitrator />;
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
      <ListBody chainId={chainId} list={list} courts={courts} filter={filter} />
    </section>
  );
}

/**
 * The Ongoing disputes page (spec §3, D-37, ARCHITECTURE.md §5.5, §11.5). It needs no wallet; on a chain without
 * an arbitrator it reads nothing and says so, as today.
 */
export function OngoingPage() {
  const { chainId, chain, capabilities } = usePageChain();
  return capabilities.hasArbitrator ? <OngoingDisputes chainId={chainId} chainName={chain.name} /> : <NoArbitrator />;
}
