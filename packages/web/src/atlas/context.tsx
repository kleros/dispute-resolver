import { createContext, useContext, type ReactNode } from "react";
import type { AtlasUploader } from "./types";

const AtlasUploaderContext = createContext<AtlasUploader | null>(null);

export interface AtlasUploaderProviderProps {
  readonly uploader: AtlasUploader;
  readonly children?: ReactNode;
}

/** Makes `uploader` the one `useAtlasUpload()` returns below it. `AtlasGate` renders it with the real or the unconfigured uploader. */
export function AtlasUploaderProvider({ uploader, children }: AtlasUploaderProviderProps) {
  return <AtlasUploaderContext.Provider value={uploader}>{children}</AtlasUploaderContext.Provider>;
}

/** The Atlas uploader of the enclosing `AtlasGate` (ARCHITECTURE.md §8.2). */
export function useAtlasUpload(): AtlasUploader {
  const uploader = useContext(AtlasUploaderContext);
  if (uploader === null) throw new Error("useAtlasUpload must be used inside AtlasGate.");
  return uploader;
}
