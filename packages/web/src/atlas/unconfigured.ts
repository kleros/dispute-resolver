import { failure } from "./failures";
import type { AtlasUploader } from "./types";

/**
 * Without `REACT_APP_ATLAS_URI` nothing is requested. Every caller locks its upload control on `availability`, so the
 * uploads below are never reached from the UI; if one is, it fails like any other upload.
 */
export const UNCONFIGURED_UPLOADER: AtlasUploader = Object.freeze({
  availability: "unconfigured",
  phase: "idle",
  isSignedIn: false,
  limits: () => null,
  upload: () => Promise.resolve(failure.uploadFailed(null)),
  uploadJson: () => Promise.resolve(failure.uploadFailed(null)),
});
