import { useState, type ReactNode } from "react";
import { AtlasUploaderProvider, type AtlasUploader } from "../../atlas";
import { fakeUploader } from "./fakeUploader";

export interface TestAtlasProviderProps {
  /** Defaults to `fakeUploader()`. */
  readonly uploader?: AtlasUploader;
  readonly children?: ReactNode;
}

/** The atlas layer for component tests: `useAtlasUpload()` below it returns `uploader`. */
export function TestAtlasProvider({ uploader, children }: TestAtlasProviderProps) {
  const [fallback] = useState(() => fakeUploader());
  return <AtlasUploaderProvider uploader={uploader ?? fallback}>{children}</AtlasUploaderProvider>;
}
