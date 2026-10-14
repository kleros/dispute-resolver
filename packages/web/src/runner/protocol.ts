// The fixed names shared by the runner page and its host (ADR 0004, ARCHITECTURE.md §7). Plain values only: the page
// bootstrap imports this file, and it must stay free of React, core and anything else (§7.1).

/** Where the runner page is served. No app route pattern matches this path (C3). */
export const RUNNER_PATH = "/__runner/index.html";

export const RUN_MESSAGE_TYPE = "dr-runner/run";
export const RESULT_MESSAGE_TYPE = "dr-runner/result";
export const ERROR_MESSAGE_TYPE = "dr-runner/error";
export const PROTOCOL_VERSION = 1;
