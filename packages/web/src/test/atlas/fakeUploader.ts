import { normalizeIpfsPath, type CanonicalIpfsPath } from "@dispute-resolver/core";
import { vi, type Mock } from "vitest";
import type { AtlasUploader, RoleLimits, UploadResult, UploadRole } from "../../atlas";

function canonical(path: string): CanonicalIpfsPath {
  const normalized = normalizeIpfsPath(path);
  if (normalized === null) throw new Error(`${path} is not a canonical IPFS path.`);
  return normalized;
}

/** The CID the fakes answer an upload with. */
export const TEST_UPLOAD_CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

/** The canonical path of `TEST_UPLOAD_CID`, as a successful upload returns it. */
export const TEST_UPLOAD_PATH: CanonicalIpfsPath = canonical(`/ipfs/${TEST_UPLOAD_CID}`);

const MIB = 1024 * 1024;

/** Server-like restrictions: binary files under `evidence`, JSON under `policy`. */
export const TEST_ROLE_LIMITS: Readonly<Record<UploadRole, RoleLimits>> = {
  evidence: { maxSize: 20 * MIB, allowedMimeTypes: ["application/pdf", "image/*", "text/plain"] },
  policy: { maxSize: MIB, allowedMimeTypes: ["application/json"] },
};

/** An `AtlasUploader` whose functions are vitest mocks, so a test can drive and inspect them. */
export interface FakeUploader extends AtlasUploader {
  readonly limits: Mock<AtlasUploader["limits"]>;
  readonly upload: Mock<AtlasUploader["upload"]>;
  readonly uploadJson: Mock<AtlasUploader["uploadJson"]>;
}

/**
 * A ready, signed-in uploader for `TestAtlasProvider`. By default `limits` answers `TEST_ROLE_LIMITS` and every upload
 * succeeds with `TEST_UPLOAD_PATH`; `overrides` replace any member.
 */
export function fakeUploader(overrides: Partial<AtlasUploader> = {}): FakeUploader {
  const uploaded: UploadResult = { ok: true, path: TEST_UPLOAD_PATH };
  return {
    availability: overrides.availability ?? "ready",
    phase: overrides.phase ?? "idle",
    isSignedIn: overrides.isSignedIn ?? true,
    limits: vi.fn(overrides.limits ?? ((role: UploadRole) => TEST_ROLE_LIMITS[role])),
    upload: vi.fn(overrides.upload ?? (() => Promise.resolve(uploaded))),
    uploadJson: vi.fn(overrides.uploadJson ?? (() => Promise.resolve(uploaded))),
  };
}
