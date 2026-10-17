import { AtlasProvider, IpfsProduct, SignupProduct } from "@kleros/kleros-app";
import { useMemo, type ReactNode } from "react";
import { useConfig } from "wagmi";
import { AtlasUploaderProvider } from "./context";
import type { AtlasGateProps } from "./types";
import { UNCONFIGURED_UPLOADER } from "./unconfigured";
import { useLibraryUploader } from "./useLibraryUploader";

function LibraryUploaderProvider({ children }: { readonly children?: ReactNode }) {
  const uploader = useLibraryUploader();
  return <AtlasUploaderProvider uploader={uploader}>{children}</AtlasUploaderProvider>;
}

/**
 * The atlas context for everything below it (ARCHITECTURE.md §8.1). With `REACT_APP_ATLAS_URI` set it mounts the library's
 * `AtlasProvider` for `CourtV1`, whose only request at load is the unauthenticated `roles(CourtV1)` query (D-20); without
 * it nothing is requested and uploads report `unconfigured` (D-21).
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
