import type { ReactNode, SyntheticEvent } from "react";
import type { Address, ChainConfig, Period, Unavailable } from "@dispute-resolver/core";

export type NoticeVariant = "success" | "warning" | "error" | "info";

export interface NoticeProps {
  readonly variant: NoticeVariant;
  readonly title: string;
  readonly body: string;
  readonly className?: string;
  /** Raises the title, then the body, into view when the notice mounts, and plays the success icon's check as it appears. */
  readonly reveal?: boolean;
}

/**
 * Starts a re-read. Retry stays busy until the returned promise settles: the re-read's own promise, or a settled one
 * when the press swaps the section for its own loading state.
 */
export type RetryHandler = () => Promise<unknown>;

/** Give the boundary a `key` that changes with the dispute, so a failure for one dispute does not persist for the next. */
export interface SectionBoundaryProps {
  readonly section: string;
  readonly children: ReactNode;
  /** The boundary keeps its error, with Retry busy, until the returned promise settles; the caller owns the remount (a new `key`). */
  readonly onRetry?: RetryHandler;
}

export interface SectionUnavailableProps {
  readonly section: string;
  readonly error: Unavailable;
  readonly onRetry?: RetryHandler;
}

export interface RetryButtonProps {
  /** The accessible name, which the busy state would otherwise hide with the text. */
  readonly label: string;
  readonly onRetry: RetryHandler;
  readonly small?: boolean;
}

export interface SectionSkeletonProps {
  /** `text`: lines; `card`: a card with a heading and lines; `grid`: a 3/2/1-column grid of cards; `bars`: collapsed accordion bars. */
  readonly variant: "text" | "card" | "grid" | "bars";
  /** Lines of text (`text`, `card`; default 3), cards (`grid`; default 6) or bars (`bars`; default 3). */
  readonly lines?: number;
}

export interface EmptyStateProps {
  readonly title: string;
  readonly body?: string;
  /** A decorative mark above the title; it is hidden from assistive technology. */
  readonly icon?: ReactNode;
  readonly action?: ReactNode;
}

export interface PageMessageProps {
  readonly title: string;
  readonly body?: string;
  readonly action?: ReactNode;
  /** Halves the space above, for a message that answers a field just above it rather than standing on its own. */
  readonly compact?: boolean;
}

export interface CountdownProps {
  readonly target: number;
  readonly className?: string;
}

export interface AmountProps {
  readonly wei: bigint;
  readonly chain: ChainConfig;
  readonly className?: string;
}

export interface AddressTextProps {
  readonly address: Address;
  readonly chain: ChainConfig;
  readonly className?: string;
  /** Shows all 42 characters, wrapping where the line ends, for a page where the user checks the address before signing. */
  readonly full?: boolean;
}

export interface CopyControlProps {
  /** The copy button's accessible name and its tooltip. */
  readonly label: string;
  readonly content: string;
  /** The wrapper's classes before the copy control's own; `className` follows them. */
  readonly layout: string;
  readonly className?: string;
  readonly copiableClassName?: string;
  /** Sees each press, focus and click inside the control before the control does. */
  readonly onReach?: (event: SyntheticEvent) => void;
  readonly children: ReactNode;
}

/** A decorative 5×5 symmetric grid derived from the address bytes; the address text next to it is the accessible name. */
export interface IdenticonProps {
  readonly address: string;
  readonly size?: number;
  readonly className?: string;
}

export interface PeriodBadgeProps {
  readonly period: Period;
  /** The arbitrator executed the ruling: execution reads Executed, since no period follows it. */
  readonly executed?: boolean;
  readonly size?: "sm" | "lg";
  readonly className?: string;
}
