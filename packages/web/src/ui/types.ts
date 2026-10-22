import type { ReactNode } from "react";
import type { Address, ChainConfig, Period, Unavailable, UnixSeconds } from "@dispute-resolver/core";

export type NoticeVariant = "success" | "warning" | "error" | "info";

export interface NoticeProps {
  readonly variant: NoticeVariant;
  /** An empty title shows the capitalized variant. */
  readonly title: string;
  /** Plain text; line breaks are preserved. */
  readonly body: string;
  readonly className?: string;
  /** Raises the title, then the body, into view when the notice mounts, and plays the success icon's check as it appears. */
  readonly reveal?: boolean;
}

/** Give the boundary a `key` that changes with the dispute, so a failure for one dispute does not persist for the next. */
export interface SectionBoundaryProps {
  /** Human-readable section name, shown as "{section} unavailable". */
  readonly section: string;
  readonly children: ReactNode;
  /** Called after the boundary resets, typically to refetch the section's queries. */
  readonly onRetry?: () => void;
}

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
  /** A decorative mark above the title; it is hidden from assistive technology. */
  readonly icon?: ReactNode;
  /** The next step, such as a button, under the text. */
  readonly action?: ReactNode;
}

export interface PageMessageProps {
  readonly title: string;
  readonly body?: string;
  readonly action?: ReactNode;
}

/** Time left until `target` as `DDd HHh MMm`, on one shared 30 s clock. */
export interface CountdownProps {
  readonly target: UnixSeconds;
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

/** A decorative 5×5 symmetric grid derived from the address bytes; the address text next to it is the accessible name. */
export interface IdenticonProps {
  readonly address: string;
  /** Edge length in CSS pixels; default 24. */
  readonly size?: number;
  readonly className?: string;
}

export interface PeriodBadgeProps {
  readonly period: Period;
  /** `dot`: a coloured dot and the period's name (default); `pill`: the same inside the status stamp. */
  readonly variant?: "dot" | "pill";
  /** The pill's size (default `sm`); ignored by the `dot` variant. */
  readonly size?: "sm" | "lg";
  readonly className?: string;
}
