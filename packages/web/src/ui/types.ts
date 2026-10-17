import type { ReactNode } from "react";
import type { Address, ChainConfig, Period, Unavailable, UnixSeconds } from "@dispute-resolver/core";

/** The closed set of alert variants (D-14: no `danger`), mapped to the library `AlertMessage`. */
export type NoticeVariant = "success" | "warning" | "error" | "info";

export interface NoticeProps {
  readonly variant: NoticeVariant;
  /** An empty title shows the capitalized variant (spec 2.8). */
  readonly title: string;
  /** Plain text; line breaks are preserved (spec 5.10). */
  readonly body: string;
  readonly className?: string;
}

/**
 * Wraps one independently degradable section (D-36, B12). Give the boundary a `key` that changes with the dispute, so a
 * failure for one dispute does not persist for the next (D-53).
 */
export interface SectionBoundaryProps {
  /** Human-readable section name, shown as "{section} unavailable". */
  readonly section: string;
  readonly children: ReactNode;
  /** Called after the boundary resets, typically to refetch the section's queries. */
  readonly onRetry?: () => void;
}

/** A data failure or a caught render error, with core's reason (no fake data, D-36). */
export interface SectionUnavailableProps {
  readonly section: string;
  readonly error: Unavailable;
  /** When given, a Retry button calls it. */
  readonly onRetry?: () => void;
}

export interface SectionSkeletonProps {
  /**
   * `text`: lines of text; `card`: one card with a heading and lines; `grid`: a 3/2/1-column grid of cards; `bars`:
   * collapsed accordion bars.
   */
  readonly variant: "text" | "card" | "grid" | "bars";
  /** Lines of text (`text`, `card`; default 3), cards (`grid`; default 6) or bars (`bars`; default 3). */
  readonly lines?: number;
}

export interface EmptyStateProps {
  readonly title: string;
  readonly body?: string;
}

/** Full-page states: not found, no arbitrator, the case page without an ID (D-09). */
export interface PageMessageProps {
  readonly title: string;
  readonly body?: string;
  readonly action?: ReactNode;
}

/** Time left until `target` as `DDd HHh MMm` (spec 3, spec 5.7, spec 5.12), on one shared 30 s clock. */
export interface CountdownProps {
  readonly target: UnixSeconds;
  readonly className?: string;
}

/** An amount in wei with the chain's currency symbol (D-10). */
export interface AmountProps {
  readonly wei: bigint;
  readonly chain: ChainConfig;
  readonly className?: string;
}

/** A shortened address with a copy control and, when the chain has one, an explorer link (D-40). */
export interface AddressTextProps {
  readonly address: Address;
  readonly chain: ChainConfig;
  readonly className?: string;
}

/** A decorative 5×5 symmetric grid derived from the address bytes; the address text next to it is the accessible name. */
export interface IdenticonProps {
  readonly address: string;
  /** Edge length in CSS pixels; default 24. */
  readonly size?: number;
  readonly className?: string;
}

/** A colored dot plus the period's name. */
export interface PeriodBadgeProps {
  readonly period: Period;
  /** `dot`: a coloured dot and the period's name (default); `pill`: the same inside the status stamp (contract §7). */
  readonly variant?: "dot" | "pill";
  /** The pill's size (default `sm`); ignored by the `dot` variant. */
  readonly size?: "sm" | "lg";
  readonly className?: string;
}
