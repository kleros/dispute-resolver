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
  private mounted = false;

  static getDerivedStateFromError(): SectionBoundaryState {
    return { failed: true };
  }

  override componentDidMount() {
    this.mounted = true;
  }

  override componentWillUnmount() {
    this.mounted = false;
  }

  private readonly reset = () => {
    if (this.mounted) this.setState({ failed: false });
  };

  // Resetting before the re-read settles would render the section on the read that broke it, which throws again and
  // remounts the error with an idle Retry.
  private readonly retry = (): Promise<void> => {
    const reread = this.props.onRetry?.();
    if (reread === undefined) {
      this.reset();
      return Promise.resolve();
    }
    return reread.then(this.reset, this.reset);
  };

  override render() {
    if (this.state.failed) {
      return <SectionUnavailable section={this.props.section} error={RENDER_FAILURE} onRetry={this.retry} />;
    }
    return <>{this.props.children}</>;
  }
}
