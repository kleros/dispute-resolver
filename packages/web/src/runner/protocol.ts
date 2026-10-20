// The fixed names shared by the runner page and its host (ADR 0004, ARCHITECTURE.md §7). Plain values only: the page
// bootstrap imports this file, and it must stay free of React, core and anything else (§7.1).

/** Where the runner page is served. No app route pattern matches this path (C3). */
export const RUNNER_PATH = "/__runner/index.html";

export const RUN_MESSAGE_TYPE = "dr-runner/run";
export const RESULT_MESSAGE_TYPE = "dr-runner/result";
export const ERROR_MESSAGE_TYPE = "dr-runner/error";
/** The fixed message the page posts on the run's port as soon as it accepts a request, before anything else (P-16). */
export const ACCEPTED_MESSAGE_TYPE = "dr-runner/accepted";
/** 2 since P-16 added the acknowledgement: a v1 host cannot read a v2 page's first message. */
export const PROTOCOL_VERSION = 2;
/** How long the host waits, from appending the frame, for the page's acknowledgement before the run fails (P-16). */
export const ACKNOWLEDGEMENT_WINDOW_MS = 5_000;
