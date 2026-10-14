// Test doubles of `atlas` (ARCHITECTURE.md §1.5). Imported only by tests and other test doubles (C9, lint rule 5).
export { TestAtlasProvider, type TestAtlasProviderProps } from "./TestAtlasProvider";
export { atlasWrapper } from "./atlasWrapper";
export {
  TEST_ATLAS_URI,
  TEST_SERVER_ROLES,
  installFakeAtlasServer,
  type AtlasRequestKind,
  type FakeAtlasServer,
  type FakeAtlasServerOptions,
  type RecordedGraphqlRequest,
  type RecordedUpload,
} from "./fakeAtlasServer";
export { TEST_ROLE_LIMITS, TEST_UPLOAD_CID, TEST_UPLOAD_PATH, fakeUploader, type FakeUploader } from "./fakeUploader";
export { settle } from "./settle";
export { sessionJwt, testJwt } from "./testJwt";
