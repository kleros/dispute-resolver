// Test doubles of `runner` (ARCHITECTURE.md §1.5, §7.4). Tests only: nothing under src/ outside tests imports this (C9).
export {
  FAKE_APP_ORIGIN,
  SAMPLE_PARAMS,
  SAMPLE_REDIRECTS,
  createFakeRunnerEnvironment,
  flushMicrotasks,
  runRequest,
  type FakeGlobals,
  type FakeRunnerEnvironment,
  type ScriptApi,
} from "./fakeRunnerEnvironment";
export { createFakeRunnerDocument, settleMacrotasks, type FakeRunnerDocument, type FakeRunnerFrame, type PostedRun } from "./fakeRunnerDocument";
