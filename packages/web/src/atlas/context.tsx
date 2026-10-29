import { createContext, useContext, type ReactNode } from "react";
import type { AtlasUploader } from "./types";

const AtlasUploaderContext = createContext<AtlasUploader | null>(null);

export function AtlasUploaderProvider({ uploader, children }: { readonly uploader: AtlasUploader; readonly children?: ReactNode }) {
  return <AtlasUploaderContext.Provider value={uploader}>{children}</AtlasUploaderContext.Provider>;
}

export function useAtlasUpload(): AtlasUploader {
  const uploader = useContext(AtlasUploaderContext);
  if (uploader === null) throw new Error("useAtlasUpload must be used inside AtlasGate.");
  return uploader;
}
