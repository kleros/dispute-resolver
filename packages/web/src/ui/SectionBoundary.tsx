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

  private readonly retry = () => {
    this.setState({ failed: false });
    this.props.onRetry?.();
  };

  override render() {
    if (this.state.failed) {
      return <SectionUnavailable section={this.props.section} error={RENDER_FAILURE} onRetry={this.retry} />;
    }
    return <>{this.props.children}</>;
  }
}
