import { failure } from "./failures";
import type { AtlasUploader } from "./types";

/** D-21: without `REACT_APP_ATLAS_URI` nothing is requested and every upload reports `unconfigured`. */
export const UNCONFIGURED_UPLOADER: AtlasUploader = Object.freeze({
  availability: "unconfigured",
  phase: "idle",
  isSignedIn: false,
  limits: () => null,
  upload: () => Promise.resolve(failure.unconfigured()),
  uploadJson: () => Promise.resolve(failure.unconfigured()),
});
