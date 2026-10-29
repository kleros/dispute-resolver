// Plain values only: the runner page's bootstrap imports this file, and it must stay free of React, core and anything
// else.

/** No app route pattern may match this path. */
export const RUNNER_PATH = "/__runner/index.html";

export const RUN_MESSAGE_TYPE = "dr-runner/run";
export const RESULT_MESSAGE_TYPE = "dr-runner/result";
export const ERROR_MESSAGE_TYPE = "dr-runner/error";
export const ACCEPTED_MESSAGE_TYPE = "dr-runner/accepted";
/** A host that does not expect the acknowledgement cannot read this version's first message. */
export const PROTOCOL_VERSION = 2;
/** How long the host waits, from appending the frame, for the page's acknowledgement before the run fails. */
export const ACKNOWLEDGEMENT_WINDOW_MS = 5_000;
