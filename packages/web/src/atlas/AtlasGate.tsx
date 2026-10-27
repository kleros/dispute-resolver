import { AtlasProvider, IpfsProduct, SignupProduct } from "@kleros/kleros-app";
import { useMemo, type ReactNode } from "react";
import { useConfig } from "wagmi";
import { AtlasUploaderProvider } from "./context";
import { failure } from "./failures";
import type { AtlasGateProps, AtlasUploader } from "./types";
import { useLibraryUploader } from "./useLibraryUploader";

/**
 * Without `REACT_APP_ATLAS_URI` nothing is requested. Every caller locks its upload control on `availability`, so the
 * uploads below are never reached from the UI; if one is, it fails like any other upload.
 */
const UNCONFIGURED_UPLOADER: AtlasUploader = Object.freeze({
  availability: "unconfigured",
  phase: "idle",
  isSignedIn: false,
  limits: () => null,
  upload: () => Promise.resolve(failure.uploadFailed(null)),
  uploadJson: () => Promise.resolve(failure.uploadFailed(null)),
});

function LibraryUploaderProvider({ children }: { readonly children?: ReactNode }) {
  const uploader = useLibraryUploader();
  return <AtlasUploaderProvider uploader={uploader}>{children}</AtlasUploaderProvider>;
}

/**
 * With `REACT_APP_ATLAS_URI` set it mounts the library's `AtlasProvider` for `CourtV1`, whose only request at load is the
 * unauthenticated `roles(CourtV1)` query; without it nothing is requested and the uploader reports itself unconfigured,
 * so every upload control stays disabled.
 */
export function AtlasGate({ config, children }: AtlasGateProps) {
  const wagmiConfig = useConfig();
  const { atlasUri } = config;
  const atlasConfig = useMemo(
    () => (atlasUri === null ? null : { uri: atlasUri, signupProduct: SignupProduct.CourtV1, ipfsProduct: IpfsProduct.CourtV1, wagmiConfig }),
    [atlasUri, wagmiConfig],
  );
  if (atlasConfig === null) return <AtlasUploaderProvider uploader={UNCONFIGURED_UPLOADER}>{children}</AtlasUploaderProvider>;
  return (
    <AtlasProvider config={atlasConfig}>
      <LibraryUploaderProvider>{children}</LibraryUploaderProvider>
    </AtlasProvider>
  );
}
