import { Component } from "react";
import type { Unavailable } from "@dispute-resolver/core";
import { SectionUnavailable } from "./SectionUnavailable";
import type { SectionBoundaryProps } from "./types";

/** A render that throws means the section's data broke an assumption the screen relies on: a bad dispute. */
const RENDER_FAILURE: Unavailable = {
  code: "invalid-data",
  message: "The data for this section is malformed and cannot be displayed.",
};

interface SectionBoundaryState {
  readonly failed: boolean;
}

export class SectionBoundary extends Component<SectionBoundaryProps, SectionBoundaryState> {
  override state: SectionBoundaryState = { failed: false };

  static getDerivedStateFromError(): SectionBoundaryState {
    return { failed: true };
  }

  // With a handler the boundary never resets itself: its caller remounts it with a new key, once the re-read settles or
  // at the press. Resetting at the press here would render the section on the read that broke it.
  private readonly retry = (): Promise<unknown> => {
    const reread = this.props.onRetry?.();
    if (reread !== undefined) return reread;
    this.setState({ failed: false });
    return Promise.resolve();
  };

  override render() {
    if (this.state.failed) {
      return <SectionUnavailable section={this.props.section} error={RENDER_FAILURE} onRetry={this.retry} />;
    }
    return <>{this.props.children}</>;
  }
}
